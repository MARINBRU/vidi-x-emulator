---
name: vidi-x-cpp
description: Write, adapt, debug, and explain complete Arduino C++ sketches for physical VIDI X ESP32 boards. Use for VIDI X displays, buttons, audio, LEDs, sensors, I2C, storage, wireless, and expansion wiring.
---

# VIDI X Arduino C++ skill

Use this as hardware-specific instructions when generating **C++ for a physical VIDI X**, not as a specification of an emulator. It applies to games, displays, instruments, sensors, networking, and other projects. The default target is the VIDI X **v1.1 / original ESP32-WROVER** with a 320 × 240 ILI9341 screen. Older boards and expansion modules can differ. Ask about the revision, connected modules, required controls, and compiler/core when those affect the answer; otherwise state the assumptions and choose conservative defaults.

## What to deliver

1. Give a **complete, pasteable `.ino` sketch** with `setup()` and `loop()`, all required includes, definitions, globals, and functions. Include the display configuration if the sketch uses the LCD: `#include <LovyanGFX.hpp>` alone does **not** define a board-specific `LGFX` class. Do not refer to an omitted earlier snippet or invent board APIs.
2. List only the libraries actually used, the expected Arduino-ESP32 core/version if known, the physical switch positions, and wiring needed. Separate optional features from required ones. Avoid unavailable third-party libraries unless the user can install them.
3. Account for shared pins before combining features; do not silently promise that conflicting peripherals work simultaneously. Keep code responsive; use elapsed time, edge detection/debounce, bounds checks, and clear failure messages where appropriate.
4. Compile against the requested core and libraries when a toolchain is available. Say exactly what was tested; compilation, an emulator, and a physical-board test are different. If you cannot verify the official online compiler's current versions or the actual board, say so. Do not claim an unrun test succeeded.
5. Give short practical upload and test steps, and respond to the **first actual compiler error**. An informational FastLED “No hardware SPI pins defined” message alone is not proof of failure; check the diagnostic following it.

## Compiler and upload

- The official editor is <https://code.vidi-x.org/compile>. Its [C++ editor tutorial](https://vidi-x.org/wp-content/uploads/2024/08/VIDI-X-C-Code-Editor-Tutorial-08-2024.pdf) uses Chrome or Edge and a USB **data** cable. Paste or upload the `.ino`, press **Compile!**, then **Upload!**. In the serial chooser select the board's port but do not click Connect yet. Hold **VOL / GPIO0**, turn the VIDI X off and back on, and click **Connect** while still holding VOL. Release VOL when writing percentages begin. Follow the editor's current prompts; after flashing, reset/power-cycle if the sketch does not start.
- If upload/boot fails, check the data cable, port permissions, other serial applications, switch settings, and boot strapping. The older official workshop says the **TOUCH_IRQ** switch must be on **USE EXP.** while programming. GPIO12 is a strapping pin; disconnecting the touch IRQ at boot can be important. Restore a switch only if the application actually needs that function; the polling touch configuration below does not need IRQ.
- The 2024 tutorial screenshot shows Arduino-ESP32 **2.0.11**, but that is historical, not a guarantee of today's server version or installed libraries. The editor provides libraries for its lessons, not every library. Read its compile output rather than assuming a version. For a local Arduino IDE/CLI, select an ESP32-WROVER-compatible board, matching flash/partition settings, and enable PSRAM where applicable; install the specific libraries and versions used. Flashing replaces the running application, so back up anything important first.
- Core APIs change. Arduino-ESP32 1.x may lack `tone()`, 2.x LEDC uses `ledcSetup`/`ledcAttachPin` and a **channel**, and 3.x replaces those calls with `ledcAttach` and uses a **pin** for LEDC writes. ESP-NOW callback signatures also differ across SDK versions. Check the selected headers; do not assume that fixing an API error by guessing a different version is safe.

## Hardware map and conflicts

