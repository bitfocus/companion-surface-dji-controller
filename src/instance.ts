import {
	CardGenerator,
	HostCapabilities,
	SurfaceDrawProps,
	SurfaceContext,
	SurfaceInstance,
	createModuleLogger,
	ModuleLogger,
} from '@companion-surface/base'
import type { SerialPort } from 'serialport'
import { applyDeadzone, controlKeyToId, roundTo } from './util.js'
import {
	type ControlKey,
	type ControllerAxis,
	type ControllerModelInfo,
	type DirectionControl,
	type RotaryControl,
	DIRECTIONS,
	ROTARY_AXES,
} from './models.js'
import { DumlParser, encodeFrame } from './duml.js'
import {
	createEmptyState,
	enableSimulatorFrame,
	getChannelsFrame,
	isChannelsReply,
	parseChannelsReply,
	type ControllerState,
} from './report.js'
import { DEFAULT_CONFIG, parseConfig, type DjiControllerConfig } from './config.js'
import { AXIS_VARIABLES } from './variables.js'

/** Release at this fraction of the press threshold, so a stick held near the edge doesn't chatter */
const RELEASE_RATIO = 0.7

/** Stick travel is bucketed into this many speeds, so small wobbles don't rebuild the repeat timer */
const ROTARY_LEVELS = 8
/** Rotation events per second at the slowest bucket */
const ROTARY_MIN_RATE = 2

/** Analog values are coalesced and sent at most this often, in ms */
const VARIABLE_FLUSH_INTERVAL = 50
const VARIABLE_DECIMALS = 3

/** The controller only reports when asked, so it is polled at this interval, in ms */
const POLL_INTERVAL = 20
/**
 * If no reply arrives for this long, simulator mode is requested again. The controller drops out
 * of it when it is power-cycled while still plugged in.
 */
const REPLY_TIMEOUT = 1000

interface RotaryState {
	/** Signed speed bucket: 0 when centred, otherwise -ROTARY_LEVELS..ROTARY_LEVELS */
	level: number
	interval: ReturnType<typeof setInterval> | undefined
}

export class DjiControllerWrapper implements SurfaceInstance {
	readonly #logger: ModuleLogger

	readonly #port: SerialPort
	readonly #parser = new DumlParser()
	readonly #modelInfo: ControllerModelInfo
	readonly #productName: string

	readonly #surfaceId: string
	readonly #context: SurfaceContext

	#config: DjiControllerConfig = { ...DEFAULT_CONFIG }

	readonly #state: ControllerState = createEmptyState()
	/** Logical pressed state per control, after thresholding — the source of truth for key events */
	readonly #pressed = new Map<ControlKey, boolean>()
	readonly #rotaries = new Map<RotaryControl, RotaryState>()

	readonly #pendingVariables = new Map<string, number>()
	readonly #sentVariables = new Map<string, number>()
	#variableFlush: ReturnType<typeof setTimeout> | undefined

	#seq = 0
	#poll: ReturnType<typeof setInterval> | undefined
	#lastReply = Date.now()

