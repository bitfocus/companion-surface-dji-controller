/**
 * The controllers we know how to talk to.
 *
 * DJI controllers are not HID devices. Over USB they present a pair of CDC-ACM serial ports and
 * speak DJI's DUML protocol on one of them, so they are found by scanning serial ports rather than
 * through Companion's HID discovery.
 */

export const VENDOR_ID_DJI = 0x2ca3

export enum ControllerModelId {
	RcN1 = 'rc-n1',
}

export interface ControllerProduct {
	vendorId: number
	productId: number
	modelId: ControllerModelId
	name: string
}

export const PRODUCTS: ControllerProduct[] = [
	// RC-N1 (model RC231). Reports itself over USB as "DJI C5".
	{
		vendorId: VENDOR_ID_DJI,
		productId: 0x1020,
		modelId: ControllerModelId.RcN1,
		name: 'DJI RC-N1',
	},
]

export function findProduct(vendorId: number, productId: number): ControllerProduct | undefined {
	return PRODUCTS.find((product) => product.vendorId === vendorId && product.productId === productId)
}
