# VIDI X Emulator Studio

A full-featured, multi-instance browser emulator for the **VIDI X (ESP32-WROVER)** Croatian microcomputer, built with TypeScript, React, HTML5 Canvas, and Web Audio.

## Features

### 1. Full VIDI X v1.1 Onboard Hardware Suite
- **ILI9341 320×240 16-bit RGB565 TFT Display**: Full pixel framebuffer supporting `Adafruit_ILI9341`, `Adafruit_GFX`, and `TFT_eSPI` APIs (`fillScreen`, `drawPixel`, `drawLine`, `drawRect`, `fillRect`, `drawCircle`, `fillCircle`, `fillTriangle`, `print`, `println`, `printf`, `drawString`, `drawBitmap`, `pushImage`).
- **XPT2046 Resistive Touchscreen (`TOUCH_CS = 4`, `TOUCH_IRQ = 12`)**: Click and drag directly on the 320×240 screen to trigger `ts.touched()` and `ts.getPoint()` (`x, y, z`).
- **Authentic VIDI X Buttons (Both Analog Resistor Ladder & Digital Modes)**:
  - **D-Pad UP / DOWN (`GPIO 35`)**: Analog resistor ladder (`UP = 4095`, `DOWN = 1950`, `IDLE = 0`) + direct `BTN_UP` / `BTN_DOWN` digital reads.
  - **D-Pad LEFT / RIGHT (`GPIO 34`)**: Analog resistor ladder (`LEFT = 4095`, `RIGHT = 1950`, `IDLE = 0`) + direct `BTN_LEFT` / `BTN_RIGHT` digital reads.
  - **SELECT / START (`GPIO 27`)**: Analog resistor ladder (`SELECT = 4095`, `START = 1950`, `IDLE = 0`) + direct `BTN_SELECT` / `BTN_START` digital reads.
  - **Action Buttons `A` (`GPIO 32`) & `B` (`GPIO 33`)**: Tactile arcade buttons supporting both `INPUT_PULLUP` digital reads and analog reads.
  - **System Keys**: `MENU` / `VOL+` / `VOL-` (`GPIO 13`), `BOOT` (`GPIO 0`), `EN / RESET`, and `ON/OFF` power switch.
- **Piezo Speaker / DAC1 Audio (`GPIO 25`)**: Real-time Web Audio square-wave synthesizer supporting `tone()`, `noTone()`, and `ledcWriteTone()` with per-board mute and volume controls.
- **Onboard Environmental & Audio Sensors**:
  - **MCP9700A Temperature Sensor (`GPIO 26` / `GPIO 39` via jumper)**: Interactive `-10°C` to `60°C` slider ($V_{out} = 500\text{mV} + 10\text{mV}/^\circ\text{C}$).
  - **Photoresistor Light Sensor (`GPIO 39 / SENSOR_VN`)**: Interactive `0%–100%` ambient light slider.
  - **Microphone AGC (`GPIO 36 / SENSOR_VP`)**: Real-time audio waveform generator on ADC1_CH0.
  - **Infrared Transceiver (`IR_PIN = 15`, `IR_TX_PIN = 12`)**: Virtual NEC IR remote buttons + cross-board IR broadcasting.
- **Onboard LEDs & Virtual MicroSD Card (`SD_CS = 22`)**:
  - `PWR`, `STAT (GPIO 2 / 33)`, `RF (WiFi/ESP-NOW/BT)`, and `SD` indicator LEDs.
  - Per-board persistent virtual MicroSD filesystem (`SD.begin()`, `SD.open()`, `SD.exists()`, `SD.remove()`).

### 2. Multi-Device Simulation (Wireless & Wired Interconnects)
- **Simulate Multiple VIDI X Units Simultaneously**: Spawn 1, 2, 3, 4+ independent VIDI X boards in the same workspace, each with its own MAC address, IP address, framebuffer, audio synth, and Arduino VM.
- **Wireless RF Bus (`ESP-NOW`, `WiFi UDP`, `BluetoothSerial`, `IR`)**: Boards can broadcast or unicast packets to each other with a live RF Packet Sniffer.
- **60-Pin Expansion Header Jumper Wire Patch Bay**: Connect virtual jumper wires between any two boards' GPIO pins (including `UART2 TX2 (GPIO 17) -> RX2 (GPIO 16)` serial crossover and digital/PWM GPIO lines).

### 3. Hardware Extension Bus Architecture (`src/emulator/extensions/registry.ts`)
- Every simulated VIDI X board exposes a 60-pin `ExtensionBusContext` (`readDigital`, `writeDigital`, `readAnalog`, `writeAnalog`, `sendSerialRx`, `emitInterrupt`) managed by `ExtensionRegistry`, ready for plug-and-play hardware extensions.

## Compiling a C++ project for VIDI X

