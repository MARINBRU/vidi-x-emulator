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

/**
 * Detect whether a source string is a VIDI X Python / CircuitPython (.py) script
 * rather than an Arduino C++ (.ino) sketch.
 */
export function isPythonCode(code: string): boolean {
  const trimmed = code.trim();
  if (
    /^\s*(import\s+(board|time|digitalio|analogio|pwmio|simpleio|displayio|neopixel|adafruit_mpu6050)|from\s+(adafruit_|board|digitalio|displayio))/m.test(
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

interface DisplayIoNode {
  __kind: 'group' | 'tilegrid' | 'label' | 'rect' | 'roundrect' | 'circle' | 'line';
  x: number;
  y: number;
  scale?: number;
  children?: DisplayIoNode[];
  // TileGrid
  bitmap?: { width: number; height: number };
  pixel_shader?: Record<number, number>;
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
        const bgHex = node.pixel_shader?.[0] ?? 0x000000;
        const c565 = rgb888To565(bgHex);
        const w = node.bitmap?.width ?? 320;
        const h = node.bitmap?.height ?? 240;
        if (absX === 0 && absY === 0 && w >= 320 && h >= 240) {
          disp.fillScreen(c565);
        } else {
          disp.fillRect(absX, absY, w, h, c565);
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
    I2C: () => ({ __bus: 'I2C', scl: 32, sda: 33 }),
    STEMMA_I2C: () => ({ __bus: 'VIDIIC', scl: 32, sda: 33 }),
    VIDIIC: () => ({ __bus: 'VIDIIC', scl: 32, sda: 33 }),
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
        },
        get duty_cycle() {
          return duty;
        },
        set duty_cycle(d: number) {
          duty = Math.max(0, Math.min(65535, Number(d) || 0));
          const scaled12 = Math.round((duty / 65535) * 4095);
          callbacks.onAnalogWrite(gpio, scaled12);
          if (gpio === VIDI_X_PINS.STATUS_LED || gpio === VIDI_X_PINS.LED_BUILTIN) {
            callbacks.onDigitalWrite(gpio, duty > 8192 ? 1 : 0);
          }
        },
        deinit: () => {},
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
    Bitmap: (width: number, height: number, _valueCount = 1) => ({
      width: Number(width) || 320,
      height: Number(height) || 240,
    }),
    Palette: (_count = 1) => {
      const pal: Record<number, number> = { 0: 0x000000 };
      return pal;
    },
    TileGrid: (...rawArgs: unknown[]): DisplayIoNode => {
      const { pos, kw } = extractKw(rawArgs);
      const bmp = (pos[0] as { width: number; height: number }) || {
        width: 320,
        height: 240,
      };
      return {
        __kind: 'tilegrid',
        bitmap: bmp,
        pixel_shader: (kw.pixel_shader as Record<number, number>) || { 0: 0x000000 },
        x: Number(kw.x ?? 0),
        y: Number(kw.y ?? 0),
      };
    },
  };

  const ILI9341 = (..._rawArgs: unknown[]) => boardDisplayObj;
  const ili9341 = { ILI9341 };
  const terminalio = { FONT: 'FONT_5X7' };

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
  const jsOut: string[] = [];

  for (let i = 0; i < logicalLines.length; i++) {
    const line = logicalLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const leadingSpaces = (line.match(/^[ \t]*/)?.[0] || '').replace(/\t/g, '    ').length;

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

    // Skip `global x` declarations
    if (/^global\s+/.test(trimmed)) {
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
      for (const v of vars) {
        jsOut.push(`var ${v} = null;`);
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
      const isGlobalDeclared = declaredVarsStack[0].has(varName);
      if (!isGlobalDeclared && indentStack.length === 1) {
        declaredVarsStack[0].add(varName);
        jsOut.push(`var ${varName} = ${rhs};`);
      } else if (declaredVarsStack[0].has(varName)) {
        jsOut.push(`${varName} = ${rhs};`);
      } else {
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