These are GPIO numbers, **not** physical header positions. The documented v1.1 has a 28-pin expansion header; do not treat a simulator's virtual header as a physical pinout. Verify the markings and board revision before wiring. VIDI X logic is **3.3 V**; power down when wiring, use common ground, a suitable level shifter for 5 V signals, current-limiting resistors for external LEDs, and an appropriate driver/power supply for motors or other loads. Never put 5 V directly on an ESP32 GPIO.

| Function | GPIO | Important details |
| --- | --- | --- |
| LCD SPI SCK / MOSI / MISO | 18 / 23 / 19 | Shared SPI signals. MOSI is **23**, not 19. |
| LCD CS / D-C | 5 / 21 | ILI9341; no dedicated reset in the configuration below (`-1`). Keep the relevant LCD switches in GAME USE. |
| Touch CS / IRQ | 4 / 12 | XPT2046 on the shared SPI bus. IRQ can be disconnected and touch polled; GPIO12 is boot-strapping-sensitive. |
| microSD CS | 22 | Shares the SPI signals with the screen/touch; select and transact one device at a time. |
| A / B | 32 / 33 | Active-low buttons with pull-ups; also **VIDIIC SCL / SDA** respectively. Choose buttons or I2C, not both independently. |
| Left / Right | 34 | Two buttons on an analog resistor ladder, not two digital pins. Input-only ADC1; no internal pull-up. |
| Up / Down | 35 | Second analog ladder. Input-only ADC1; no internal pull-up. |
| SELECT / MENU / VOL | 27 / 13 / 0 | Active-low in the official examples. VOL is also the bootloader button; do not hold it during ordinary boot. |
| START | 39 | Active-low in the official v1.1 demo; **input only**, no internal pull-up. Use `INPUT` and check the board's external bias/switch. Do not confuse START with a light sensor. |
| Status LED | 2 | Programmable blue LED in the workshop examples; GPIO2 is also a boot strapping pin. |
| Speaker / IR receiver | 25 | Shared, not independent. On boards with the labeled selector, select SPEAKER for sound or TEMP/IRRX for the receiver. Check the physical selector/revision. |
| IR transmitter | 15 | Shared with the IRTX expansion switch and a boot strapping pin. GPIO12 is touch IRQ, not IR TX. |
| Temperature / RGB LEDs | 26 | Older workshop identifies the analog temperature sensor; the v1.1 demo uses five WS2812B LEDs. Function/selector depends on revision; do not assume both work at the same time. |
| Microphone | 14 | Analog microphone in the official recording example; check MIC/MIC_PCB switches. GPIO14 is **ADC2**. |
| Battery measurement | 36 | Input-only ADC1 on the expansion pinout; not the microphone in the referenced v1.1 board map. Verify board wiring and divider before converting voltage. |
| VIDIIC | SDA 33 / SCL 32 | `Wire.begin(33, 32, 100000)`; set BTN_A and BTN_B switches to USE EXP. on the documented board. Use proper 3.3 V pull-ups and module wiring. |

- Put the relevant button/D-pad switches in **GAME USE** for onboard controls and in **USE EXP.** to disconnect a control before repurposing its GPIO. Keep the LCD's CS and D/C switches connected for display use. The exact labels and switch arrangement can vary; check the actual board. The two-way speaker/TEMP/IRRX selector is a separate physical choice on boards that have it.
- GPIO34–39 on the classic ESP32 are input-only and have no internal pull-ups/pull-downs. GPIO32–39 are ADC1; GPIO0, 2, 4, 12–15, and 25–27 are ADC2. **Wi-Fi conflicts with ADC2 analog readings** on the original ESP32: in particular, do not assume the microphone or temperature ADC will work while Wi-Fi is running. Digital uses are a separate question.
- GPIO0, 2, 5, 12, and 15 affect boot strapping. GPIO1/3 are normally the USB serial console, and GPIO16/17 are used by WROVER PSRAM; do not casually assign them to UART or peripherals. Check each candidate pin, switch, reset state, power requirement, and header location before proposing expansion wiring.
- Do not assume a built-in light sensor or gyroscope. The official gyro example uses an **external LSM9DS1TR** on VIDIIC; an MPU6050 is a different external device with different registers/libraries. Ask which module is connected and check its address/identity. The sources do not establish one universal sensor for every VIDI X.

