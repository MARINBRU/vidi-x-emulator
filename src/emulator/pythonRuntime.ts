import { RuntimeCallbacks } from './arduinoRuntime';
import { RGBLedColor } from './types';
import { VIDI_X_PINS } from './pinout';

// Add Python-style .format() to String.prototype for CircuitPython compatibility
const strProto = String.prototype as unknown as Record<string, unknown>;
if (!strProto.format) {
  strProto.format = function (this: string, ...args: unknown[]): string {
    let idx = 0;
    return this.replace(/\{([^}]*)\}/g, (_match, spec: string) => {
      const val = args[idx++];
      if (spec.startsWith(':.') && spec.endsWith('f')) {
        const digits = parseInt(spec.slice(2, -1), 10) || 1;
        return Number(val ?? 0).toFixed(digits);
      }
      return String(val ?? '');
    });
  };
}

// Lists in translated Python are JavaScript arrays.
if (!('append' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'append', {
    value: function (this: unknown[], value: unknown) { this.push(value); },
    configurable: true,
  });
}

/**
 * Detect whether a source string is a VIDI X Python / CircuitPython (.py) script
 * rather than an Arduino C++ (.ino) sketch.
 */
export function isPythonCode(code: string): boolean {
  const trimmed = code.trim();
  if (
    /^\s*(import\s+(board|time|digitalio|analogio|pwmio|simpleio|displayio|bitmaptools|espnow|wifi|neopixel|adafruit_mpu6050)|from\s+(adafruit_|board|digitalio|displayio))/m.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^\s*#\s*VIDI\s*X\s*(Circuit)?Python/i.test(trimmed)) {
    return true;
  }
  if (
    !/void\s+setup\s*\(/.test(trimmed) &&
    (/def\s+\w+\s*\([^)]*\)\s*:/.test(trimmed) ||
      /while\s+True\s*:/.test(trimmed) ||
      /digitalio\.DigitalInOut/.test(trimmed))
  ) {
    return true;
  }
  return false;
}

/**
 * Convert 24-bit RGB888 integer (0xRRGGBB) or (r, g, b) tuple to 16-bit RGB565
 */