	#closed = false

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return this.#productName
	}

	public constructor(
		surfaceId: string,
		port: SerialPort,
		info: ControllerModelInfo,
		productName: string,
		context: SurfaceContext,
	) {
		this.#logger = createModuleLogger(`Instance/${surfaceId}`)
		this.#port = port
		this.#modelInfo = info
		this.#productName = productName
		this.#surfaceId = surfaceId
		this.#context = context

		this.#port.on('data', (data: Buffer) => {
			if (this.#closed) return

			for (const frame of this.#parser.push(data)) {
				// The controller also pushes status frames of its own accord, which carry nothing we use
				if (!isChannelsReply(frame)) continue

				if (!parseChannelsReply(frame.payload, this.#state)) {
					this.#logger.debug(`Ignoring unrecognised channel reply of ${frame.payload.length} bytes`)
					continue
				}

				this.#lastReply = Date.now()
				this.#applyState()
			}
		})

		this.#port.on('error', (error: Error) => this.#fail(error))
		this.#port.on('close', () => this.#fail(new Error('Serial port closed')))
	}

	#fail(error: Error): void {
		if (this.#closed) return
		this.#closed = true

		this.#logger.error(`Controller error: ${error}`)
		this.#stopAllTimers()
		this.#context.disconnect(error)
	}

	#send(frame: ReturnType<typeof getChannelsFrame>): void {
		this.#port.write(encodeFrame(frame))
		this.#seq = (this.#seq + 1) & 0xffff
	}

	#startPolling(): void {
		if (this.#poll !== undefined || this.#closed) return

		this.#send(enableSimulatorFrame(this.#seq))
		this.#lastReply = Date.now()

		this.#poll = setInterval(() => {
			if (Date.now() - this.#lastReply > REPLY_TIMEOUT) {
				this.#logger.debug('No reply from controller, re-enabling simulator mode')
				this.#send(enableSimulatorFrame(this.#seq))
				this.#lastReply = Date.now()
			}
			this.#send(getChannelsFrame(this.#seq))
		}, POLL_INTERVAL)
	}

	/** Push the current controller state out as key, rotation and variable events */
	#applyState(): void {
		this.#applyDirections()
		this.#applyRotaries()
		this.#applyVariables()
	}

	#applyDirections(): void {
		for (const [control, { axis, negative }] of Object.entries(DIRECTIONS) as [
			DirectionControl,
			{ axis: ControllerAxis; negative: boolean },
		][]) {
			const value = applyDeadzone(this.#state.axes[axis], this.#config.stickDeadzone)
			// Each direction only sees travel towards its own end of the axis
			const travel = negative ? Math.max(-value, 0) : Math.max(value, 0)
			this.#setPressed(control, this.#isPastThreshold(control, travel))
		}
	}

	#applyRotaries(): void {
		for (const [control, axis] of Object.entries(ROTARY_AXES) as [RotaryControl, ControllerAxis][]) {
			const value = applyDeadzone(this.#state.axes[axis], this.#config.stickDeadzone)
			const magnitude = Math.abs(value)
			const level = magnitude === 0 ? 0 : Math.ceil(magnitude * ROTARY_LEVELS) * Math.sign(value)

			this.#setRotaryLevel(control, level)
		}
	}

	#applyVariables(): void {
		for (const [axis, variableId] of Object.entries(AXIS_VARIABLES) as [ControllerAxis, string][]) {
			const value = roundTo(applyDeadzone(this.#state.axes[axis], this.#config.stickDeadzone), VARIABLE_DECIMALS)
			if (this.#sentVariables.get(variableId) === value) continue

			this.#pendingVariables.set(variableId, value)
		}

		this.#scheduleVariableFlush()
	}

	/**
	 * Apply the press threshold with hysteresis: it takes the full threshold to press, but a
	 * lower one to release again.
	 */
	#isPastThreshold(key: ControlKey, magnitude: number): boolean {
		const wasPressed = this.#pressed.get(key) ?? false

		return wasPressed
			? magnitude > this.#config.pressThreshold * RELEASE_RATIO
			: magnitude >= this.#config.pressThreshold
	}

	#setPressed(key: ControlKey, pressed: boolean): void {
		if ((this.#pressed.get(key) ?? false) === pressed) return
		this.#pressed.set(key, pressed)

		const controlId = controlKeyToId(this.#modelInfo, key)
		if (!controlId) return

		if (pressed) {
			this.#context.keyDownById(controlId)
		} else {
			this.#context.keyUpById(controlId)
		}
	}

	#setRotaryLevel(control: RotaryControl, level: number): void {
		const existing = this.#rotaries.get(control)
		const previousLevel = existing?.level ?? 0
		if (previousLevel === level) return

		if (existing?.interval !== undefined) clearInterval(existing.interval)

		const controlId = controlKeyToId(this.#modelInfo, control)
		if (level === 0 || !controlId) {
			this.#rotaries.set(control, { level, interval: undefined })
			return
		}

		const rotateRight = level > 0
		const emit = () => {
			if (rotateRight) {
				this.#context.rotateRightById(controlId)
			} else {
				this.#context.rotateLeftById(controlId)
			}
		}

		// Fire immediately when leaving centre or reversing, so the first nudge feels instant
		if (previousLevel === 0 || Math.sign(previousLevel) !== Math.sign(level)) emit()

		const maxRate = this.#config.rotaryMaxRate
		const minRate = Math.min(ROTARY_MIN_RATE, maxRate)
		const rate = minRate + (maxRate - minRate) * (Math.abs(level) / ROTARY_LEVELS)

		this.#rotaries.set(control, { level, interval: setInterval(emit, 1000 / rate) })
	}

	#scheduleVariableFlush(): void {
		if (this.#variableFlush !== undefined || this.#pendingVariables.size === 0) return

		this.#variableFlush = setTimeout(() => {
			this.#variableFlush = undefined
			if (this.#closed) return

			for (const [variableId, value] of this.#pendingVariables) {
				this.#sentVariables.set(variableId, value)
				this.#context.sendVariableValue(variableId, value)
			}
			this.#pendingVariables.clear()
		}, VARIABLE_FLUSH_INTERVAL)
	}

	#stopRotaries(): void {
		for (const [control, rotary] of this.#rotaries) {
			if (rotary.interval !== undefined) clearInterval(rotary.interval)
			this.#rotaries.set(control, { level: 0, interval: undefined })
		}
	}

	#stopAllTimers(): void {
		this.#stopRotaries()

		if (this.#poll !== undefined) {
			clearInterval(this.#poll)
			this.#poll = undefined
		}
		if (this.#variableFlush !== undefined) {
			clearTimeout(this.#variableFlush)
			this.#variableFlush = undefined
		}
	}

	async init(): Promise<void> {
		// The port was opened before this instance was constructed
	}

	async close(): Promise<void> {
		this.#closed = true
		this.#stopAllTimers()

		await new Promise<void>((resolve) => {
			this.#port.close((e) => {
				if (e) this.#logger.error(`Failed to close controller: ${e}`)
				resolve()
			})
		})
	}

	async updateConfig(config: Record<string, any>): Promise<void> {
		this.#config = parseConfig(config)
		this.#logger.debug(
			`Config updated: deadzone ${this.#config.stickDeadzone}, threshold ${this.#config.pressThreshold}, max rate ${this.#config.rotaryMaxRate}`,
		)

		// Rebuild from the current state so the new deadzone and rates take effect at once,
		// rather than waiting for the next time something moves
		this.#stopRotaries()
		this.#applyState()
	}

	async ready(): Promise<void> {
		this.#startPolling()
	}

	updateCapabilities(_capabilities: HostCapabilities): void {
		// Not used
	}

	async setBrightness(_percent: number): Promise<void> {
		// No display to dim
	}
	async blank(): Promise<void> {
		// No display to blank
	}
	async draw(_signal: AbortSignal, _drawProps: SurfaceDrawProps): Promise<void> {
		// No display to draw to
	}
	async showStatus(_signal: AbortSignal, _cardGenerator: CardGenerator): Promise<void> {
		// No display to show status on
	}
}