## Complete display and controls starter

This is a standalone, minimal `.ino`. It uses only Arduino-ESP32 and **LovyanGFX**. It does not require touch, PSRAM, audio, LEDs, or an external sensor. The LovyanGFX board setup is adapted from the official v1.1 demo: 240 × 320 panel memory, rotation offset 1, and `setRotation(0)` for a 320 × 240 landscape display. Preserve the included MIT notice when reusing that adapted display configuration. Keep the LCD and A/B/D-pad switches in GAME USE. Button thresholds are starting values, not a calibration guarantee.

<!-- vidi-x-skill:starter -->
```cpp
/*
 * Display configuration adapted from VIDI X v1.1 Demo.
 * Copyright (c) 2026 VIDI X
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
#define LGFX_USE_V1
#include <Arduino.h>
#include <LovyanGFX.hpp>

class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9341 panel;
  lgfx::Bus_SPI bus;

public:
  LGFX() {
    auto b = bus.config();
    b.spi_host = VSPI_HOST;
    b.spi_mode = 0;
    b.freq_write = 40000000;
    b.freq_read = 16000000;
    b.spi_3wire = true;
    b.use_lock = true;
    b.dma_channel = 1;
    b.pin_sclk = 18;
    b.pin_mosi = 23;
    b.pin_miso = 19;
    b.pin_dc = 21;
    bus.config(b);
    panel.setBus(&bus);

    auto p = panel.config();
    p.pin_cs = 5;
    p.pin_rst = -1;
    p.pin_busy = -1;
    p.memory_width = 240;
    p.memory_height = 320;
    p.panel_width = 240;
    p.panel_height = 320;
    p.offset_x = 0;
    p.offset_y = 0;
    p.offset_rotation = 1;
    p.dummy_read_pixel = 8;
    p.dummy_read_bits = 1;
    p.readable = true;
    p.invert = false;
    p.rgb_order = false;
    p.dlen_16bit = false;
    p.bus_shared = true;
    panel.config(p);
    setPanel(&panel);
  }
};

LGFX lcd;
constexpr int BTN_LR = 34, BTN_UD = 35;
constexpr int BTN_A = 32, BTN_B = 33;

// First direction: left or up. Second: right or down.
// Return 2 for an ambiguous ADC value so it is not mistaken for a press.
int readAxis(int raw) {
  if (raw > 3800) return 1;
  if (raw > 1600 && raw < 2400) return -1;
  if (raw < 1000) return 0;
  return 2;
}

const char* axisName(int value, const char* first, const char* second) {
  if (value == 1) return first;
  if (value == -1) return second;
  if (value == 0) return "none";
  return "check ADC";
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(BTN_LR, INPUT); // 34/35 do not have internal pull-ups
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);

  lcd.init();
  lcd.setRotation(0);
  lcd.fillScreen(0x0000);
  lcd.setTextColor(0xFFFF, 0x0000);
  lcd.setTextSize(2);
  lcd.setCursor(8, 8);
  lcd.print("VIDI X C++");
  lcd.setCursor(8, 30);
  lcd.print("Press A, B or D-pad");
}

void loop() {
  const int rawLR = analogRead(BTN_LR);
  const int rawUD = analogRead(BTN_UD);
  const int lr = readAxis(rawLR);
  const int ud = readAxis(rawUD);
  const bool a = digitalRead(BTN_A) == LOW;
  const bool b = digitalRead(BTN_B) == LOW;
  static int oldLR = -99, oldUD = -99;
  static int oldA = -1, oldB = -1;
  static unsigned long lastReport = 0;

  if (lr != oldLR || ud != oldUD || a != oldA || b != oldB) {
    lcd.fillRect(0, 58, 320, 110, 0x0000);
    lcd.setCursor(8, 62);
    lcd.printf("L/R: %s\n", axisName(lr, "left", "right"));
    lcd.printf("U/D: %s\n", axisName(ud, "up", "down"));
    lcd.printf("A: %s  B: %s\n", a ? "down" : "up", b ? "down" : "up");
    oldLR = lr; oldUD = ud; oldA = a; oldB = b;
  }
  // Raw values help calibrate thresholds on the actual board.
  if (millis() - lastReport >= 1000UL) {
    lastReport = millis();
    Serial.printf("LR=%d UD=%d A=%d B=%d\n", rawLR, rawUD, a, b);
  }
  delay(10); // yield; avoid long blocking delays in interactive programs
}
```

