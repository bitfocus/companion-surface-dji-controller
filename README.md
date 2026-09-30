# companion-surface-dji-controller

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

## How it talks to the controller

DJI controllers are not HID devices. Over USB they present two CDC-ACM serial ports, and one of
them speaks DJI's DUML protocol. So instead of Companion's HID discovery, the plugin implements
`scanForSurfaces`, groups the two ports back into one controller by serial number, and on open
probes each port until one answers.

The controller only reports when asked. After enabling "simulator mode" (cmd set `0x06`, id `0x24`)
it answers channel requests (cmd set `0x06`, id `0x01`), which are polled every 20 ms. See
[`src/duml.ts`](./src/duml.ts) for the framing and [`src/report.ts`](./src/report.ts) for the
channel layout.

## Development tools

- `yarn probe` opens the controller and prints a line each time a channel slot is pushed away from
  centre and released, with the direction and peak value.
- `yarn probe --frames` prints every other DUML frame the controller sends, once per distinct
  payload. The buttons are not part of the channel reply, so this is how to find them.

The list of supported controllers lives in [`src/products.ts`](./src/products.ts) and is the single
source of truth — `yarn build` regenerates the `usbIds` in `companion/manifest.json` from it.
