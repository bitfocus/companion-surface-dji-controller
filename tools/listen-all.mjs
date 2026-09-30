// @ts-check
//
// Listen on every serial port the controller presents at once, for finding controls that are not
// in the channel reply. The port that speaks DUML is polled as usual so the controller stays in
// simulator mode; the others are only listened to, never written.
//
//   node tools/listen-all.mjs
//
// Anything arriving on a quiet port is printed raw, since its framing is unknown. On the DUML port,
// each message type is printed whenever its payload changes, with the changed bytes bracketed.

/* eslint-disable n/no-unpublished-import */
import { SerialPort } from 'serialport'
import { DumlParser, encodeFrame } from '../dist/duml.js'
import { enableSimulatorFrame, getChannelsFrame, isChannelsReply } from '../dist/report.js'
import { findProduct } from '../dist/products.js'

const hex = (/** @type {number} */ n) => n.toString(16).padStart(2, '0')
const time = () => new Date().toLocaleTimeString()

const infos = (await SerialPort.list()).filter(
	(p) => p.vendorId && p.productId && findProduct(parseInt(p.vendorId, 16), parseInt(p.productId, 16)),
)
if (infos.length === 0) throw new Error('No DJI controller found')

const ports = await Promise.all(
	infos.map(
		(info) =>
			new Promise((resolve, reject) => {
				const port = new SerialPort({ path: info.path, baudRate: 115200, autoOpen: false })
				port.open((e) => (e ? reject(e) : resolve(port)))
			}),
	),
)

/** @type {import('serialport').SerialPort | undefined} */
let dumlPort
let seq = 0
const lastPayload = new Map()

for (const port of /** @type {import('serialport').SerialPort[]} */ (ports)) {
	const name = port.path.replace(/^.*usbmodem/, '')
	const parser = new DumlParser()

	port.on('data', (/** @type {Buffer} */ data) => {
		const frames = parser.push(data)

		if (frames.some(isChannelsReply) && !dumlPort) {
			dumlPort = port
			console.log(`${time()}  [${name}] is the DUML port`)
		}

		if (port !== dumlPort) {
			// Unknown framing, so show everything
			console.log(`${time()}  [${name}] raw  ${data.toString('hex').replace(/(..)(?!$)/g, '$1 ')}`)
			return
		}

		for (const frame of frames) {
			const key = `src ${hex(frame.src)} set ${hex(frame.cmdSet)} id ${hex(frame.cmdId)}`
			const previous = lastPayload.get(key)
			lastPayload.set(key, frame.payload)
			if (previous && previous.equals(frame.payload)) continue

			const bytes = [...frame.payload].map((b, i) => (previous && previous[i] !== b ? `[${hex(b)}]` : hex(b)))
			console.log(`${time()}  [${name}] ${key}  ${previous ? 'changed' : 'first  '}  ${bytes.join(' ')}`)
		}
	})
	port.on('error', (e) => console.log(`${time()}  [${name}] error: ${e.message}`))
}

// Until the DUML port is known, ask on the first port only; the others stay listen-only
const askPort = /** @type {import('serialport').SerialPort[]} */ (ports).sort((a, b) => a.path.localeCompare(b.path))[0]
askPort.write(encodeFrame(enableSimulatorFrame(seq++)))

setInterval(() => {
	const port = dumlPort ?? askPort
	if (!dumlPort) port.write(encodeFrame(enableSimulatorFrame(seq++)))
	port.write(encodeFrame(getChannelsFrame(seq++ & 0xffff)))
}, 20)

console.log(`${time()}  Listening on ${ports.length} ports. Keep the sticks still. Ctrl-C to stop.`)