The official workshop gives typical 12-bit readings: no press around 0, left/up near 4095, right/down around 1900–2000; the v1.1 demo uses wider tolerances. Use `Serial` at 115200 to measure each state, allow for board/ADC variation and ambiguous readings, and calibrate thresholds. Opposing buttons on the **same** resistor ladder may not be distinguishable when pressed together; do not promise simultaneous independent presses. Add stable-time debounce and press/release edges for one-shot actions; time-scale continuous movement rather than moving a fixed distance per loop.

## Optional peripherals and patterns

Only add the hardware, code, and libraries the user requests. Snippets below are integration guidance; merge them into a complete sketch rather than presenting them alone as a complete application.

### Touch

The starter does **not** set up touch. To add polling touch with LovyanGFX, add `lgfx::Touch_XPT2046 touch;` as an `LGFX` class member and, inside its constructor **before** `setPanel(&panel)`, add:

<!-- vidi-x-skill:touch -->
```cpp
auto t = touch.config();
t.spi_host = VSPI_HOST;
t.freq = 2500000;
t.pin_sclk = 18; t.pin_mosi = 23; t.pin_miso = 19;
t.pin_cs = 4;
t.pin_int = -1; // poll; do not depend on GPIO12 IRQ
t.bus_shared = true;
t.offset_rotation = 0;
t.x_min = 200; t.x_max = 3900; // rough initial limits only
t.y_min = 200; t.y_max = 3900;
touch.config(t);
panel.setTouch(&touch);
```

After `lcd.init()` and setting rotation, run `uint16_t cal[8]; lcd.calibrateTouch(cal, 0xFFFF, 0x0000, 15); lcd.setTouchCalibrate(cal);` when calibration is requested. Calibration is interactive; store/reload it if persistence is required. Then poll `uint16_t x, y; if (lcd.getTouch(&x, &y)) { /* use x, y */ }`. Verify the coordinates and orientation on the real panel after calibration. The screen and touch share SPI; follow the display library's bus-sharing/transaction rules.

### Audio and addressable LEDs

For a simple speaker tone, use the board's speaker selector and wheel. The following functions support the documented core-1/2 vs core-3 LEDC naming difference. The legacy branch uses channel 0; coordinate it with any other PWM/audio users. `ledcWriteTone(..., 0)` stops the tone. Avoid blocking note sequences in interactive programs.

<!-- vidi-x-skill:audio -->
```cpp
constexpr int SPEAKER_PIN = 25;
constexpr int AUDIO_CHANNEL = 0;
bool initSpeaker() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  return ledcAttach(SPEAKER_PIN, 2000, 8);
#else
  if (ledcSetup(AUDIO_CHANNEL, 2000, 8) == 0) return false;
  ledcAttachPin(SPEAKER_PIN, AUDIO_CHANNEL);
  return true;
#endif
}
void setSpeakerTone(unsigned int hz) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWriteTone(SPEAKER_PIN, hz);
#else
  ledcWriteTone(AUDIO_CHANNEL, hz);
#endif
}
```

Call `initSpeaker()` in `setup()` and handle a `false` result; use `setSpeakerTone(440)` to start and `setSpeakerTone(0)` to stop. Check the selected core if an API differs. For sampled audio, GPIO25 also supports the original ESP32 DAC; manage timing and buffering explicitly.

