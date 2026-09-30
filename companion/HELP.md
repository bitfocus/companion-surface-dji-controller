## DJI Remote Controller

Use a DJI drone remote controller as a Companion surface — no drone needed.

Supported controllers:

- DJI RC-N1 (model RC231, shows up over USB as "DJI C5")

### Connecting the controller

Plug the controller into the computer with a USB-C **data** cable, using the port on the bottom of
the controller, and switch it on. Many USB-C cables only carry power; if the controller doesn't
appear, try another cable. The controller has no Bluetooth, so USB is the only option.

### Controls

The controller has no display, so the grid is just a set of named inputs for binding actions to:

|           | col 0    | col 1      | col 2   | col 3    | col 4 | col 5 |
| --------- | -------- | ---------- | ------- | -------- | ----- | ----- |
| **row 0** | LS Up    | LS Down    | LS Left | LS Right | LS X  | LS Y  |
| **row 1** | RS Up    | RS Down    | RS Left | RS Right | RS X  | RS Y  |
| **row 2** | Wheel Up | Wheel Down | Wheel   |          |       |       |

- **Direction cells** (Up, Down, Left, Right) act as buttons once the stick is pushed past the press
  threshold. Good for nudging a PTZ camera.
- **Rotary cells** (X, Y, Wheel) emit repeating rotate left/right events, faster the further the
  stick is pushed. Good for scrubbing, zoom or volume.
- **Variables**: each stick axis and the gimbal wheel can be stored into a custom variable, from -1
  to 1. Use these for proportional control, such as pan/tilt speed.

The physical buttons are not supported yet.

### Settings

- **Stick deadzone** — movement smaller than this is ignored.
- **Press threshold** — how far a stick must travel before its direction cell counts as pressed.
- **Max rotation rate** — rotate events per second at full stick travel.
