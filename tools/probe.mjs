// @ts-check
//
// Open the controller and print what it reports, for working out which bytes a control lives in.
//
//   yarn probe            print a line each time a channel slot is pushed away from centre and back
//   yarn probe --frames   print every DUML message whenever its payload changes, with the changed
//                         bytes bracketed. Keep the sticks still and press one button at a time.
//
// Reads the compiled output, so `yarn probe` builds first.

/* eslint-disable n/no-unpublished-import */
import { SerialPort } from 'serialport'
import { DumlParser, encodeFrame } from '../dist/duml.js'
import { enableSimulatorFrame, getChannelsFrame, isChannelsReply, readChannelSlots } from '../dist/report.js'
import { findProduct } from '../dist/products.js'

const showFrames = process.argv.includes('--frames')

const ports = (await SerialPort.list()).filter(
	(p) => p.vendorId && p.productId && findProduct(parseInt(p.vendorId, 16), parseInt(p.productId, 16)),
)
if (ports.length === 0) {
	throw new Error('No DJI controller found. Is it switched on, and plugged in with a data cable?')
}

/** @param {string} path */
async function tryPort(path) {
	const port = new SerialPort({ path, baudRate: 115200 })
	const parser = new DumlParser()
	let seq = 0

	// The controller can take over a second to answer after being let go of abruptly, so keep asking
	const answered = await new Promise((resolve) => {
		const ask = () => {
			port.write(encodeFrame(enableSimulatorFrame(seq++)))
			port.write(encodeFrame(getChannelsFrame(seq++)))
		}
		const retry = setInterval(ask, 100)
		const timeout = setTimeout(() => {
			clearInterval(retry)
			resolve(false)
		}, 1500)
		port.on('data', (data) => {
			if (parser.push(data).some(isChannelsReply)) {
				clearInterval(retry)
				clearTimeout(timeout)
				resolve(true)
			}
		})
		port.on('open', ask)
	})
	port.removeAllListeners('data')

	if (!answered) {
		await new Promise((resolve) => port.close(resolve))
		return undefined
	}
	return { port, parser, seq }
}

let found
for (const { path } of ports.sort((a, b) => a.path.localeCompare(b.path))) {
	found = await tryPort(path)
	if (found) {
		console.error(`Listening on ${path}. Ctrl-C to stop.`)
		break
	}
}
if (!found) {
	throw new Error(`Controller did not answer on ${ports.map((p) => p.path).join(', ')}`)
}

const { port, parser } = found
let { seq } = found
const seen = new Set()

/** A slot counts as moved once it is this far from centre, and as back once within half of it */
const MOVE_THRESHOLD = 300
/** Per slot: which way it is currently deflected (-1, 0, 1), and the furthest value reached */
/** @type {{ side: number, peak: number }[]} */
const slotState = []

/** Print one line per movement, so there is a record to read back afterwards */
function logSlotMovements(/** @type {number[]} */ slots) {
	const time = new Date().toLocaleTimeString()
	slots.forEach((value, i) => {
		const state = (slotState[i] ??= { side: 0, peak: 1024 })
		const offset = value - 1024

		if (state.side === 0 && Math.abs(offset) >= MOVE_THRESHOLD) {
			state.side = Math.sign(offset)
			state.peak = value
		} else if (state.side !== 0) {
			if (state.side * offset > state.side * (state.peak - 1024)) state.peak = value
			if (state.side * offset < MOVE_THRESHOLD / 2) {
				console.log(`${time}  slot ${i} went ${state.side > 0 ? 'HIGH' : 'LOW '} (peak ${state.peak})`)
				state.side = 0
			}
		}
	})
}

/** Last payload seen per message type, so only changes are printed */
const lastPayload = new Map()
const hex = (/** @type {number} */ n) => n.toString(16).padStart(2, '0')

/**
 * Print a message whenever its payload differs from the last one of the same type, with the
 * changed bytes bracketed. Keep the sticks still, and each button press shows up as a change.
 */
function logFrameChange(/** @type {import('../dist/duml.js').DumlFrame} */ frame) {
	const key = `src ${hex(frame.src)} set ${hex(frame.cmdSet)} id ${hex(frame.cmdId)}`
	const previous = lastPayload.get(key)
	lastPayload.set(key, frame.payload)
	if (previous && previous.equals(frame.payload)) return

	const bytes = [...frame.payload].map((b, i) => (previous && previous[i] !== b ? `[${hex(b)}]` : hex(b)))
	const label = previous ? 'changed' : 'first  '
	console.log(`${new Date().toLocaleTimeString()}  ${key}  ${label}  ${bytes.join(' ')}`)
	seen.add(key)
}

port.on('data', (data) => {
	for (const frame of parser.push(data)) {
		if (showFrames) {
			logFrameChange(frame)
		} else if (isChannelsReply(frame)) {
			logSlotMovements(readChannelSlots(frame.payload))
		}
	}
})

setInterval(() => port.write(encodeFrame(getChannelsFrame(seq++ & 0xffff))), 20)
