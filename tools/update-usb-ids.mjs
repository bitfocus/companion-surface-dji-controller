// @ts-check

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line n/no-unpublished-import
import prettier from 'prettier'
// Reads the compiled output, so the product table in src/products.ts stays the single source of
// truth. Both scripts that invoke this — `build` and `build:manifest-usb-ids` — compile first, so
// don't run this file directly on a clean checkout.
// eslint-disable-next-line n/no-unpublished-import
import { PRODUCTS } from '../dist/products.js'

const manifestPath = path.join(import.meta.dirname, '../companion/manifest.json')

/** @type {Map<number, import('@companion-surface/base').SurfaceModuleManifestUsbIds>} */
const usbIdsMap = new Map()

for (const element of PRODUCTS) {
	if (!element) continue

	const entry = usbIdsMap.get(element.vendorId)
	if (!entry) {
		usbIdsMap.set(element.vendorId, {
			vendorId: element.vendorId,
			productIds: [element.productId],
		})
	} else if (!entry.productIds.includes(element.productId)) {
		entry.productIds.push(element.productId)
	}
}

/** @type {import('@companion-surface/base').SurfaceModuleManifest} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const manifestStr = JSON.stringify({
	...manifest,
	usbIds: Array.from(usbIdsMap.values()),
})

const prettierConfig = await prettier.resolveConfig(manifestPath)

const formatted = await prettier.format(manifestStr, {
	...prettierConfig,
	parser: 'json',
})

writeFileSync(manifestPath, formatted)
