import type { ControllerAxis } from './models.js'
import type { DumlFrame } from './duml.js'
import { normaliseSigned } from './util.js'

export interface ControllerState {
	/** All axes are -1..1 with 0 at centre */
	axes: Record<ControllerAxis, number>
}

export function createEmptyState(): ControllerState {
	return {
		axes: {
			leftX: 0,
			leftY: 0,
			rightX: 0,
			rightY: 0,
			wheel: 0,
		},
	}
}

/** DUML device addresses */
const ADDRESS_PC = 0x0a
const ADDRESS_RC = 0x06

const CMD_TYPE_REQUEST = 0x40
const CMD_SET_RC = 0x06
/** Returns the current channel values */
const CMD_GET_CHANNELS = 0x01
/** Enables "simulator mode", without which the controller does not answer channel requests */
const CMD_ENABLE_SIMULATOR = 0x24

export function enableSimulatorFrame(seq: number): DumlFrame {
	return {
		src: ADDRESS_PC,
		dst: ADDRESS_RC,
		seq,
		cmdType: CMD_TYPE_REQUEST,
		cmdSet: CMD_SET_RC,
		cmdId: CMD_ENABLE_SIMULATOR,
		payload: Buffer.from([0x01]),
	}
}

export function getChannelsFrame(seq: number): DumlFrame {
	return {
		src: ADDRESS_PC,
		dst: ADDRESS_RC,
		seq,
		cmdType: CMD_TYPE_REQUEST,
		cmdSet: CMD_SET_RC,
		cmdId: CMD_GET_CHANNELS,
		payload: Buffer.alloc(0),
	}
}

export function isChannelsReply(frame: DumlFrame): boolean {
	return frame.cmdSet === CMD_SET_RC && frame.cmdId === CMD_GET_CHANNELS
}

/**
 * A channel reply carries a status byte, then a run of 3-byte slots, each holding an unsigned
 * 16-bit value one byte in. Sticks sit at 1024 when centred and travel ±660.
 *
 * Slot order was read off an RC-N1 on macOS. The left stick slots are confirmed on hardware; the
 * right stick and wheel follow the order the community has documented and still need checking.
 */
const CHANNEL_SLOTS: Record<ControllerAxis, number> = {
	rightX: 0,
	rightY: 1,
	leftY: 2,
	leftX: 3,
	wheel: 4,
}

const SLOT_STRIDE = 3
const SLOT_OFFSET = 2
const CHANNEL_CENTRE = 1024
const CHANNEL_TRAVEL = 660

export function readChannelSlots(payload: Buffer): number[] {
	const slots: number[] = []
	for (let offset = SLOT_OFFSET; offset + 2 <= payload.length; offset += SLOT_STRIDE) {
		slots.push(payload.readUInt16LE(offset))
	}
	return slots
}

/**
 * Decode a channel reply into `state`, mutating it in place.
 * @returns true if the reply was understood
 */
export function parseChannelsReply(payload: Buffer, state: ControllerState): boolean {
	const slots = readChannelSlots(payload)
	if (slots.length <= Math.max(...Object.values(CHANNEL_SLOTS))) return false

	for (const [axis, slot] of Object.entries(CHANNEL_SLOTS) as [ControllerAxis, number][]) {
		state.axes[axis] = normaliseSigned(slots[slot] - CHANNEL_CENTRE, CHANNEL_TRAVEL)
	}

	return true
}
