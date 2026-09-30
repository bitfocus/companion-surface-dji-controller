import type { SurfaceInputVariable } from '@companion-surface/base'
import type { ControllerAxis } from './models.js'

/** Which transfer variable each analog input reports into */
export const AXIS_VARIABLES: Record<ControllerAxis, string> = {
	leftX: 'leftStickXVariable',
	leftY: 'leftStickYVariable',
	rightX: 'rightStickXVariable',
	rightY: 'rightStickYVariable',
	wheel: 'wheelVariable',
}

const STICK_DESCRIPTION =
	'Ranges from -1 to 1, with 0 at rest. Use an expression to convert it into whatever range you need.'

export const transferVariables: SurfaceInputVariable[] = [
	{
		id: AXIS_VARIABLES.leftX,
		type: 'input',
		name: 'Variable to store Left Stick X to',
		description: `${STICK_DESCRIPTION} Negative is left, positive is right.`,
	},
	{
		id: AXIS_VARIABLES.leftY,
		type: 'input',
		name: 'Variable to store Left Stick Y to',
		description: `${STICK_DESCRIPTION} Negative is down, positive is up.`,
	},
	{
		id: AXIS_VARIABLES.rightX,
		type: 'input',
		name: 'Variable to store Right Stick X to',
		description: `${STICK_DESCRIPTION} Negative is left, positive is right.`,
	},
	{
		id: AXIS_VARIABLES.rightY,
		type: 'input',
		name: 'Variable to store Right Stick Y to',
		description: `${STICK_DESCRIPTION} Negative is down, positive is up.`,
	},
	{
		id: AXIS_VARIABLES.wheel,
		type: 'input',
		name: 'Variable to store Gimbal Wheel to',
		description: `${STICK_DESCRIPTION} The wheel springs back to 0 when released.`,
	},
]