The v1.1 demo uses five WS2812B LEDs on GPIO26. For example, with the separate **FastLED** library: `CRGB pixels[5];` and in setup `FastLED.addLeds<WS2812B, 26, GRB>(pixels, 5); FastLED.setBrightness(32);`; update pixels and call `FastLED.show()`. Include `<FastLED.h>` and check selector/power. The official v1.1 demo instead uses **Adafruit NeoPixel**. Neither library is an implicit part of LovyanGFX. GPIO26 cannot be treated as an independent temperature input while driving the LED data line.

### Sensors, storage, and expansion

- I2C: `#include <Wire.h>` and `Wire.begin(33, 32, 100000);` for the documented VIDIIC connector. Move A/B to USE EXP., verify pull-ups and voltage, and use an I2C scanner if the address is unknown. Check the actual module ID and the selected library's dependencies; report a missing device rather than returning invented sensor data.
- Temperature: the older workshop describes an MCP9700-family sensor on GPIO26 with the selector at TEMP/IRRX. First confirm the part and board. For an MCP9700/MCP9700A specifically, its datasheet gives a typical 500 mV at 0 °C and 10 mV/°C: `C = (millivolts - 500) / 10.0`. ADC readings are not automatically accurate millivolts: configure attenuation, use the core's calibrated voltage API when available, and calibrate against a reference. The older workshop uses a different offset; do not silently apply it as the manufacturer's nominal formula.
- IR: for the documented board, select TEMP/IRRX to receive on GPIO25; transmit on GPIO15 using a compatible IR library/protocol and the appropriate switch. Name the protocol, carrier, library, and version; an IR receiver signal is not the same as a raw light-level sensor.
- microSD uses CS22 with the shared SPI bus (18/23/19). Avoid simultaneous transactions, deselect other devices, and verify bus ownership and the library's SPI instance. The official v1.1 demo explicitly skips its SD test because some display/SD configurations hung in `SD.begin()`. Test SD alone first, then integrate with the display; handle mount failures and do not promise all combinations work.
- Use `Preferences`/NVS or a configured filesystem for small persistent data; check errors and limit flash writes. Storage partition/flash settings differ between environments. For wired two-board communication, use suitable available GPIOs after checking the table and switches, cross TX→RX and RX→TX, connect grounds, use 3.3 V logic, and avoid PSRAM/serial/boot conflicts.

### Wi-Fi, ESP-NOW, and Bluetooth

The original ESP32 supports Wi-Fi and Bluetooth. Use `WiFi.h` and the actual ESP32 APIs, not imaginary VIDI X network classes. For ESP-NOW, start Wi-Fi, initialize ESP-NOW, register the SDK-compatible callback, add the peer (including the broadcast peer when broadcasting), use the same radio channel, and check return codes. For broad v1 compatibility keep each packet at or below 250 bytes. Define a versioned, length-checked message format, sequence numbers and stale-peer timeouts; account for dropped/out-of-order packets and both boards' roles. The receive callback runs in the Wi-Fi task: copy validated data to a queue and process it outside the callback. Unencrypted/broadcast traffic is not private; do not put secrets in it. API callback signatures differ with core/IDF versions, so implement the signature from the installed headers, not from an unrelated example. For Bluetooth/BLE, choose a library and profile supported by the selected core and describe pairing/security.

### Rendering and memory

A 320 × 240 RGB565 frame needs **153,600 bytes** before overhead. WROVER boards generally have PSRAM, but its availability and size depend on the board/build; flash partition sizes are a separate setting. For animation, create an `LGFX_Sprite` once, draw a complete frame into it and then push it to the display. For example, after defining the starter's `lcd` object:

<!-- vidi-x-skill:sprite -->
```cpp
LGFX_Sprite canvas(&lcd);
bool initCanvas() {
  canvas.setColorDepth(16);
  canvas.setPsram(psramFound());
  if (canvas.createSprite(320, 240)) return true;
  Serial.println("Framebuffer unavailable; use direct or smaller drawing.");
  return false;
}
```

Call `initCanvas()` once after `lcd.init()`. Only draw to or `canvas.pushSprite(0, 0)` when it succeeds; otherwise use a smaller sprite/dirty-rectangle or direct-draw fallback. Avoid repeated full-screen clears, unnecessary per-frame allocation, blocking delays, and expensive repeated calculations; measure on the actual board and cap update rate as needed. A complete sprite push avoids showing intermediate draw operations but does **not** guarantee tear-free LCD scanout. Do not promise a frame rate without measuring it.

