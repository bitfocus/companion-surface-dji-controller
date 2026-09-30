import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { xyToId } from './util.js'
import type { ControllerModelInfo } from './models.js'

export function createSurfaceSchema(info: ControllerModelInfo): SurfaceSchemaLayoutDefinition {
	const surfaceLayout: SurfaceSchemaLayoutDefinition = {
		stylePresets: {
			default: {
				// A gamepad has nothing to draw on, so no styling is requested
			},
		},
		controls: {},
	}

	for (const xy of Object.values(info.controls)) {
		surfaceLayout.controls[xyToId(xy)] = {
			row: xy[1],
			column: xy[0],
		}
	}

	return surfaceLayout
}