export function rgb888To565(color: unknown): number {
  if (Array.isArray(color) && color.length >= 3) {
    const r = Math.max(0, Math.min(255, Number(color[0]) || 0));
    const g = Math.max(0, Math.min(255, Number(color[1]) || 0));
    const b = Math.max(0, Math.min(255, Number(color[2]) || 0));
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
  }
  const c = Math.max(0, Number(color) || 0) >>> 0;
  // Always treat standard CircuitPython hex colors as 24-bit 0xRRGGBB
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

interface DisplayIoBitmap {
  width: number;
  height: number;
  pixels?: Uint8Array;
  nonzeroCount?: number;
  isFont?: boolean;
}

type DisplayIoPalette = Record<number, number> & {
  isTransparent?: (index: number) => boolean;
};

interface DisplayIoNode {
  __kind: 'group' | 'tilegrid' | 'label' | 'rect' | 'roundrect' | 'circle' | 'line';
  x: number;
  y: number;
  scale?: number;
  children?: DisplayIoNode[];
  // TileGrid
  bitmap?: DisplayIoBitmap;
  pixel_shader?: DisplayIoPalette;
  gridWidth?: number;
  gridHeight?: number;
  tileWidth?: number;
  tileHeight?: number;
  terminalLines?: string[];
  // Label
  text?: string;
  color?: number | null;
  // Shapes
  width?: number;
  height?: number;
  r?: number;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  fill?: number | null;
  outline?: number | null;
}

function extractKw(args: unknown[]): {
  pos: unknown[];
  kw: Record<string, unknown>;
} {
  if (
    args.length > 0 &&
    args[args.length - 1] &&
    typeof args[args.length - 1] === 'object' &&
    !Array.isArray(args[args.length - 1]) &&
    (args[args.length - 1] as Record<string, unknown>).__kw === true
  ) {
    const kwObj = { ...(args[args.length - 1] as Record<string, unknown>) };
    delete kwObj.__kw;
    return { pos: args.slice(0, -1), kw: kwObj };
  }
  return { pos: args, kw: {} };
}

/**
 * Create the VIDI X CircuitPython runtime environment (board, digitalio, analogio,
 * pwmio, simpleio, neopixel, displayio, adafruit_ili9341, adafruit_display_text,
 * adafruit_display_shapes, xpt2046_circuitpython, adafruit_mpu6050, vidi_network).
 */
export function createPythonRuntimeEnv(
  callbacks: RuntimeCallbacks,
  loopTick: () => Promise<void>,
  pySleep: (seconds: number) => Promise<void>
): {
  env: Record<string, unknown>;
  flushDisplayIo: () => void;
} {
  const disp = callbacks.display;

  // Root displayio group if the script uses CircuitPython's displayio scene graph
  let activeRootGroup: DisplayIoNode | null = null;
  let sceneDirty = false;

  const renderNode = (node: DisplayIoNode, offsetX: number, offsetY: number, parentScale: number) => {
    if (!node) return;
    const scale = (node.scale || 1) * parentScale;
    const absX = Math.round(offsetX + (node.x || 0) * parentScale);
    const absY = Math.round(offsetY + (node.y || 0) * parentScale);

    switch (node.__kind) {
      case 'group': {
        if (node.children) {
          for (const child of node.children) {
            renderNode(child, absX, absY, scale);
          }
        }
        break;
      }
      case 'tilegrid': {
        const bitmap = node.bitmap;
        const palette = node.pixel_shader;
        const tileWidth = node.tileWidth ?? bitmap?.width ?? 320;
        const tileHeight = node.tileHeight ?? bitmap?.height ?? 240;
        const w = tileWidth * (node.gridWidth ?? 1);
        const h = tileHeight * (node.gridHeight ?? 1);
        const transparent = (index: number) => palette?.isTransparent?.(index) ?? false;

        if (bitmap?.isFont) {
          if (!transparent(0)) {
            disp.fillRect(absX, absY, w * scale, h * scale, rgb888To565(palette?.[0] ?? 0));
          }
          disp.setTextSize(Math.max(1, Math.round(scale)));
          disp.setTextColor(rgb888To565(palette?.[1] ?? 0xffffff));
          for (let row = 0; row < (node.terminalLines?.length ?? 0); row++) {
            disp.setCursor(absX, absY + row * tileHeight * scale);
            disp.print(node.terminalLines![row]);
          }
        } else if (!bitmap?.pixels || !bitmap.nonzeroCount) {
          if (!transparent(0)) {
            const color = rgb888To565(palette?.[0] ?? 0);
            if (absX === 0 && absY === 0 && w * scale >= 320 && h * scale >= 240) {
              disp.fillScreen(color);
            } else {
              disp.fillRect(absX, absY, w * scale, h * scale, color);
            }
          }
        } else {
          // Render palette runs, including transparency, rather than treating
          // every bitmap as a solid rectangle. The starter's ball is a sprite.
          for (let y = 0; y < Math.min(h, bitmap.height); y++) {
            let x = 0;
            while (x < Math.min(w, bitmap.width)) {
              const value = bitmap.pixels[y * bitmap.width + x];
              let end = x + 1;
              while (end < Math.min(w, bitmap.width) && bitmap.pixels[y * bitmap.width + end] === value) end++;
              if (!transparent(value)) {
                disp.fillRect(absX + x * scale, absY + y * scale, (end - x) * scale, scale,
                  rgb888To565(palette?.[value] ?? 0));
              }
              x = end;
            }
          }
        }
        break;
      }
      case 'rect': {
        const w = Math.round((node.width ?? 10) * scale);
        const h = Math.round((node.height ?? 10) * scale);
        if (node.fill !== null && node.fill !== undefined) {
          disp.fillRect(absX, absY, w, h, rgb888To565(node.fill));
        }
        if (node.outline !== null && node.outline !== undefined) {
          disp.drawRect(absX, absY, w, h, rgb888To565(node.outline));
        }
        break;
      }
      case 'roundrect': {
        const w = Math.round((node.width ?? 10) * scale);
        const h = Math.round((node.height ?? 10) * scale);
        const r = Math.round((node.r ?? 4) * scale);
        if (node.fill !== null && node.fill !== undefined) {
          disp.fillRoundRect(absX, absY, w, h, r, rgb888To565(node.fill));
        }
        if (node.outline !== null && node.outline !== undefined) {
          disp.drawRoundRect(absX, absY, w, h, r, rgb888To565(node.outline));
        }
        break;
      }
      case 'circle': {
        const r = Math.round((node.r ?? 5) * scale);
        if (node.fill !== null && node.fill !== undefined) {
          disp.fillCircle(absX, absY, r, rgb888To565(node.fill));
        }
        if (node.outline !== null && node.outline !== undefined) {
          disp.drawCircle(absX, absY, r, rgb888To565(node.outline));
        }
        break;
      }
      case 'line': {
        const c = rgb888To565(node.color ?? 0xffffff);
        disp.drawLine(
          Math.round(offsetX + (node.x0 ?? 0) * scale),
          Math.round(offsetY + (node.y0 ?? 0) * scale),
          Math.round(offsetX + (node.x1 ?? 0) * scale),
          Math.round(offsetY + (node.y1 ?? 0) * scale),
          c
        );
        break;
      }
      case 'label': {
        const txt = String(node.text ?? '');
        if (!txt) break;
        const c565 = rgb888To565(node.color ?? 0xffffff);
        const textSize = Math.max(1, Math.round(scale));
        // In CircuitPython displayio, Label y is vertical center of text
        const drawY = Math.max(0, absY - Math.round((textSize * 8) / 2));
        disp.setTextSize(textSize);
        disp.setTextColor(c565);
        disp.setCursor(absX, drawY);
        disp.print(txt);
        break;
      }
    }
  };

  const flushDisplayIo = () => {
    if (activeRootGroup && sceneDirty) {
      disp.fillScreen(0x0000);
      renderNode(activeRootGroup, 0, 0, 1);
      sceneDirty = false;
    }
  };

  // Minimal register-level VIDIIC MPU-6050 simulation. Real CircuitPython
  // requires an I2C lock even for combined register reads.
  const makeI2cError = (name: string, message: string): Error => {
    const error = new Error(message);
    error.name = name;
    return error;
  };
  const makeVidiic = () => {
    let locked = false;
    let deinitialized = false;
    let awake = false;
    const check = (address: number) => {
      if (deinitialized) throw makeI2cError('ValueError', 'I2C has been deinitialized');
      if (!locked) throw makeI2cError('RuntimeError', 'I2C is not locked');
      // Both MPU-6050 address variants are modeled; AD0 chooses on hardware.
      if (address !== 0x68 && address !== 0x69) throw makeI2cError('OSError', 'No I2C device');
    };
    return {
      __bus: 'VIDIIC', scl: 32, sda: 33,
      get deinitialized() { return deinitialized; },
      try_lock: () => {
        if (deinitialized) throw makeI2cError('ValueError', 'I2C has been deinitialized');
        if (locked) return false;
        locked = true;
        return true;
      },
      unlock: () => { locked = false; },
      deinit: () => { deinitialized = true; locked = false; },
      writeto: (address: number, data: ArrayLike<number>) => {
        check(address);
        if (data[0] === 0x6b) awake = (data[1] & 0x40) === 0;
      },
      writeto_then_readfrom: (address: number, out: ArrayLike<number>, input: Uint8Array) => {
        check(address);
        if (out[0] === 0x75) { input[0] = 0x68; return; }
        if (out[0] !== 0x3b || input.length < 14) {
          throw makeI2cError('OSError', 'Unsupported MPU register read');
        }
        const sensors = callbacks.getSensors?.();
        const roll = ((sensors?.gyroRoll ?? 0) * Math.PI) / 180;
        const pitch = ((sensors?.gyroPitch ?? 0) * Math.PI) / 180;
        const raw = awake ? [
          16384 * Math.sin(roll),
          16384 * Math.sin(pitch),
          16384 * Math.cos(roll) * Math.cos(pitch),
          ((sensors?.temperatureC ?? 24.5) - 36.53) * 340,
          (sensors?.gyroRateX ?? 0) * (180 / Math.PI) * 131,
          (sensors?.gyroRateY ?? 0) * (180 / Math.PI) * 131,
          (sensors?.gyroRateZ ?? 0) * (180 / Math.PI) * 131,
        ] : [0, 0, 0, 0, 0, 0, 0];
        raw.forEach((value, index) => {
          const signed = Math.max(-32768, Math.min(32767, Math.round(value)));
          const unsigned = signed & 0xffff;
          input[index * 2] = unsigned >> 8;
          input[index * 2 + 1] = unsigned & 0xff;
        });
      },
    };
  };
  let vidiic: ReturnType<typeof makeVidiic> | undefined;
  const getVidiic = () => {
    if (!vidiic || vidiic.deinitialized) vidiic = makeVidiic();
    return vidiic;
  };

  // Official CircuitPython VIDI X V1.1 `board` module (from ports/espressif/boards/vidi_x/pins.c)
  const boardDisplayObj = {
    width: 320,
    height: 240,
    rotation: 0,
    get root_group() {
      return activeRootGroup;
    },
    set root_group(grp: DisplayIoNode | null) {
      activeRootGroup = grp;
      sceneDirty = true;
      flushDisplayIo();
    },
    show: (grp: DisplayIoNode | null) => {
      activeRootGroup = grp;
      sceneDirty = true;
      flushDisplayIo();
    },
    fill: (color: unknown) => {
      activeRootGroup = null;
      disp.fillScreen(rgb888To565(color));
    },
    pixel: (x: number, y: number, color: unknown) => {
      disp.drawPixel(Math.round(x), Math.round(y), rgb888To565(color));
    },
    fill_rectangle: (x: number, y: number, w: number, h: number, color: unknown) => {
      disp.fillRect(
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h),
        rgb888To565(color)
      );
    },
    rect: (x: number, y: number, w: number, h: number, color: unknown) => {
      disp.drawRect(
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h),
        rgb888To565(color)
      );
    },
    line: (x0: number, y0: number, x1: number, y1: number, color: unknown) => {
      disp.drawLine(
        Math.round(x0),
        Math.round(y0),
        Math.round(x1),
        Math.round(y1),
        rgb888To565(color)
      );
    },
    circle: (x: number, y: number, r: number, color: unknown, fill = false) => {
      if (fill) {
        disp.fillCircle(Math.round(x), Math.round(y), Math.round(r), rgb888To565(color));
      } else {
        disp.drawCircle(Math.round(x), Math.round(y), Math.round(r), rgb888To565(color));
      }
    },
    text: (txt: unknown, x: number, y: number, color: unknown = 0xffffff, size = 1) => {
      disp.setTextSize(Math.max(1, Math.round(size)));
      disp.setTextColor(rgb888To565(color));
      disp.setCursor(Math.round(x), Math.round(y));
      disp.print(String(txt ?? ''));
    },
  };

  const board = {
    VOLUME: 0,
    GPIO0: 0,
    EXP9: 0,
    TX: 1,
    GPIO1: 1,
    EXP16: 1,
    STATUS: 2,
    LED: 2,
    GPIO2: 2,
    EXP8: 2,
    RX: 3,
    GPIO3: 3,
    EXP14: 3,
    TOUCH_CS: 4,
    VSPI_CS2: 4,
    GPIO4: 4,
    EXP10: 4,
    LCD_CS: 5,
    VSPI_CS0: 5,
    GPIO5: 5,
    EXP11: 5,
    TOUCH_IRQ: 12,
    GPIO12: 12,
    EXP20: 12,
    MENU: 13,
    GPIO13: 13,
    EXP17: 13,
    MIC: 14,
    GPIO14: 14,
    EXP19: 14,
    IRTX: 15,
    GPIO15: 15,
    EXP7: 15,
    VSPI_SCK: 18,
    LCD_SCK: 18,
    TOUCH_SCK: 18,
    SD_SCK: 18,
    GPIO18: 18,
    VSPI_MISO: 19,
    LCD_MISO: 19,
    TOUCH_MISO: 19,
    SD_MISO: 19,
    GPIO19: 19,
    LCD_DC: 21,
    GPIO21: 21,
    EXP15: 21,
    SD_CS: 22,
    VSPI_CS1: 22,
    GPIO22: 22,
    EXP18: 22,
    VSPI_MOSI: 23,
    GPIO23: 23,
    EXP28: 23,
    IRRX: 25,
    SPEAKER_IN: 25,
    SPEAKER: 25,
    GPIO25: 25,
    TEMP: 26,
    RGB_LED: 26,
    NEOPIXEL: 26,
    GPIO26: 26,
    SELECT: 27,
    GPIO27: 27,
    EXP22: 27,
    BTN_A: 32,
    SCL: 32,
    GPIO32: 32,
    EXP23: 32,
    BTN_B: 33,
    SDA: 33,
    GPIO33: 33,
    EXP21: 33,
    BTN_L_R: 34,
    GPIO34: 34,
    EXP25: 34,
    BTN_UP_DOWN: 35,
    GPIO35: 35,
    EXP24: 35,
    ADC_BAT: 36,
    GPIO36: 36,
    EXP27: 36,
    START: 39,
    LIGHT: 39,
    GPIO39: 39,
    EXP26: 39,
    SPI: () => ({ __bus: 'SPI', sck: 18, mosi: 23, miso: 19 }),
    I2C: getVidiic,
    STEMMA_I2C: getVidiic,
    VIDIIC: getVidiic,
    DISPLAY: boardDisplayObj,
  };

  // digitalio module
  const digitalio = {
    Direction: {
      INPUT: 'INPUT',
      OUTPUT: 'OUTPUT',
    },
    Pull: {
      UP: 'INPUT_PULLUP',
      DOWN: 'INPUT_PULLDOWN',
    },
    DigitalInOut: (pin: number) => {
      const gpio = Number(pin) || 0;
      let dir: 'INPUT' | 'OUTPUT' = 'INPUT';
      let pull: 'INPUT_PULLUP' | 'INPUT_PULLDOWN' | null = null;
      callbacks.onPinMode(gpio, 'INPUT');
      return {
        pin: gpio,
        get direction() {
          return dir;
        },
        set direction(d: 'INPUT' | 'OUTPUT') {
          dir = d;
          callbacks.onPinMode(gpio, d === 'OUTPUT' ? 'OUTPUT' : pull || 'INPUT');
        },
        get pull() {
          return pull;
        },
        set pull(p: 'INPUT_PULLUP' | 'INPUT_PULLDOWN' | null) {
          pull = p;
          if (dir === 'INPUT') {
            callbacks.onPinMode(gpio, p || 'INPUT');
          }
        },
        get value(): boolean {
          return callbacks.onDigitalRead(gpio) === 1;
        },
        set value(val: boolean | number) {
          callbacks.onDigitalWrite(gpio, val ? 1 : 0);
        },
        switch_to_output: (...rawArgs: unknown[]) => {
          const { pos, kw } = extractKw(rawArgs);
          const val = pos[0] ?? kw.value ?? false;
          dir = 'OUTPUT';
          callbacks.onPinMode(gpio, 'OUTPUT');
          callbacks.onDigitalWrite(gpio, val ? 1 : 0);
        },
        switch_to_input: (...rawArgs: unknown[]) => {
          const { pos, kw } = extractKw(rawArgs);
          const pullMode = (pos[0] ?? kw.pull ?? null) as
            | 'INPUT_PULLUP'
            | 'INPUT_PULLDOWN'
            | null;
          dir = 'INPUT';
          pull = pullMode;
          callbacks.onPinMode(gpio, pull || 'INPUT');
        },
        deinit: () => {},
      };
    },
  };

  // analogio module (CircuitPython scales 12-bit 0..4095 to 16-bit 0..65535!)
  const analogio = {
    AnalogIn: (pin: number) => {
      const gpio = Number(pin) || 0;
      return {
        pin: gpio,
        get value(): number {
          const raw12 = callbacks.onAnalogRead(gpio);
          return Math.min(65535, Math.round((raw12 / 4095) * 65535));
        },
        reference_voltage: 3.3,
        deinit: () => {},
      };
    },
  };

  // pwmio module
  const pwmio = {
    PWMOut: (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      const gpio = Number(pos[0] ?? kw.pin ?? 2);
      let freq = Number(pos[1] ?? kw.frequency ?? 5000);
      let duty = Number(pos[2] ?? kw.duty_cycle ?? 0);
      callbacks.onPinMode(gpio, 'PWM');
      return {
        get frequency() {
          return freq;
        },
        set frequency(f: number) {
          freq = f;
          if (gpio === VIDI_X_PINS.SPEAKER_PIN && duty > 0) callbacks.onTone(gpio, freq);
        },
        get duty_cycle() {
          return duty;
        },
        set duty_cycle(d: number) {
          duty = Math.max(0, Math.min(65535, Number(d) || 0));
          const scaled12 = Math.round((duty / 65535) * 4095);
          callbacks.onAnalogWrite(gpio, scaled12);
          if (gpio === VIDI_X_PINS.SPEAKER_PIN) {
            if (duty > 0 && freq > 0) callbacks.onTone(gpio, freq);
            else callbacks.onNoTone(gpio);
          }
          if (gpio === VIDI_X_PINS.STATUS_LED || gpio === VIDI_X_PINS.LED_BUILTIN) {
            callbacks.onDigitalWrite(gpio, duty > 8192 ? 1 : 0);
          }
        },
        deinit: () => { if (gpio === VIDI_X_PINS.SPEAKER_PIN) callbacks.onNoTone(gpio); },
      };
    },
  };

  // simpleio module
  const simpleio = {
    tone: async (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      const pin = Number(pos[0] ?? kw.pin ?? VIDI_X_PINS.SPEAKER_PIN);
      const freq = Number(pos[1] ?? kw.frequency ?? 440);
      const durationSec = Number(pos[2] ?? kw.duration ?? 0.25);
      const durationMs = Math.max(10, Math.round(durationSec * 1000));
      if (freq > 0) {
        callbacks.onTone(pin, freq, durationMs);
      }
      await pySleep(durationSec);
      callbacks.onNoTone(pin);
    },
    map_range: (
      x: number,
      inMin: number,
      inMax: number,
      outMin: number,
      outMax: number
    ) => ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin,
  };

  // neopixel module (5x WS2812B RGB LEDs on GPIO 26 / board.RGB_LED)
  const neopixel = {
    NeoPixel: (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      const count = Math.max(1, Math.min(16, Number(pos[1] ?? kw.n ?? 5)));
      let brightness = Number(kw.brightness ?? 1.0);
      const autoWrite = kw.auto_write !== undefined ? Boolean(kw.auto_write) : true;
      const leds: RGBLedColor[] = Array.from({ length: count }, () => ({
        r: 0,
        g: 0,
        b: 0,
      }));

      const parseRgb = (val: unknown): RGBLedColor => {
        if (Array.isArray(val) && val.length >= 3) {
          return {
            r: Math.round((Number(val[0]) || 0) * brightness),
            g: Math.round((Number(val[1]) || 0) * brightness),
            b: Math.round((Number(val[2]) || 0) * brightness),
          };
        }
        const hex = Number(val) || 0;
        return {
          r: Math.round(((hex >> 16) & 0xff) * brightness),
          g: Math.round(((hex >> 8) & 0xff) * brightness),
          b: Math.round((hex & 0xff) * brightness),
        };
      };

      const syncLeds = () => {
        callbacks.onUpdateRgbLeds(leds.slice(0, 5).map((c) => ({ ...c })));
      };

      const api: Record<string | symbol, unknown> = {
        n: count,
        get brightness() {
          return brightness;
        },
        set brightness(b: number) {
          brightness = Math.max(0, Math.min(1, Number(b) || 0));
          if (autoWrite) syncLeds();
        },
        fill: (color: unknown) => {
          const c = parseRgb(color);
          for (let i = 0; i < count; i++) {
            leds[i] = { ...c };
          }
          if (autoWrite) syncLeds();
        },
        show: () => {
          syncLeds();
        },
      };

      return new Proxy(api, {
        get(target, prop) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            const idx = parseInt(prop, 10);
            const c = leds[idx] || { r: 0, g: 0, b: 0 };
            return [c.r, c.g, c.b];
          }
          return target[prop];
        },
        set(target, prop, value) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            const idx = parseInt(prop, 10);
            if (idx >= 0 && idx < count) {
              leds[idx] = parseRgb(value);
              if (autoWrite) syncLeds();
            }
            return true;
          }
          target[prop] = value;
          return true;
        },
      });
    },
  };

  // displayio + adafruit_ili9341 + adafruit_display_text + adafruit_display_shapes
  const makeGroup = (...rawArgs: unknown[]): DisplayIoNode => {
    const { kw } = extractKw(rawArgs);
    const children: DisplayIoNode[] = [];
    const node: DisplayIoNode = {
      __kind: 'group',
      x: Number(kw.x ?? 0),
      y: Number(kw.y ?? 0),
      scale: Number(kw.scale ?? 1),
      children,
    };
    const groupObj = {
      ...node,
      append: (child: DisplayIoNode) => {
        children.push(child);
        sceneDirty = true;
        flushDisplayIo();
      },
      pop: (idx?: number) => {
        if (idx === undefined) {
          children.pop();
        } else {
          children.splice(idx, 1);
        }
        sceneDirty = true;
        flushDisplayIo();
      },
      get length() {
        return children.length;
      },
    };
    return new Proxy(groupObj as unknown as DisplayIoNode, {
      get(target, prop) {
        if (prop === 'length') return children.length;
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          return children[parseInt(prop, 10)];
        }
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      },
      set(target, prop, val) {
        (target as unknown as Record<string | symbol, unknown>)[prop] = val;
        sceneDirty = true;
        flushDisplayIo();
        return true;
      },
    });
  };

  const displayio = {
    release_displays: () => {
      activeRootGroup = null;
    },
    FourWire: (..._args: unknown[]) => ({ __fourWire: true }),
    Group: makeGroup,
    Bitmap: (width: number, height: number, _valueCount = 1) => {
      const w = Number(width) || 320;
      const h = Number(height) || 240;
      const bitmap: DisplayIoBitmap & { fill: (v: number) => void } = {
        width: w, height: h, pixels: new Uint8Array(w * h), nonzeroCount: 0,
        fill(value: number) {
          bitmap.pixels!.fill(value);
          bitmap.nonzeroCount = value ? w * h : 0;
          sceneDirty = true;
        },
      };
      return new Proxy(bitmap, {
        get(target, prop) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) return target.pixels![Number(prop)];
          return Reflect.get(target, prop);
        },
        set(target, prop, value) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            const index = Number(prop);
            if (index < 0 || index >= w * h) throw new RangeError('Bitmap index out of range');
            const old = target.pixels![index];
            const next = Number(value) || 0;
            target.pixels![index] = next;
            target.nonzeroCount = (target.nonzeroCount ?? 0) + Number(next !== 0) - Number(old !== 0);
          } else {
            Reflect.set(target, prop, value);
          }
          sceneDirty = true;
          return true;
        },
      });
    },
    Palette: (_count = 1) => {
      const transparent = new Set<number>();
      const pal = {
        0: 0x000000,
        make_transparent: (index: number) => { transparent.add(index); sceneDirty = true; },
        make_opaque: (index: number) => { transparent.delete(index); sceneDirty = true; },
        isTransparent: (index: number) => transparent.has(index),
      };
      return new Proxy(pal, {
        set(target, prop, value) { Reflect.set(target, prop, value); sceneDirty = true; return true; },
      });
    },
    TileGrid: (...rawArgs: unknown[]): DisplayIoNode => {
      const { pos, kw } = extractKw(rawArgs);
      const bmp = (pos[0] ?? kw.bitmap ?? { width: 320, height: 240 }) as DisplayIoBitmap;
      const grid: DisplayIoNode = {
        __kind: 'tilegrid',
        bitmap: bmp,
        pixel_shader: (kw.pixel_shader as DisplayIoPalette) || { 0: 0x000000 },
        gridWidth: Number(kw.width ?? 1),
        gridHeight: Number(kw.height ?? 1),
        tileWidth: Number(kw.tile_width ?? bmp.width),
        tileHeight: Number(kw.tile_height ?? bmp.height),
        x: Number(kw.x ?? 0),
        y: Number(kw.y ?? 0),
      };
      return new Proxy(grid, {
        set(target, prop, value) { Reflect.set(target, prop, value); sceneDirty = true; return true; },
      });
    },
  };

  // CircuitPython bitmaptools primitives operate directly on displayio.Bitmaps.
  // Rectangles use exclusive end coordinates, as on the physical firmware.
  const bitmaptools = {
    fill_region: (bitmap: DisplayIoBitmap, x1: number, y1: number, x2: number, y2: number, value: number) => {
      if (!bitmap.pixels) throw new TypeError('Expected a displayio.Bitmap');
      const left = Math.max(0, Math.min(bitmap.width, Math.trunc(x1)));
      const right = Math.max(left, Math.min(bitmap.width, Math.trunc(x2)));
      const top = Math.max(0, Math.min(bitmap.height, Math.trunc(y1)));
      const bottom = Math.max(top, Math.min(bitmap.height, Math.trunc(y2)));
      for (let y = top; y < bottom; y++) bitmap.pixels.fill(value, y * bitmap.width + left, y * bitmap.width + right);
      if (value && right > left && bottom > top) bitmap.nonzeroCount = Math.max(1, bitmap.nonzeroCount ?? 0);
      sceneDirty = true;
    },
    draw_line: (bitmap: DisplayIoBitmap, x1: number, y1: number, x2: number, y2: number, value: number) => {
      if (!bitmap.pixels) throw new TypeError('Expected a displayio.Bitmap');
      let x = Math.trunc(x1), y = Math.trunc(y1);
      const endX = Math.trunc(x2), endY = Math.trunc(y2);
      const dx = Math.abs(endX - x), dy = Math.abs(endY - y);
      const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
      let error = dx - dy;
      while (true) {
        if (x >= 0 && x < bitmap.width && y >= 0 && y < bitmap.height) bitmap.pixels[y * bitmap.width + x] = value;
        if (x === endX && y === endY) break;
        const twice = error * 2;
        if (twice > -dy) { error -= dy; x += sx; }
        if (twice < dx) { error += dx; y += sy; }
      }
      if (value) bitmap.nonzeroCount = Math.max(1, bitmap.nonzeroCount ?? 0);
      sceneDirty = true;
    },
  };

  const ILI9341 = (..._rawArgs: unknown[]) => boardDisplayObj;
  const ili9341 = { ILI9341 };
  // terminalio.FONT and Terminal are built into the CircuitPython firmware.
  const terminalio = {
    FONT: {
      bitmap: { width: 576, height: 12, isFont: true } as DisplayIoBitmap,
      get_bounding_box: () => [6, 12],
    },
    Terminal: (grid: DisplayIoNode, _font: unknown) => {
      const width = grid.gridWidth ?? 1;
      const height = grid.gridHeight ?? 1;
      const lines = Array.from({ length: height }, () => ' '.repeat(width).split(''));
      let x = 0;
      let y = 0;
      const sync = () => { grid.terminalLines = lines.map((line) => line.join('')); sceneDirty = true; };
      sync();
      return {
        write: (text: unknown) => {
          for (const ch of String(text)) {
            if (ch === '\r') { x = 0; continue; }
            if (ch === '\n') { y++; }
            else {
              if (x >= width) { x = 0; y++; }
              if (y >= height) { lines.shift(); lines.push(' '.repeat(width).split('')); y = height - 1; }
              lines[y][x++] = ch;
            }
            if (y >= height) { lines.shift(); lines.push(' '.repeat(width).split('')); y = height - 1; }
          }
          sync();
        },
      };
    },
  };

  const label = {
    Label: (...rawArgs: unknown[]): DisplayIoNode => {
      const { pos, kw } = extractKw(rawArgs);
      let txt = String(kw.text ?? pos[1] ?? '');
      let col = (kw.color ?? 0xffffff) as number;
      let x = Number(kw.x ?? 0);
      let y = Number(kw.y ?? 0);
      let scale = Number(kw.scale ?? 1);
      const node: DisplayIoNode = {
        __kind: 'label',
        get text() {
          return txt;
        },
        set text(v: string) {
          txt = String(v ?? '');
          sceneDirty = true;
          flushDisplayIo();
        },
        get color() {
          return col;
        },
        set color(v: number | null) {
          col = v ?? 0xffffff;
          sceneDirty = true;
          flushDisplayIo();
        },
        get x() {
          return x;
        },
        set x(v: number) {
          x = Number(v) || 0;
          sceneDirty = true;
          flushDisplayIo();
        },
        get y() {
          return y;
        },
        set y(v: number) {
          y = Number(v) || 0;
          sceneDirty = true;
          flushDisplayIo();
        },
        get scale() {
          return scale;
        },
        set scale(v: number) {
          scale = Number(v) || 1;
          sceneDirty = true;
          flushDisplayIo();
        },
      };
      return node;
    },
  };

  const Rect = (...rawArgs: unknown[]): DisplayIoNode => {
    const { pos, kw } = extractKw(rawArgs);
    let fill = (kw.fill ?? null) as number | null;
    let outline = (kw.outline ?? null) as number | null;
    return {
      __kind: 'rect',
      x: Number(pos[0] ?? kw.x ?? 0),
      y: Number(pos[1] ?? kw.y ?? 0),
      width: Number(pos[2] ?? kw.width ?? 10),
      height: Number(pos[3] ?? kw.height ?? 10),
      get fill() {
        return fill;
      },
      set fill(v: number | null) {
        fill = v;
        sceneDirty = true;
        flushDisplayIo();
      },
      get outline() {
        return outline;
      },
      set outline(v: number | null) {
        outline = v;
        sceneDirty = true;
        flushDisplayIo();
      },
    };
  };

  const RoundRect = (...rawArgs: unknown[]): DisplayIoNode => {
    const { pos, kw } = extractKw(rawArgs);
    let fill = (kw.fill ?? null) as number | null;
    let outline = (kw.outline ?? null) as number | null;
    return {
      __kind: 'roundrect',
      x: Number(pos[0] ?? kw.x ?? 0),
      y: Number(pos[1] ?? kw.y ?? 0),
      width: Number(pos[2] ?? kw.width ?? 10),
      height: Number(pos[3] ?? kw.height ?? 10),
      r: Number(pos[4] ?? kw.r ?? 4),
      get fill() {
        return fill;
      },
      set fill(v: number | null) {
        fill = v;
        sceneDirty = true;
        flushDisplayIo();
      },
      get outline() {
        return outline;
      },
      set outline(v: number | null) {
        outline = v;
        sceneDirty = true;
        flushDisplayIo();
      },
    };
  };

  const Circle = (...rawArgs: unknown[]): DisplayIoNode => {
    const { pos, kw } = extractKw(rawArgs);
    let fill = (kw.fill ?? null) as number | null;
    let outline = (kw.outline ?? null) as number | null;
    return {
      __kind: 'circle',
      x: Number(pos[0] ?? kw.x0 ?? 0),
      y: Number(pos[1] ?? kw.y0 ?? 0),
      r: Number(pos[2] ?? kw.r ?? 5),
      get fill() {
        return fill;
      },
      set fill(v: number | null) {
        fill = v;
        sceneDirty = true;
        flushDisplayIo();
      },
      get outline() {
        return outline;
      },
      set outline(v: number | null) {
        outline = v;
        sceneDirty = true;
        flushDisplayIo();
      },
    };
  };

  const Line = (...rawArgs: unknown[]): DisplayIoNode => {
    const { pos, kw } = extractKw(rawArgs);
    return {
      __kind: 'line',
      x: 0,
      y: 0,
      x0: Number(pos[0] ?? kw.x0 ?? 0),
      y0: Number(pos[1] ?? kw.y0 ?? 0),
      x1: Number(pos[2] ?? kw.x1 ?? 0),
      y1: Number(pos[3] ?? kw.y1 ?? 0),
      color: Number(pos[4] ?? kw.color ?? 0xffffff),
    };
  };

  // XPT2046 Touch controller (xpt2046_circuitpython)
  const xpt2046_circuitpython = {
    Touch: (..._rawArgs: unknown[]) => ({
      get_coordinates: (): [number | null, number | null] => {
        const t = callbacks.getTouch();
        if (!t.pressed) return [null, null];
        return [t.x, t.y];
      },
      is_pressed: (): boolean => callbacks.getTouch().pressed,
    }),
  };

  // VIDIIC I2C 6-DoF Gyroscope & Accelerometer (MPU-6050 @ 0x68)
  const createMpu6050Instance = () => ({
    get acceleration(): [number, number, number] {
      const s = callbacks.getSensors?.();
      const rollRad = (((s?.gyroRoll ?? 0) * Math.PI) / 180);
      const pitchRad = (((s?.gyroPitch ?? 0) * Math.PI) / 180);
      const ax = +(9.81 * Math.sin(rollRad)).toFixed(2);
      const ay = +(9.81 * Math.sin(pitchRad)).toFixed(2);
      const az = +(9.81 * Math.cos(rollRad) * Math.cos(pitchRad)).toFixed(2);
      return [ax, ay, az];
    },
    get gyro(): [number, number, number] {
      const s = callbacks.getSensors?.();
      return [
        +(s?.gyroRateX ?? 0).toFixed(2),
        +(s?.gyroRateY ?? 0).toFixed(2),
        +(s?.gyroRateZ ?? 0).toFixed(2),
      ];
    },
    get temperature(): number {
      return +(callbacks.getSensors?.()?.temperatureC ?? 24.5).toFixed(1);
    },
    get roll(): number {
      return +(callbacks.getSensors?.()?.gyroRoll ?? 0);
    },
    get pitch(): number {
      return +(callbacks.getSensors?.()?.gyroPitch ?? 0);
    },
    get yaw(): number {
      return +(callbacks.getSensors?.()?.gyroYaw ?? 0);
    },
  });

  const adafruit_mpu6050 = {
    MPU6050: (..._args: unknown[]) => createMpu6050Instance(),
  };

  const busio = {
    I2C: (..._args: unknown[]) => ({ __bus: 'I2C', scl: 32, sda: 33 }),
    SPI: (..._args: unknown[]) => ({ __bus: 'SPI', sck: 18, mosi: 23, miso: 19 }),
    UART: (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      callbacks.onConfigureUart?.(Number(pos[0] ?? kw.tx), Number(pos[1] ?? kw.rx));
      return {
        get in_waiting() { return callbacks.onSerialAvailable(2); },
        write: (data: Uint8Array) => {
          callbacks.onSerialPrint(2, new TextDecoder().decode(data));
          return data.length;
        },
        read: () => callbacks.onSerialAvailable(2) > 0
          ? pythonBytes(callbacks.onSerialReadString(2)) : null,
        deinit: () => {},
      };
    },
  };

  // A small model of the CircuitPython 9 ESP-NOW and WiFi APIs. Packets use
  // the same virtual radio as the Arduino VidiNetwork examples.
  const pythonBytes = (values: ArrayLike<number> | string, _encoding = 'utf-8') => {
    const data = typeof values === 'string' ? new TextEncoder().encode(values) : Uint8Array.from(values);
    return Object.assign(data, {
      hex: () => Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      decode: (_encoding = 'utf-8') => new TextDecoder().decode(data),
    });
  };
  const macBytes = (mac: string) => pythonBytes(mac.split(':').map((part) => {
    const value = Number.parseInt(part, 16);
    return Number.isFinite(value) ? value : 0;
  }));
  // NEC-compatible PulseIn/PulseOut, bridged to the emulator's IR transport.
  // Pulse timings are in microseconds, just like CircuitPython's pulseio API.
  const pulseio = {
    PulseOut: (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      const pin = Number(pos[0] ?? kw.pin);
      callbacks.onPinMode(pin, 'OUTPUT');
      return {
        send: (pulses: ArrayLike<number>) => {
          let command = 0;
          if (pulses.length >= 66) {
            for (let bit = 16; bit < 24; bit++) {
              if (Number(pulses[3 + bit * 2]) > 1100) command |= 1 << (bit - 16);
            }
          }
          callbacks.onSendWireless('IR', 'FF:FF:FF:FF:FF:FF', `IR:0x${command.toString(16).toUpperCase()}`, command);
        },
        deinit: () => {},
      };
    },
    PulseIn: (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      callbacks.onPinMode(Number(pos[0] ?? kw.pin), 'INPUT');
      let pulses: number[] = [];
      const populate = () => {
        if (pulses.length) return;
        const ir = callbacks.onGetIrCode();
        if (!ir.available) return;
        callbacks.onConsumeIrCode();
        const command = ir.code & 0xff;
        const bytes = [1, 254, command, command ^ 255];
        pulses = [9000, 4500];
        for (const byte of bytes) for (let bit = 0; bit < 8; bit++) pulses.push(560, byte & (1 << bit) ? 1690 : 560);
        pulses.push(560);
      };
      return {
        get length() { populate(); return pulses.length; },
        popleft: () => pulses.shift() ?? 0,
        pause: () => {}, resume: () => {}, clear: () => { pulses = []; },
        deinit: () => { pulses = []; },
      };
    },
  };
  const wifi = { radio: { mac_address: macBytes(callbacks.macAddress ?? '00:00:00:00:00:00') } };
  const espnow = {
    Peer: (...rawArgs: unknown[]) => {
      const { pos, kw } = extractKw(rawArgs);
      return { mac: pos[0] ?? kw.mac };
    },
    ESPNow: () => {
      callbacks.onEspNowInit();
      return {
        peers: { append: (_peer: unknown) => {} },
        send: (message: string | Uint8Array) => {
          const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
          callbacks.onSendWireless('ESP-NOW', 'FF:FF:FF:FF:FF:FF', text);
        },
        read: () => {
          const packet = callbacks.onPopWirelessPacket('ESP-NOW');
          return packet ? {
            mac: macBytes(packet.fromMac),
            msg: pythonBytes(new TextEncoder().encode(packet.payload)),
            rssi: -50, time: callbacks.getMillis(),
          } : null;
        },
        deinit: () => {},
      };
    },
  };

  const time = {
    sleep: async (sec: number) => {
      flushDisplayIo();
      await pySleep(Number(sec) || 0);
    },
    monotonic: () => callbacks.getMillis() / 1000,
    time: () => Math.floor(Date.now() / 1000),
  };

  const math = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    pi: Math.PI,
    radians: (deg: number) => (deg * Math.PI) / 180,
    degrees: (rad: number) => (rad * 180) / Math.PI,
    floor: Math.floor,
    ceil: Math.ceil,
    fabs: Math.abs,
  };

  const random = {
    randint: (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min,
    random: () => Math.random(),
    uniform: (min: number, max: number) => min + Math.random() * (max - min),
    choice: <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)],
  };

  const __pyRange = (a: number, b?: number, step?: number): number[] => {
    let start = 0;
    let stop = a;
    let st = 1;
    if (b !== undefined) {
      start = a;
      stop = b;
    }
    if (step !== undefined && step !== 0) {
      st = step;
    }
    const out: number[] = [];
    if (st > 0) {
      for (let i = start; i < stop; i += st) out.push(i);
    } else {
      for (let i = start; i > stop; i += st) out.push(i);
    }
    return out;
  };

  const __pyLen = (val: unknown): number => {
    if (val === null || val === undefined) return 0;
    if (Array.isArray(val) || typeof val === 'string') return val.length;
    if (typeof val === 'object' && 'length' in (val as Record<string, unknown>)) {
      return Number((val as { length: number }).length) || 0;
    }
    if (typeof val === 'object' && 'children' in (val as Record<string, unknown>)) {
      return ((val as { children: unknown[] }).children || []).length;
    }
    return Object.keys(val as object).length;
  };

  const __pyFmt = (val: unknown, spec?: string): string => {
    if (spec && spec.startsWith('.') && spec.endsWith('f')) {
      const digits = parseInt(spec.slice(1, -1), 10) || 1;
      return Number(val ?? 0).toFixed(digits);
    }
    return String(val ?? '');
  };

  const print = (...args: unknown[]) => {
    callbacks.onSerialPrint(0, args.map((a) => String(a ?? '')).join(' ') + '\n');
  };

  return {
    env: {
      board,
      digitalio,
      analogio,
      pwmio,
      simpleio,
      neopixel,
      displayio,
      bitmaptools,
      pulseio,
      array: (typecode: string, values: ArrayLike<number>) => {
        if (typecode !== 'H') throw new TypeError('Only unsigned halfword pulse arrays are supported');
        return Uint16Array.from(values);
      },
      espnow,
      wifi,
      terminalio,
      ILI9341,
      ili9341,
      label,
      Rect,
      RoundRect,
      Circle,
      Line,
      xpt2046_circuitpython,
      adafruit_mpu6050,
      busio,
      time,
      math,
      random,
      print,
      bytes: pythonBytes,
      bytearray: (value: number | ArrayLike<number>) =>
        typeof value === 'number' ? new Uint8Array(value) : Uint8Array.from(value),
      __pyExceptionMatches: (error: unknown, names: string[]) => {
        if (!(error instanceof Error)) return false;
        // A stopped VM must never be swallowed by a user's exception handler.
        if (error.message === '__ABORTED__') return false;
        return names.includes('Exception') || names.includes(error.name);
      },
      len: __pyLen,
      str: (v: unknown) => String(v ?? ''),
      int: (v: unknown) => parseInt(String(v), 10) || 0,
      float: (v: unknown) => parseFloat(String(v)) || 0,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      round: (v: number, digits = 0) =>
        digits > 0 ? Number(Number(v).toFixed(digits)) : Math.round(Number(v)),
      __pyRange,
      __pyFmt,
      __loopTick: loopTick,
      __pySleep: pySleep,
    },
    flushDisplayIo,
  };
}