## Debugging checklist

1. **Compile fails:** read the first real error and show the exact changed code. `LGFX does not name a type` means the display class is missing or declared too late. Check spelling, include availability, library version, and core-dependent API signatures. Arduino's generated function prototypes can also precede custom types; declare the types/prototypes explicitly or arrange the code so they are visible.
2. **Blank/wrong screen:** verify power and LCD switches, ILI9341/SPI pin mapping, `lcd.init()`, rotation/offset, and whether the sketch reached setup. Do not choose a generic ESP32 display configuration by guesswork.
3. **Controls wrong:** verify GAME USE, A/B active-low, `INPUT` on 34/35/39, raw ADC readings and threshold calibration. Check that VIDIIC has not disconnected A/B.
4. **Touch offset or flashing fails:** check GPIO4/12, the touch switch and polling configuration, boot strap levels, touch calibration, and rotation. Do not call `getTouch` without configuring a touch device.
5. **No sound/IR/sensor:** check selector and shared GPIO25/26, volume, wiring, and ADC2/Wi-Fi contention. Verify actual sensor type/address and library. For Wi-Fi or ESP-NOW check channel, peer setup, packet length, callbacks and error codes.
6. **Resets, slow drawing, or SD hangs:** inspect serial output, power, free heap/PSRAM and allocation failures; reduce work and isolate shared SPI devices. A successful compile does not establish physical performance or reliability.

## Sources and verification boundaries

Research checked 2026-10-31. Start with the actual board revision and current compiler output when sources disagree. The standalone starter and an assembled touch/audio/sprite variant were compiled and linked locally with an ESP32 cross-compiler, Arduino-ESP32 1.0.6 and LovyanGFX 1.1.12; the newer LEDC branch was only syntax-checked with host stubs. These are not tests of the current online compiler or a physical VIDI X, and the other peripheral combinations remain hardware-unverified.

- [VIDI X C++ editor tutorial (2024)](https://vidi-x.org/wp-content/uploads/2024/08/VIDI-X-C-Code-Editor-Tutorial-08-2024.pdf) and [product FAQ](https://vidi-x.org/product-faq/): editor, libraries, and upload procedure.
- [Official VIDI X v1.1 demo](https://github.com/VIDI-X/VIDI_X_v1_1_Demo/blob/main/VIDI_X_v1_1_Demo.ino): LCD/touch configuration, GPIOs, 10 controls, WS2812 and LEDC. Its SD test is deliberately disabled in the source.
- [Official C++ workshop manual](https://hr.vidi-x.org/wp-content/uploads/2022/01/VIDI-X_radionice_v2-1.pdf): switches, analog button ladders, speaker and temperature. Some examples request internal pull-ups on input-only pins; use the ESP32 restriction above instead.
- [Official VIDIIC scanner](https://github.com/VIDI-X/i2c_scan/blob/main/i2c_scan.ino), [external LSM9DS1TR example](https://github.com/VIDI-X/Gyro-Labyrinth), and [microphone recording example](https://github.com/VIDI-X/Rec_Play/blob/main/Rec_Play.ino).
- [VIDI X v1.1 hardware specifications](https://circuitpython.org/board/vidi_x/) and [board pin definitions](https://github.com/adafruit/circuitpython/blob/9.2.9/ports/espressif/boards/vidi_x/pins.c). The latter contains inconsistent LCD MOSI aliases; the [board display initialization](https://github.com/adafruit/circuitpython/blob/9.2.9/ports/espressif/boards/vidi_x/board.c) and official C++ demo both use GPIO23.
- [MCP9700 datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/20001942G.pdf), [Arduino-ESP32 2.x to 3.x migration](https://docs.espressif.com/projects/arduino-esp32/en/latest/migration_guides/2.x_to_3.0.html), and [Espressif ESP-NOW documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp_now.html).
