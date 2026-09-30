import type { ControlKey, ControllerModelInfo, ControlPosition } from './models.js'

export function xyToId(xy: ControlPosition): string {
	return `${xy[1]}/${xy[0]}`
}

export function controlKeyToId(modelInfo: ControllerModelInfo, key: ControlKey): string | undefined {
	const xy = modelInfo.controls[key]
	if (!xy) return undefined

	return xyToId(xy)
}

/** Scale a raw signed reading into -1..1, given the value it reaches at full travel */
export function normaliseSigned(value: number, max: number): number {
	return clamp(value / max, -1, 1)
}

/**
 * Collapse small readings to zero, and rescale what is left so the usable travel still spans
 * the full range. Without this the sticks never quite return to zero when released.
 */
export function applyDeadzone(value: number, deadzone: number): number {
	const magnitude = Math.abs(value)
	if (magnitude <= deadzone) return 0
	if (deadzone >= 1) return 0

	const scaled = (magnitude - deadzone) / (1 - deadzone)
	return value < 0 ? -scaled : scaled
}

export function clamp(value: number, min: number, max: number): number {
	if (value < min) return min
	if (value > max) return max
	return value
}

/** Round to a sensible number of decimal places, so variables don't churn on sensor noise */
export function roundTo(value: number, places: number): number {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}