/**
 * Strip comments (# ...) from a single Python line outside string literals
 */
function stripPythonComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Convert Python keyword arguments inside function calls `fn(a, b, k1=v1, k2=v2)`
 * into `fn(a, b, { __kw: true, k1: v1, k2: v2 })`.
 */
function transformKeywordArgsInLine(expr: string): string {
  // Recursively walk balanced parentheses and transform keyword arguments at each call level
  let out = '';
  let i = 0;

  while (i < expr.length) {
    const sub = expr.slice(i);
    const fnMatch = sub.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/);
    if (fnMatch) {
      const fnName = fnMatch[1];
      const openParenIdx = i + fnMatch[0].length - 1;

      // Find matching closing parenthesis
      let depth = 1;
      let j = openParenIdx + 1;
      let inS = false;
      let inD = false;
      while (j < expr.length && depth > 0) {
        const ch = expr[j];
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === "'" && !inD) inS = !inS;
        else if (ch === '"' && !inS) inD = !inD;
        else if (!inS && !inD) {
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
        }
        j++;
      }

      if (depth === 0) {
        const rawInside = expr.slice(openParenIdx + 1, j - 1);
        const transformedInside = transformKeywordArgsInLine(rawInside);

        if (['if', 'while', 'for', 'elif', 'return', 'function'].includes(fnName)) {
          out += `${fnName}(${transformedInside})`;
          i = j;
          continue;
        }

        // Split transformedInside by top-level commas (outside parens/brackets/braces/quotes)
        const parts: string[] = [];
        let current = '';
        let pDepth = 0;
        let sQuote = false;
        let dQuote = false;
        for (let k = 0; k < transformedInside.length; k++) {
          const c = transformedInside[k];
          if (c === '\\') {
            current += c + (transformedInside[k + 1] || '');
            k++;
            continue;
          }
          if (c === "'" && !dQuote) sQuote = !sQuote;
          else if (c === '"' && !sQuote) dQuote = !dQuote;
          else if (!sQuote && !dQuote) {
            if (c === '(' || c === '[' || c === '{') pDepth++;
            else if (c === ')' || c === ']' || c === '}') pDepth--;
            else if (c === ',' && pDepth === 0) {
              if (current.trim()) parts.push(current.trim());
              current = '';
              continue;
            }
          }
          current += c;
        }
        if (current.trim()) parts.push(current.trim());

        const posArgs: string[] = [];
        const kwPairs: string[] = [];
        for (const p of parts) {
          const kwMatch = p.match(/^([A-Za-z_]\w*)\s*=\s*(?!=)([\s\S]+)$/);
          if (kwMatch) {
            kwPairs.push(`${kwMatch[1]}: ${kwMatch[2]}`);
          } else {
            posArgs.push(p);
          }
        }

        if (kwPairs.length > 0) {
          const allArgs = [...posArgs, `{ __kw: true, ${kwPairs.join(', ')} }`];
          out += `${fnName}(${allArgs.join(', ')})`;
        } else {
          out += `${fnName}(${transformedInside})`;
        }
        i = j;
        continue;
      }
    }

    out += expr[i];
    i++;
  }

  return out;
}

