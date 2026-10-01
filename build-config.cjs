module.exports = {
	forceRemoveNodeGypFromPkg: true,
	// Can't use prebuilds: @serialport/bindings-cpp loads them from join(__dirname, '../'), which escapes pkg/ once bundled.
	// The object form is required for the build to install it into the package.
	externals: [{ '@serialport/bindings-cpp': 'commonjs @serialport/bindings-cpp' }],
}
