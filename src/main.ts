import {
	createModuleLogger,
	type DetectionSurfaceInfo,
	type OpenSurfaceResult,
	type SurfaceContext,
	type SurfacePlugin,
} from '@companion-surface/base'
import { SerialPort } from 'serialport'
import { DjiControllerWrapper } from './instance.js'
import { createSurfaceSchema } from './surface-schema.js'
import { rcN1Info } from './models.js'
import { findProduct, type ControllerProduct } from './products.js'
import { configFields } from './config.js'
import { transferVariables } from './variables.js'
import { DumlParser, encodeFrame } from './duml.js'
import { enableSimulatorFrame, getChannelsFrame, isChannelsReply } from './report.js'

const logger = createModuleLogger('Plugin')

const BAUD_RATE = 115200
/**
 * How long to wait for a port to answer before trying the next one, in ms. The controller can take
 * over a second to respond after the previous owner of the port let go of it abruptly, so the
 * request is repeated every PROBE_RETRY until then.
 */
const PROBE_TIMEOUT = 1500
const PROBE_RETRY = 100

export interface DjiControllerInfo {
	product: ControllerProduct
	serialNumber: string | undefined
	/** Every serial port the controller presents. Only one of them speaks DUML. */
	paths: string[]
}

/**
 * The controller presents two serial ports with the same serial number, and only one answers.
 * Group them back into a single controller.
 */
async function scanForControllers(): Promise<DetectionSurfaceInfo<DjiControllerInfo>[]> {
	const controllers = new Map<string, DjiControllerInfo>()

	for (const port of await SerialPort.list()) {
		if (!port.vendorId || !port.productId) continue

		const product = findProduct(parseInt(port.vendorId, 16), parseInt(port.productId, 16))
		if (!product) continue

		const key = port.serialNumber ?? port.locationId ?? port.path
		const existing = controllers.get(key)
		if (existing) {
			existing.paths.push(port.path)
		} else {
			controllers.set(key, { product, serialNumber: port.serialNumber, paths: [port.path] })
		}
	}

	return Array.from(controllers.entries(), ([key, info]) => {
		info.paths.sort()
		logger.debug(`Found ${info.product.name} at ${info.paths.join(', ')}`)

		return {
			surfaceId: info.serialNumber ? `dji:${info.serialNumber}` : `dji:${info.product.modelId}`,
			surfaceIdIsNotUnique: !info.serialNumber,
			description: info.product.name,
			pluginInfo: info,
			deviceHandle: key,
		}
	})
}

async function openPort(path: string): Promise<SerialPort> {
	return new Promise((resolve, reject) => {
		const port = new SerialPort({ path, baudRate: BAUD_RATE, autoOpen: false })
		port.open((e) => (e ? reject(e) : resolve(port)))
	})
}

async function closePort(port: SerialPort): Promise<void> {
	return new Promise((resolve) => {
		port.close(() => resolve())
	})
}

/** Resolve true if the port answers a channel request, i.e. it is the one that speaks DUML */
async function probePort(port: SerialPort): Promise<boolean> {
	const parser = new DumlParser()

	return new Promise((resolve) => {
		const onData = (data: Buffer) => {
			if (parser.push(data).some(isChannelsReply)) finish(true)
		}
		let seq = 0
		const ask = () => {
			port.write(encodeFrame(enableSimulatorFrame(seq++)))
			port.write(encodeFrame(getChannelsFrame(seq++)))
		}
		const retry = setInterval(ask, PROBE_RETRY)
		const timeout = setTimeout(() => finish(false), PROBE_TIMEOUT)
		const finish = (answered: boolean) => {
			clearInterval(retry)
			clearTimeout(timeout)
			port.off('data', onData)
			resolve(answered)
		}

		port.on('data', onData)
		ask()
	})
}

async function openControllerPort(info: DjiControllerInfo): Promise<SerialPort> {
	for (const path of info.paths) {
		let port: SerialPort
		try {
			port = await openPort(path)
		} catch (e) {
			logger.debug(`Failed to open ${path}: ${e}`)
			continue
		}

		if (await probePort(port)) return port

		logger.debug(`${path} did not answer, trying the next port`)
		await closePort(port)
	}

	throw new Error(`${info.product.name} did not answer on any of ${info.paths.join(', ')}`)
}

const DjiControllerPlugin: SurfacePlugin<DjiControllerInfo> = {
	init: async (): Promise<void> => {
		// Not used
	},
	destroy: async (): Promise<void> => {
		// Not used
	},

	scanForSurfaces: scanForControllers,

	openSurface: async (
		surfaceId: string,
		pluginInfo: DjiControllerInfo,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const productName = pluginInfo.product.name

		logger.debug(`Opening ${productName} (${surfaceId})`)

		const port = await openControllerPort(pluginInfo)
		try {
			return {
				surface: new DjiControllerWrapper(surfaceId, port, rcN1Info, productName, context),
				registerProps: {
					brightness: false,
					surfaceLayout: createSurfaceSchema(rcN1Info),
					pincodeMap: null,
					configFields,
					transferVariables,
					location: null,
				},
			}
		} catch (e) {
			await closePort(port)
			throw e
		}
	},
}
export default DjiControllerPlugin