/**
 * Transform a Python expression into JavaScript
 */
function transpilePythonExpr(
  rawExpr: string,
  userDefinedFuncs: Set<string>
): string {
  let expr = rawExpr.trim();

  // Convert Python f-strings f"..." or f'...' into template literals
  expr = expr.replace(/f"([^"]*)"/g, (_m, inner: string) => {
    const templ = inner.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (_m2, e: string, spec?: string) =>
      spec ? `\${__pyFmt(${e}, "${spec}")}` : `\${${e}}`
    );
    return `\`${templ}\``;
  });
  expr = expr.replace(/f'([^']*)'/g, (_m, inner: string) => {
    const templ = inner.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (_m2, e: string, spec?: string) =>
      spec ? `\${__pyFmt(${e}, "${spec}")}` : `\${${e}}`
    );
    return `\`${templ}\``;
  });

  // Protect strings before replacing Python operators/keywords
  const literals: string[] = [];
  expr = expr.replace(/(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, (m) => {
    const idx = literals.length;
    literals.push(m);
    return `__PYSTR_${idx}__`;
  });

  // Replace Python operators & constants
  expr = expr.replace(/\bis\s+not\s+None\b/g, '!== null');
  expr = expr.replace(/\bis\s+None\b/g, '=== null');
  expr = expr.replace(/\bTrue\b/g, 'true');
  expr = expr.replace(/\bFalse\b/g, 'false');
  expr = expr.replace(/\bNone\b/g, 'null');
  expr = expr.replace(/\band\b/g, '&&');
  expr = expr.replace(/\bor\b/g, '||');
  expr = expr.replace(/\bnot\s+([A-Za-z0-9_().[\]]+)/g, '(!$1)');
  expr = expr.replace(/\brange\s*\(/g, '__pyRange(');
  expr = expr.replace(/\btime\.sleep\s*\(/g, 'await time.sleep(');
  expr = expr.replace(/\bsimpleio\.tone\s*\(/g, 'await simpleio.tone(');

  // Await calls to user-defined Python `def` functions
  for (const fn of userDefinedFuncs) {
    const fnCallRe = new RegExp(`\\b(${fn})\\s*\\(`, 'g');
    expr = expr.replace(fnCallRe, 'await $1(');
  }

  // Transform keyword arguments in function calls
  expr = transformKeywordArgsInLine(expr);

  // Restore string literals
  expr = expr.replace(/__PYSTR_(\d+)__/g, (_m, idx) => literals[Number(idx)]);

  return expr;
}

/**
 * Transpile a VIDI X CircuitPython (.py) script into async JS code that runs inside ArduinoSketchVM.
 */
export function transpilePythonSketch(pyCode: string): {
  jsCode: string;
  userFunctions: string[];
} {
  const rawLines = pyCode.replace(/\r\n/g, '\n').split('\n');

  // Join multi-line parentheses `(...)` into logical lines so multi-line calls parse cleanly
  const logicalLines: string[] = [];
  let pendingLine = '';
  let parenDepth = 0;

  for (const raw of rawLines) {
    const stripped = stripPythonComment(raw);
    if (!stripped.trim() && parenDepth === 0) continue;

    if (parenDepth > 0) {
      pendingLine += ' ' + stripped.trim();
    } else {
      pendingLine = stripped.replace(/\s+$/, '');
    }

    for (const ch of stripped) {
      if (ch === '(' || ch === '[') parenDepth++;
      else if (ch === ')' || ch === ']') parenDepth = Math.max(0, parenDepth - 1);
    }

    if (parenDepth === 0 && pendingLine.trim()) {
      logicalLines.push(pendingLine);
      pendingLine = '';
    }
  }
  if (pendingLine.trim()) {
    logicalLines.push(pendingLine);
  }

  // First pass: collect user-defined function names (`def foo(...):`)
  const userDefinedFuncs = new Set<string>();
  for (const line of logicalLines) {
    const m = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(/);
    if (m) userDefinedFuncs.add(m[1]);
  }

  // Second pass: convert indentation blocks and statements to JS
  const indentStack: number[] = [0];
  const declaredVarsStack: Array<Set<string>> = [new Set<string>()];
  const functionScopes: Array<{ indent: number; globals: Set<string> }> = [];
  const jsOut: string[] = [];

  for (let i = 0; i < logicalLines.length; i++) {
    const line = logicalLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const leadingSpaces = (line.match(/^[ \t]*/)?.[0] || '').replace(/\t/g, '    ').length;
    while (functionScopes.length && leadingSpaces <= functionScopes[functionScopes.length - 1].indent) {
      functionScopes.pop();
    }

    // Close blocks when indentation decreases
    while (indentStack.length > 1 && leadingSpaces < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      declaredVarsStack.pop();
      jsOut.push('}');
    }

    // Check if next line is `elif` or `else` at same indentation
    // Skip import statements (provided by createPythonRuntimeEnv)
    if (/^(import\s+|from\s+\S+\s+import\s+)/.test(trimmed)) {
      continue;
    }

    // A Python function assigns locally unless the name is declared global.
    const globalMatch = trimmed.match(/^global\s+(.+)$/);
    if (globalMatch) {
      const scope = functionScopes[functionScopes.length - 1];
      if (scope) for (const name of globalMatch[1].split(',')) scope.globals.add(name.trim());
      continue;
    }

    // A single typed/bare except and/or finally. This preserves Python's
    // exception filtering rather than swallowing unrelated runtime errors.
    if (/^try\s*:$/.test(trimmed)) {
      jsOut.push('try {');
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }
    const exceptMatch = trimmed.match(/^except(?:\s+(.+?))?(?:\s+as\s+([A-Za-z_]\w*))?\s*:$/);
    if (exceptMatch) {
      if (jsOut[jsOut.length - 1] === '}') jsOut.pop();
      const rawTypes = (exceptMatch[1] ?? 'Exception').replace(/^\(|\)$/g, '');
      const types = rawTypes.split(',').map((type) => type.trim()).filter(Boolean);
      if (!types.length || types.some((type) => !/^[A-Za-z_]\w*$/.test(type))) {
        throw new Error(`Unsupported Python exception handler: ${trimmed}`);
      }
      jsOut.push(`} catch (__pyError) { if (!__pyExceptionMatches(__pyError, ${JSON.stringify(types)})) throw __pyError;`);
      if (exceptMatch[2]) jsOut.push(`var ${exceptMatch[2]} = __pyError;`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }
    if (/^finally\s*:$/.test(trimmed)) {
      if (jsOut[jsOut.length - 1] === '}') jsOut.pop();
      jsOut.push('} finally {');
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }

    // `pass`
    if (trimmed === 'pass') {
      jsOut.push('await __loopTick();');
      continue;
    }

    // `def name(args):`
    const defMatch = trimmed.match(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:$/);
    if (defMatch) {
      const fnName = defMatch[1];
      const params = defMatch[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const fnScope = new Set<string>(params.map((p) => p.split('=')[0].trim()));
      jsOut.push(`async function ${fnName}(${params.join(', ')}) {`);
      functionScopes.push({ indent: leadingSpaces, globals: new Set() });
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(fnScope);
      continue;
    }

    // `while cond:`
    const whileMatch = trimmed.match(/^while\s+(.+)\s*:$/);
    if (whileMatch) {
      let cond = whileMatch[1].trim();
      if (cond.startsWith('(') && cond.endsWith(')')) {
        cond = cond.slice(1, -1);
      }
      const jsCond = transpilePythonExpr(cond, userDefinedFuncs);
      jsOut.push(`while (${jsCond}) { await __loopTick();`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }

    // `for var in iterable:`
    const forMatch = trimmed.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+)\s*:$/);
    if (forMatch) {
      const iterVar = forMatch[1];
      const iterExpr = transpilePythonExpr(forMatch[2], userDefinedFuncs);
      const nextScope = new Set(declaredVarsStack[declaredVarsStack.length - 1]);
      nextScope.add(iterVar);
      jsOut.push(`for (const ${iterVar} of ${iterExpr}) { await __loopTick();`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(nextScope);
      continue;
    }

    // `with expr as var:`
    const withMatch = trimmed.match(/^with\s+(.+)\s+as\s+([A-Za-z_]\w*)\s*:$/);
    if (withMatch) {
      const resExpr = transpilePythonExpr(withMatch[1], userDefinedFuncs);
      const varName = withMatch[2];
      const nextScope = new Set(declaredVarsStack[declaredVarsStack.length - 1]);
      nextScope.add(varName);
      jsOut.push(`{ const ${varName} = ${resExpr};`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(nextScope);
      continue;
    }

    // `if cond:`
    const ifMatch = trimmed.match(/^if\s+(.+)\s*:$/);
    if (ifMatch) {
      const jsCond = transpilePythonExpr(ifMatch[1], userDefinedFuncs);
      jsOut.push(`if (${jsCond}) {`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }

    // `elif cond:`
    const elifMatch = trimmed.match(/^elif\s+(.+)\s*:$/);
    if (elifMatch) {
      const jsCond = transpilePythonExpr(elifMatch[1], userDefinedFuncs);
      if (jsOut.length > 0 && jsOut[jsOut.length - 1] === '}') {
        jsOut.pop();
      }
      jsOut.push(`} else if (${jsCond}) {`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }

    // `else:`
    if (/^else\s*:$/.test(trimmed)) {
      if (jsOut.length > 0 && jsOut[jsOut.length - 1] === '}') {
        jsOut.pop();
      }
      jsOut.push(`} else {`);
      indentStack.push(leadingSpaces + 1);
      declaredVarsStack.push(new Set(declaredVarsStack[declaredVarsStack.length - 1]));
      continue;
    }

    // `return ...`
    const retMatch = trimmed.match(/^return(?:\s+(.+))?$/);
    if (retMatch) {
      const retExpr = retMatch[1]
        ? transpilePythonExpr(retMatch[1], userDefinedFuncs)
        : '';
      jsOut.push(`return ${retExpr};`);
      continue;
    }

    // Tuple unpacking assignment: `a, b = expr` or `a, b, c = expr`
    const tupleAssign = trimmed.match(
      /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=\s*(?!=)(.+)$/
    );
    if (tupleAssign) {
      const vars = tupleAssign[1].split(',').map((v) => v.trim());
      const rhs = transpilePythonExpr(tupleAssign[2], userDefinedFuncs);
      const scope = functionScopes[functionScopes.length - 1];
      for (const v of vars) {
        if (!scope?.globals.has(v)) jsOut.push(`var ${v};`);
      }
      jsOut.push(`[${vars.join(', ')}] = ${rhs};`);
      continue;
    }

    // Single variable assignment: `var = expr` (where lhs is a simple identifier, not `obj.prop`)
    const simpleAssign = trimmed.match(/^([A-Za-z_]\w*)\s*=\s*(?!=)(.*)$/);
    if (simpleAssign) {
      const varName = simpleAssign[1];
      const rawRhs = simpleAssign[2].trim();
      const rhs = rawRhs ? transpilePythonExpr(rawRhs, userDefinedFuncs) : '0';
      const scope = functionScopes[functionScopes.length - 1];
      if (scope?.globals.has(varName)) {
        jsOut.push(`${varName} = ${rhs};`);
      } else {
        if (!scope) declaredVarsStack[0].add(varName);
        jsOut.push(`var ${varName} = ${rhs};`);
      }
      continue;
    }

    // General statement or property assignment (`Led.value = True`, `score += 1`, `print(...)`)
    jsOut.push(`${transpilePythonExpr(trimmed, userDefinedFuncs)};`);
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    jsOut.push('}');
  }

  const bodyCode = jsOut.join('\n');
  const wrappedJs = `
async function setup() {
${bodyCode}
}
async function loop() {
  await __pySleep(0.05);
}
`;

  return {
    jsCode: wrappedJs,
    userFunctions: ['setup', 'loop', ...Array.from(userDefinedFuncs)],
  };
}
