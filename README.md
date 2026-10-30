# VIDI X Emulator Studio

A full-featured, multi-instance browser emulator for the **VIDI X (ESP32-WROVER)** Croatian microcomputer, built with TypeScript, React, HTML5 Canvas, and Web Audio.

## Features

### 1. Full VIDI X v1.1 Onboard Hardware Suite
- **ILI9341 320×240 16-bit RGB565 TFT Display**: Full pixel framebuffer supporting `Adafruit_ILI9341`, `Adafruit_GFX`, and `TFT_eSPI` APIs (`fillScreen`, `drawPixel`, `drawLine`, `drawRect`, `fillRect`, `drawCircle`, `fillCircle`, `fillTriangle`, `print`, `println`, `printf`, `drawString`, `drawBitmap`, `pushImage`).
- **XPT2046 Resistive Touchscreen (`TOUCH_CS = 14`, `TOUCH_IRQ = 2`)**: Click and drag directly on the 320×240 screen to trigger `ts.touched()` and `ts.getPoint()` (`x, y, z`).
- **Authentic VIDI X Buttons (Both Analog Resistor Ladder & Digital Modes)**:
  - **D-Pad UP / DOWN (`GPIO 34`)**: Analog resistor ladder (`UP = 4095`, `DOWN = 1950`, `IDLE = 0`) + direct `BTN_UP` / `BTN_DOWN` digital reads.
  - **D-Pad LEFT / RIGHT (`GPIO 35`)**: Analog resistor ladder (`LEFT = 4095`, `RIGHT = 1950`, `IDLE = 0`) + direct `BTN_LEFT` / `BTN_RIGHT` digital reads.
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

## TextShare and LocalShare

`/textshare/` lets connected devices paste text, send text files, and copy or download received content. Choose a specific device or all devices. TextShare and LocalShare use the same device rooms, so devices on either page can communicate. TextShare accepts up to 10 MiB per item; larger pasted text is sent as a text file. Files are transferred unchanged, while previews and copied text are decoded as UTF-8.

Devices normally discover each other when they have the same public IP address. If they do not appear, enter the same optional room code on both devices (also supported by LocalShare). Room codes are not passwords, so share only with trusted devices. TextShare relays content through the server in memory without writing it to disk; its history is held in the browser tab until cleared, refreshed, or closed.

On the Ubuntu VM, run `bash setup.sh` from the repository to build and deploy the emulator, LocalShare, and TextShare. If automatic updates are using apt, setup waits up to 15 minutes for the package lock; it never deletes lock files. The existing LocalShare systemd service handles both sharing pages; no additional Cloudflare Tunnel is needed.

## Development

```bash
npm install --legacy-peer-deps
npm run dev
```