New C++ starter projects include the LovyanGFX display configuration needed for a real VIDI X v1.1. In the C++ editor, use **COPY .INO** and paste the result into [the VIDI X online compiler](https://code.vidi-x.org/), or use **EXPORT REAL HW .INO** and upload the downloaded file there. These actions prepare a separate copy; they do not change your saved code. Untouched older starters are updated automatically, while projects containing edits are left intact. For an edited older starter that is missing `LGFX`, the copy/export buttons add the display configuration to the output.

A standalone copy of the fresh starter is also available at [`examples/VIDIXStarter/VIDIXStarter.ino`](examples/VIDIXStarter/VIDIXStarter.ino). It needs LovyanGFX and FastLED. When using Arduino IDE, choose **ESP32 Wrover Module** and enable PSRAM. Arbitrary projects may also use simulator-only APIs or need additional libraries; review their generated code before uploading to hardware. The display has no dedicated reset GPIO (`pin_rst = -1`); GPIO 4 is touch chip select.

## Running the CircuitPython starter on VIDI X

The new Python starter uses the built-in `board.DISPLAY`, `displayio`, `terminalio`, `digitalio`, and `analogio` APIs in CircuitPython 9. It does **not** require an external sensor or extra libraries by default. The D-pad moves the ball and A increases the score. The starter does not include touch, sound, or RGB LED libraries.

In the Python editor, use **EXPORT .PY** to download `code.py`, or use the standalone [`examples/CircuitPythonStarter/code.py`](examples/CircuitPythonStarter/code.py). The VIDI X uses the original ESP32, which does **not** appear as a USB storage drive. To put the file on the board, use a serial-capable editor such as [Thonny](https://thonny.org/):

1. Connect the VIDI X by USB. In Thonny choose **Tools → Options → Interpreter**, select **CircuitPython (generic)** and your board's serial port.
2. Open the downloaded file, then choose **File → Save as → CircuitPython device** and save it as `/code.py`. Back up an existing file first. Alternatively, paste the code into the VIDI X Python editor you already use.
3. Run the code or press reset. CircuitPython starts `/code.py` on reset; if an older `/code.txt` exists, it takes precedence, so back it up and rename it if needed.

For more on ESP32 file access, see [Adafruit's guide](https://learn.adafruit.com/welcome-to-circuitpython/the-circuitpy-drive#boards-without-circuitpy).

Untouched old Python starters are updated automatically when the website is refreshed; projects with edits are kept as-is. If an edited older starter reports `adafruit_mpu6050` or uses `display.fill()` or `mpu.roll`, create a new Python project and manually carry over your changes. The old immediate-mode display calls and `mpu.roll` / `mpu.pitch` are simulator-only, not CircuitPython APIs.

### Optional external MPU-6050

The playable gyro example and the starter's `USE_MPU6050` switch are optional. On a real board, they require an **external** MPU-6050 connected to VIDIIC and the [Adafruit MPU-6050 library and dependencies](https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/python-and-circuitpython). Copy `adafruit_mpu6050.mpy`, `adafruit_bus_device`, and `adafruit_register` from the CircuitPython **9.x** library bundle to the board filesystem under `/lib` (for example, via Thonny’s **View → Files**), then set `USE_MPU6050 = True`. Connect the breakout according to its 3.3 V logic/power requirements: VIDIIC SCL is GPIO 32, SDA is GPIO 33, and grounds must be common. Check the board's switch/jumper configuration and your breakout's voltage requirements before wiring.

VIDIIC shares GPIO 32 and 33 with buttons A and B. Do not use those buttons while the bus is active; the demo uses MENU to score instead. The driver's `acceleration` is in m/s² and `gyro` is in radians/s; the demo estimates static tilt from acceleration, not from nonexistent `mpu.roll` / `mpu.pitch` properties. With `USE_MPU6050 = False`, the default demo does not import the driver or use I2C. If it is enabled without the library or sensor, initialization will fail. Other premade examples may require extra libraries or older CircuitPython APIs and should be checked separately.

The starter is tested in the simulator and against strict host mocks of the CircuitPython APIs. Those tests do not replace a test on a physical VIDI X.

## TextShare and LocalShare

`/textshare/` lets connected devices paste text, send text files, and copy or download received content. Choose a specific device or all devices. TextShare and LocalShare use the same device rooms, so devices on either page can communicate. TextShare accepts up to 10 MiB per item; larger pasted text is sent as a text file. Files are transferred unchanged, while previews and copied text are decoded as UTF-8.

Devices normally discover each other when they have the same public IP address. If they do not appear, enter the same optional room code on both devices (also supported by LocalShare). Room codes are not passwords, so share only with trusted devices. TextShare relays content through the server in memory without writing it to disk; its history is held in the browser tab until cleared, refreshed, or closed.

On the Ubuntu VM, run `bash setup.sh` from the repository to build and deploy the emulator, LocalShare, and TextShare. If automatic updates are using apt, setup waits up to 15 minutes for the package lock; it never deletes lock files. The existing LocalShare systemd service handles both sharing pages; no additional Cloudflare Tunnel is needed.

## Development

```bash
npm install --legacy-peer-deps
npm run dev
```

To additionally compile the starter, its exports, and the multiplayer example with a locally installed Arduino CLI, install the ESP32 board package and the LovyanGFX and FastLED libraries, then run:

```bash
ARDUINO_CLI=arduino-cli npm test
```

The optional compile test defaults to `esp32:esp32:esp32wrover`; set `ARDUINO_FQBN` to use another installed ESP32 Wrover board definition. This verifies compilation, not operation on a physical device.
