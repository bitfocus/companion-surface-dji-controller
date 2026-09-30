import type { SomeCompanionInputField } from '@companion-surface/base'

export interface DjiControllerConfig {
	/** Readings within this fraction of centre are treated as zero */
	stickDeadzone: number
	/** How far a stick or the wheel must travel before its button counts as pressed */
	pressThreshold: number
	/** Rotation events per second when a stick is pushed all the way */
	rotaryMaxRate: number
}

export const DEFAULT_CONFIG: DjiControllerConfig = {
	stickDeadzone: 0.15,
	pressThreshold: 0.5,
	rotaryMaxRate: 15,
}

export const configFields: SomeCompanionInputField[] = [
	{
		id: 'stickDeadzone',
		type: 'number',
		label: 'Stick deadzone (%)',
		description:
			'Stick movement smaller than this is ignored, so a worn stick does not drift when released. Raise it if the sticks report movement when you are not touching them.',
		default: 15,
		min: 0,
		max: 50,
		step: 1,
	},
	{
		id: 'pressThreshold',
		type: 'number',
		label: 'Press threshold (%)',
		description:
			'How far a stick or the gimbal wheel must be pushed before its button counts as pressed. Releasing happens a little below this to stop it chattering.',
		default: 50,
		min: 10,
		max: 95,
		step: 5,
	},
	{
		id: 'rotaryMaxRate',
		type: 'number',
		label: 'Max rotation rate (per second)',
		description:
			'The stick rotary controls repeat faster the further the stick is pushed. This is the rate when it is pushed all the way.',
		default: 15,
		min: 1,
		max: 50,
		step: 1,
	},
]

export function parseConfig(config: Record<string, any> | undefined): DjiControllerConfig {
	if (!config) return { ...DEFAULT_CONFIG }

	return {
		stickDeadzone: percentToFraction(config.stickDeadzone, DEFAULT_CONFIG.stickDeadzone, 0, 50),
		pressThreshold: percentToFraction(config.pressThreshold, DEFAULT_CONFIG.pressThreshold, 10, 95),
		rotaryMaxRate: numberOr(config.rotaryMaxRate, DEFAULT_CONFIG.rotaryMaxRate, 1, 50),
	}
}

function percentToFraction(value: unknown, fallback: number, minPercent: number, maxPercent: number): number {
	const parsed = numberOr(value, fallback * 100, minPercent, maxPercent)
	return parsed / 100
}

function numberOr(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return Math.min(Math.max(parsed, min), max)
}
