/**
 * How the controller's inputs are arranged onto the Companion surface grid.
 *
 * The controller has no display, so the grid is purely a naming scheme for bindings. Rows are
 * grouped by control, as the Xbox controller surface does:
 *
 *          col 0     col 1     col 2     col 3     col 4     col 5
 *   row 0  LS-Up     LS-Down   LS-Left   LS-Right  LS-X      LS-Y
 *   row 1  RS-Up     RS-Down   RS-Left   RS-Right  RS-X      RS-Y
 *   row 2  Wheel-Up  Wheel-Dn  Wheel
 *
 * The analog inputs appear twice on purpose, because the two treatments suit different jobs:
 * the direction cells act as buttons once the stick is pushed past a threshold (good for nudging
 * a PTZ camera), while the X/Y and Wheel cells emit repeating rotation events at a rate
 * proportional to how far the stick is pushed (good for scrubbing or volume).
 *
 * The gimbal wheel springs back to centre, so it is treated as a third single-axis stick.
 *
 * The physical buttons are not mapped yet: they are not part of the channel reply, and which
 * DUML message carries them has still to be worked out.
 */

/** [column, row] — the same ordering the Contour Shuttle surface uses, reversed from the admin UI */
export type ControlPosition = [number, number]

/** The analog inputs, all -1..1 */
export type ControllerAxis = 'leftX' | 'leftY' | 'rightX' | 'rightY' | 'wheel'

/** Analog inputs act as buttons once pushed past a threshold */
export type DirectionControl =
	| 'leftStickUp'
	| 'leftStickDown'
	| 'leftStickLeft'
	| 'leftStickRight'
	| 'rightStickUp'
	| 'rightStickDown'
	| 'rightStickLeft'
	| 'rightStickRight'
	| 'wheelUp'
	| 'wheelDown'

/** Analog inputs also drive a rotary control, which emits repeating rotation events */
export type RotaryControl =
	'leftStickXRotary' | 'leftStickYRotary' | 'rightStickXRotary' | 'rightStickYRotary' | 'wheelRotary'

export type ControlKey = DirectionControl | RotaryControl

export interface ControllerModelInfo {
	controls: Record<ControlKey, ControlPosition>
}

/**
 * Which axis and sign each direction button watches. Axes are normalised so that up and right
 * are positive, so `negative` marks the down and left directions.
 */
export const DIRECTIONS: Record<DirectionControl, { axis: ControllerAxis; negative: boolean }> = {
	leftStickUp: { axis: 'leftY', negative: false },
	leftStickDown: { axis: 'leftY', negative: true },
	leftStickLeft: { axis: 'leftX', negative: true },
	leftStickRight: { axis: 'leftX', negative: false },
	rightStickUp: { axis: 'rightY', negative: false },
	rightStickDown: { axis: 'rightY', negative: true },
	rightStickLeft: { axis: 'rightX', negative: true },
	rightStickRight: { axis: 'rightX', negative: false },
	wheelUp: { axis: 'wheel', negative: false },
	wheelDown: { axis: 'wheel', negative: true },
}

/** Which axis each rotary control follows */
export const ROTARY_AXES: Record<RotaryControl, ControllerAxis> = {
	leftStickXRotary: 'leftX',
	leftStickYRotary: 'leftY',
	rightStickXRotary: 'rightX',
	rightStickYRotary: 'rightY',
	wheelRotary: 'wheel',
}

export const rcN1Info: ControllerModelInfo = {
	controls: {
		// row 0 — left stick
		leftStickUp: [0, 0],
		leftStickDown: [1, 0],
		leftStickLeft: [2, 0],
		leftStickRight: [3, 0],
		leftStickXRotary: [4, 0],
		leftStickYRotary: [5, 0],

		// row 1 — right stick
		rightStickUp: [0, 1],
		rightStickDown: [1, 1],
		rightStickLeft: [2, 1],
		rightStickRight: [3, 1],
		rightStickXRotary: [4, 1],
		rightStickYRotary: [5, 1],

		// row 2 — gimbal wheel
		wheelUp: [0, 2],
		wheelDown: [1, 2],
		wheelRotary: [2, 2],
	},
}
