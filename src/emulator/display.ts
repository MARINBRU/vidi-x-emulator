/**
 * ILI9341 320x240 16-bit RGB565 Display + Adafruit_GFX / TFT_eSPI Emulator
 */

export const TFT_COLORS: Record<string, number> = {
  ILI9341_BLACK: 0x0000,
  ILI9341_NAVY: 0x000f,
  ILI9341_DARKGREEN: 0x03e0,
  ILI9341_DARKCYAN: 0x03ef,
  ILI9341_MAROON: 0x7800,
  ILI9341_PURPLE: 0x780f,
  ILI9341_OLIVE: 0x7be0,
  ILI9341_LIGHTGREY: 0xc618,
  ILI9341_DARKGREY: 0x7bef,
  ILI9341_BLUE: 0x001f,
  ILI9341_GREEN: 0x07e0,
  ILI9341_CYAN: 0x07ff,
  ILI9341_RED: 0xf800,
  ILI9341_MAGENTA: 0xf81f,
  ILI9341_YELLOW: 0xffe0,
  ILI9341_WHITE: 0xffff,
  ILI9341_ORANGE: 0xfd20,
  ILI9341_GREENYELLOW: 0xafe5,
  ILI9341_PINK: 0xf81f,

  TFT_BLACK: 0x0000,
  TFT_NAVY: 0x000f,
  TFT_DARKGREEN: 0x03e0,
  TFT_DARKCYAN: 0x03ef,
  TFT_MAROON: 0x7800,
  TFT_PURPLE: 0x780f,
  TFT_OLIVE: 0x7be0,
  TFT_LIGHTGREY: 0xc618,
  TFT_DARKGREY: 0x7bef,
  TFT_BLUE: 0x001f,
  TFT_GREEN: 0x07e0,
  TFT_CYAN: 0x07ff,
  TFT_RED: 0xf800,
  TFT_MAGENTA: 0xf81f,
  TFT_YELLOW: 0xffe0,
  TFT_WHITE: 0xffff,
  TFT_ORANGE: 0xfda0,
  TFT_GREENYELLOW: 0xb7e0,
  TFT_PINK: 0xfe19,
  TFT_BROWN: 0x9a60,
  TFT_GOLD: 0xfea0,
  TFT_SILVER: 0xc618,
  TFT_SKYBLUE: 0x867d,
  TFT_VIOLET: 0x915c,
};

// Standard 5x7 ASCII bitmap font (chars 32..126, 5 columns per glyph)
const FONT_5X7: Record<number, [number, number, number, number, number]> = {
  32: [0x00, 0x00, 0x00, 0x00, 0x00], // ' '
  33: [0x00, 0x00, 0x5f, 0x00, 0x00], // '!'
  34: [0x00, 0x07, 0x00, 0x07, 0x00], // '"'
  35: [0x14, 0x7f, 0x14, 0x7f, 0x14], // '#'
  36: [0x24, 0x2a, 0x7f, 0x2a, 0x12], // '$'
  37: [0x23, 0x13, 0x08, 0x64, 0x62], // '%'
  38: [0x36, 0x49, 0x55, 0x22, 0x50], // '&'
  39: [0x00, 0x05, 0x03, 0x00, 0x00], // '''
  40: [0x00, 0x1c, 0x22, 0x41, 0x00], // '('
  41: [0x00, 0x41, 0x22, 0x1c, 0x00], // ')'
  42: [0x14, 0x08, 0x3e, 0x08, 0x14], // '*'
  43: [0x08, 0x08, 0x3e, 0x08, 0x08], // '+'
  44: [0x00, 0x50, 0x30, 0x00, 0x00], // ','
  45: [0x08, 0x08, 0x08, 0x08, 0x08], // '-'
  46: [0x00, 0x60, 0x60, 0x00, 0x00], // '.'
  47: [0x20, 0x10, 0x08, 0x04, 0x02], // '/'
  48: [0x3e, 0x51, 0x49, 0x45, 0x3e], // '0'
  49: [0x00, 0x42, 0x7f, 0x40, 0x00], // '1'
  50: [0x42, 0x61, 0x51, 0x49, 0x46], // '2'
  51: [0x21, 0x41, 0x45, 0x4b, 0x31], // '3'
  52: [0x18, 0x14, 0x12, 0x7f, 0x10], // '4'
  53: [0x27, 0x45, 0x45, 0x45, 0x39], // '5'
  54: [0x3c, 0x4a, 0x49, 0x49, 0x30], // '6'
  55: [0x01, 0x71, 0x09, 0x05, 0x03], // '7'
  56: [0x36, 0x49, 0x49, 0x49, 0x36], // '8'
  57: [0x06, 0x49, 0x49, 0x29, 0x1e], // '9'
  58: [0x00, 0x36, 0x36, 0x00, 0x00], // ':'
  59: [0x00, 0x56, 0x36, 0x00, 0x00], // ';'
  60: [0x08, 0x14, 0x22, 0x41, 0x00], // '<'
  61: [0x14, 0x14, 0x14, 0x14, 0x14], // '='
  62: [0x00, 0x41, 0x22, 0x14, 0x08], // '>'
  63: [0x02, 0x01, 0x51, 0x09, 0x06], // '?'
  64: [0x32, 0x49, 0x79, 0x41, 0x3e], // '@'
  65: [0x7e, 0x11, 0x11, 0x11, 0x7e], // 'A'
  66: [0x7f, 0x49, 0x49, 0x49, 0x36], // 'B'
  67: [0x3e, 0x41, 0x41, 0x41, 0x22], // 'C'
  68: [0x7f, 0x41, 0x41, 0x22, 0x1c], // 'D'
  69: [0x7f, 0x49, 0x49, 0x49, 0x41], // 'E'
  70: [0x7f, 0x09, 0x09, 0x09, 0x01], // 'F'
  71: [0x3e, 0x41, 0x49, 0x49, 0x7a], // 'G'
  72: [0x7f, 0x08, 0x08, 0x08, 0x7f], // 'H'
  73: [0x00, 0x41, 0x7f, 0x41, 0x00], // 'I'
  74: [0x20, 0x40, 0x41, 0x3f, 0x01], // 'J'
  75: [0x7f, 0x08, 0x14, 0x22, 0x41], // 'K'
  76: [0x7f, 0x40, 0x40, 0x40, 0x40], // 'L'
  77: [0x7f, 0x02, 0x0c, 0x02, 0x7f], // 'M'
  78: [0x7f, 0x04, 0x08, 0x10, 0x7f], // 'N'
  79: [0x3e, 0x41, 0x41, 0x41, 0x3e], // 'O'
  80: [0x7f, 0x09, 0x09, 0x09, 0x06], // 'P'
  81: [0x3e, 0x41, 0x51, 0x21, 0x5e], // 'Q'
  82: [0x7f, 0x09, 0x19, 0x29, 0x46], // 'R'
  83: [0x46, 0x49, 0x49, 0x49, 0x31], // 'S'
  84: [0x01, 0x01, 0x7f, 0x01, 0x01], // 'T'
  85: [0x3f, 0x40, 0x40, 0x40, 0x3f], // 'U'
  86: [0x1f, 0x20, 0x40, 0x20, 0x1f], // 'V'
  87: [0x3f, 0x40, 0x38, 0x40, 0x3f], // 'W'
  88: [0x63, 0x14, 0x08, 0x14, 0x63], // 'X'
  89: [0x07, 0x08, 0x70, 0x08, 0x07], // 'Y'
  90: [0x61, 0x51, 0x49, 0x45, 0x43], // 'Z'
  91: [0x00, 0x7f, 0x41, 0x41, 0x00], // '['
  92: [0x02, 0x04, 0x08, 0x10, 0x20], // '\'
  93: [0x00, 0x41, 0x41, 0x7f, 0x00], // ']'
  94: [0x04, 0x02, 0x01, 0x02, 0x04], // '^'
  95: [0x40, 0x40, 0x40, 0x40, 0x40], // '_'
  96: [0x00, 0x01, 0x02, 0x04, 0x00], // '`'
  97: [0x20, 0x54, 0x54, 0x54, 0x78], // 'a'
  98: [0x7f, 0x48, 0x44, 0x44, 0x38], // 'b'
  99: [0x38, 0x44, 0x44, 0x44, 0x20], // 'c'
  100: [0x38, 0x44, 0x44, 0x48, 0x7f], // 'd'
  101: [0x38, 0x54, 0x54, 0x54, 0x18], // 'e'
  102: [0x08, 0x7e, 0x09, 0x01, 0x02], // 'f'
  103: [0x0c, 0x52, 0x52, 0x52, 0x3e], // 'g'
  104: [0x7f, 0x08, 0x04, 0x04, 0x78], // 'h'
  105: [0x00, 0x44, 0x7d, 0x40, 0x00], // 'i'
  106: [0x20, 0x40, 0x44, 0x3d, 0x00], // 'j'
  107: [0x7f, 0x10, 0x28, 0x44, 0x00], // 'k'
  108: [0x00, 0x41, 0x7f, 0x40, 0x00], // 'l'
  109: [0x7c, 0x04, 0x18, 0x04, 0x78], // 'm'
  110: [0x7c, 0x08, 0x04, 0x04, 0x78], // 'n'
  111: [0x38, 0x44, 0x44, 0x44, 0x38], // 'o'
  112: [0x7c, 0x14, 0x14, 0x14, 0x08], // 'p'
  113: [0x08, 0x14, 0x14, 0x18, 0x7c], // 'q'
  114: [0x7c, 0x08, 0x04, 0x04, 0x08], // 'r'
  115: [0x48, 0x54, 0x54, 0x54, 0x20], // 's'
  116: [0x04, 0x3f, 0x44, 0x40, 0x20], // 't'
  117: [0x3c, 0x40, 0x40, 0x20, 0x7c], // 'u'
  118: [0x1c, 0x20, 0x40, 0x20, 0x1c], // 'v'
  119: [0x3c, 0x40, 0x30, 0x40, 0x3c], // 'w'
  120: [0x44, 0x28, 0x10, 0x28, 0x44], // 'x'
  121: [0x0c, 0x50, 0x50, 0x50, 0x3c], // 'y'
  122: [0x44, 0x64, 0x54, 0x4c, 0x44], // 'z'
  123: [0x00, 0x08, 0x36, 0x41, 0x00], // '{'
  124: [0x00, 0x00, 0x7f, 0x00, 0x00], // '|'
  125: [0x00, 0x41, 0x36, 0x08, 0x00], // '}'
  126: [0x08, 0x04, 0x08, 0x10, 0x08], // '~'
};

export function rgb565ToRgb888(color565: number): [number, number, number] {
  const c = color565 & 0xffff;
  const r5 = (c >> 11) & 0x1f;
  const g6 = (c >> 5) & 0x3f;
  const b5 = c & 0x1f;
  const r = (r5 * 255 + 15) >> 5;
  const g = (g6 * 255 + 31) >> 6;
  const b = (b5 * 255 + 15) >> 5;
  return [r, g, b];
}

export function rgb888ToRgb565(r: number, g: number, b: number): number {
  return (((r & 0xf8) << 8) | ((g & 0xfc) << 3) | ((b & 0xf8) >> 3)) & 0xffff;
}

export class ILI9341Display {
  public static readonly WIDTH = 320;
  public static readonly HEIGHT = 240;

  // RGBA 32-bit pixel buffer (320 * 240 * 4 bytes) for direct ImageData rendering
  public readonly rgbaBuffer: Uint8ClampedArray;
  public readonly rgb565Buffer: Uint16Array;

  public cursorX = 0;
  public cursorY = 0;
  public textColor = 0xffff;
  public textBgColor: number | null = null;
  public textSize = 1;
  public textWrap = true;
  public rotation = 3; // Default landscape 320x240 on VIDI X
  public inverted = false;
  public dirty = true;

  constructor() {
    this.rgbaBuffer = new Uint8ClampedArray(ILI9341Display.WIDTH * ILI9341Display.HEIGHT * 4);
    this.rgb565Buffer = new Uint16Array(ILI9341Display.WIDTH * ILI9341Display.HEIGHT);
    this.fillScreen(0x0000);
  }

  public begin(): void {
    this.cursorX = 0;
    this.cursorY = 0;
    this.textColor = 0xffff;
    this.textBgColor = null;
    this.textSize = 1;
    this.rotation = 3;
    this.fillScreen(0x0000);
  }

  public init(): void {
    this.begin();
  }

  public width(): number {
    return ILI9341Display.WIDTH;
  }

  public height(): number {
    return ILI9341Display.HEIGHT;
  }

  public setRotation(r: number): void {
    this.rotation = ((r % 4) + 4) % 4;
  }

  public invertDisplay(i: boolean): void {
    this.inverted = Boolean(i);
    this.dirty = true;
  }

  public color565(r: number, g: number, b: number): number {
    return rgb888ToRgb565(r, g, b);
  }

  public drawPixel(x: number, y: number, color565: number): void {
    const ix = Math.trunc(x);
    const iy = Math.trunc(y);
    if (ix < 0 || ix >= ILI9341Display.WIDTH || iy < 0 || iy >= ILI9341Display.HEIGHT) {
      return;
    }
    const idx = iy * ILI9341Display.WIDTH + ix;
    const c = color565 & 0xffff;
    this.rgb565Buffer[idx] = c;
    const [r, g, b] = rgb565ToRgb888(this.inverted ? ~c & 0xffff : c);
    const p = idx * 4;
    this.rgbaBuffer[p] = r;
    this.rgbaBuffer[p + 1] = g;
    this.rgbaBuffer[p + 2] = b;
    this.rgbaBuffer[p + 3] = 255;
    this.dirty = true;
  }

  public readPixel(x: number, y: number): number {
    const ix = Math.trunc(x);
    const iy = Math.trunc(y);
    if (ix < 0 || ix >= ILI9341Display.WIDTH || iy < 0 || iy >= ILI9341Display.HEIGHT) {
      return 0;
    }
    return this.rgb565Buffer[iy * ILI9341Display.WIDTH + ix];
  }

  public fillScreen(color565: number): void {
    const c = color565 & 0xffff;
    this.rgb565Buffer.fill(c);
    const [r, g, b] = rgb565ToRgb888(this.inverted ? ~c & 0xffff : c);
    for (let i = 0; i < this.rgbaBuffer.length; i += 4) {
      this.rgbaBuffer[i] = r;
      this.rgbaBuffer[i + 1] = g;
      this.rgbaBuffer[i + 2] = b;
      this.rgbaBuffer[i + 3] = 255;
    }
    this.dirty = true;
  }

  public drawFastHLine(x: number, y: number, w: number, color565: number): void {
    const iy = Math.trunc(y);
    if (iy < 0 || iy >= ILI9341Display.HEIGHT || w <= 0) return;
    const startX = Math.max(0, Math.trunc(x));
    const endX = Math.min(ILI9341Display.WIDTH - 1, Math.trunc(x + w - 1));
    for (let cx = startX; cx <= endX; cx++) {
      this.drawPixel(cx, iy, color565);
    }
  }

  public drawFastVLine(x: number, y: number, h: number, color565: number): void {
    const ix = Math.trunc(x);
    if (ix < 0 || ix >= ILI9341Display.WIDTH || h <= 0) return;
    const startY = Math.max(0, Math.trunc(y));
    const endY = Math.min(ILI9341Display.HEIGHT - 1, Math.trunc(y + h - 1));
    for (let cy = startY; cy <= endY; cy++) {
      this.drawPixel(ix, cy, color565);
    }
  }

  public drawLine(x0: number, y0: number, x1: number, y1: number, color565: number): void {
    let ix0 = Math.trunc(x0);
    let iy0 = Math.trunc(y0);
    const ix1 = Math.trunc(x1);
    const iy1 = Math.trunc(y1);

    if (ix0 === ix1) {
      this.drawFastVLine(ix0, Math.min(iy0, iy1), Math.abs(iy1 - iy0) + 1, color565);
      return;
    }
    if (iy0 === iy1) {
      this.drawFastHLine(Math.min(ix0, ix1), iy0, Math.abs(ix1 - ix0) + 1, color565);
      return;
    }

    const dx = Math.abs(ix1 - ix0);
    const sx = ix0 < ix1 ? 1 : -1;
    const dy = -Math.abs(iy1 - iy0);
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
      this.drawPixel(ix0, iy0, color565);
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ix0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }

  public drawRect(x: number, y: number, w: number, h: number, color565: number): void {
    this.drawFastHLine(x, y, w, color565);
    this.drawFastHLine(x, y + h - 1, w, color565);
    this.drawFastVLine(x, y, h, color565);
    this.drawFastVLine(x + w - 1, y, h, color565);
  }

  public fillRect(x: number, y: number, w: number, h: number, color565: number): void {
    const startY = Math.max(0, Math.trunc(y));
    const endY = Math.min(ILI9341Display.HEIGHT - 1, Math.trunc(y + h - 1));
    for (let cy = startY; cy <= endY; cy++) {
      this.drawFastHLine(x, cy, w, color565);
    }
  }

  public drawCircle(x0: number, y0: number, r: number, color565: number): void {
    let f = 1 - Math.trunc(r);
    let ddF_x = 1;
    let ddF_y = -2 * Math.trunc(r);
    let x = 0;
    let y = Math.trunc(r);

    this.drawPixel(x0, y0 + r, color565);
    this.drawPixel(x0, y0 - r, color565);
    this.drawPixel(x0 + r, y0, color565);
    this.drawPixel(x0 - r, y0, color565);

    while (x < y) {
      if (f >= 0) {
        y--;
        ddF_y += 2;
        f += ddF_y;
      }
      x++;
      ddF_x += 2;
      f += ddF_x;

      this.drawPixel(x0 + x, y0 + y, color565);
      this.drawPixel(x0 - x, y0 + y, color565);
      this.drawPixel(x0 + x, y0 - y, color565);
      this.drawPixel(x0 - x, y0 - y, color565);
      this.drawPixel(x0 + y, y0 + x, color565);
      this.drawPixel(x0 - y, y0 + x, color565);
      this.drawPixel(x0 + y, y0 - x, color565);
      this.drawPixel(x0 - y, y0 - x, color565);
    }
  }

  public fillCircle(x0: number, y0: number, r: number, color565: number): void {
    const ir = Math.trunc(r);
    this.drawFastVLine(x0, y0 - ir, 2 * ir + 1, color565);
    let f = 1 - ir;
    let ddF_x = 1;
    let ddF_y = -2 * ir;
    let x = 0;
    let y = ir;

    while (x < y) {
      if (f >= 0) {
        y--;
        ddF_y += 2;
        f += ddF_y;
      }
      x++;
      ddF_x += 2;
      f += ddF_x;

      this.drawFastVLine(x0 + x, y0 - y, 2 * y + 1, color565);
      this.drawFastVLine(x0 + y, y0 - x, 2 * x + 1, color565);
      this.drawFastVLine(x0 - x, y0 - y, 2 * y + 1, color565);
      this.drawFastVLine(x0 - y, y0 - x, 2 * x + 1, color565);
    }
  }

  public drawRoundRect(x: number, y: number, w: number, h: number, r: number, color565: number): void {
    this.drawRect(x, y, w, h, color565);
  }

  public fillRoundRect(x: number, y: number, w: number, h: number, r: number, color565: number): void {
    this.fillRect(x, y, w, h, color565);
  }

  public drawEllipse(x0: number, y0: number, rx: number, ry: number, color565: number): void {
    const irx = Math.max(1, Math.trunc(rx));
    const iry = Math.max(1, Math.trunc(ry));
    const cx = Math.trunc(x0);
    const cy = Math.trunc(y0);
    const steps = Math.max(24, (irx + iry) * 4);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * irx);
      const py = Math.round(cy + Math.sin(a) * iry);
      this.drawPixel(px, py, color565);
    }
  }

  public fillEllipse(x0: number, y0: number, rx: number, ry: number, color565: number): void {
    const irx = Math.max(1, Math.trunc(rx));
    const iry = Math.max(1, Math.trunc(ry));
    const cx = Math.trunc(x0);
    const cy = Math.trunc(y0);
    for (let dy = -iry; dy <= iry; dy++) {
      const normY = dy / iry;
      const halfSpan = Math.round(irx * Math.sqrt(Math.max(0, 1 - normY * normY)));
      this.drawFastHLine(cx - halfSpan, cy + dy, halfSpan * 2 + 1, color565);
    }
  }

  public setTextFont(font: number): void {
    if (font >= 4) {
      this.textSize = 2;
    } else {
      this.textSize = 1;
    }
  }

  public setPsram(_enable: boolean): void {}

  public createSprite(_w = 320, _h = 240): boolean {
    return true;
  }

  public pushSprite(_x = 0, _y = 0): void {
    this.dirty = true;
  }

  public drawTriangle(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color565: number
  ): void {
    this.drawLine(x0, y0, x1, y1, color565);
    this.drawLine(x1, y1, x2, y2, color565);
    this.drawLine(x2, y2, x0, y0, color565);
  }

  public fillTriangle(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color565: number
  ): void {
    const minX = Math.max(0, Math.min(Math.trunc(x0), Math.trunc(x1), Math.trunc(x2)));
    const maxX = Math.min(
      ILI9341Display.WIDTH - 1,
      Math.max(Math.trunc(x0), Math.trunc(x1), Math.trunc(x2))
    );
    const minY = Math.max(0, Math.min(Math.trunc(y0), Math.trunc(y1), Math.trunc(y2)));
    const maxY = Math.min(
      ILI9341Display.HEIGHT - 1,
      Math.max(Math.trunc(y0), Math.trunc(y1), Math.trunc(y2))
    );

    const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
      (px - ax) * (by - ay) - (py - ay) * (bx - ax);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const w0 = edge(x1, y1, x2, y2, px, py);
        const w1 = edge(x2, y2, x0, y0, px, py);
        const w2 = edge(x0, y0, x1, y1, px, py);
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
          this.drawPixel(px, py, color565);
        }
      }
    }
  }

  public setCursor(x: number, y: number): void {
    this.cursorX = Math.trunc(x);
    this.cursorY = Math.trunc(y);
  }

  public setTextColor(fg: number, bg?: number): void {
    this.textColor = fg & 0xffff;
    this.textBgColor = bg !== undefined ? bg & 0xffff : null;
  }

  public setTextSize(s: number): void {
    this.textSize = Math.max(1, Math.min(8, Math.trunc(s || 1)));
  }

  public setTextWrap(w: boolean): void {
    this.textWrap = Boolean(w);
  }

  public drawChar(
    x: number,
    y: number,
    charCode: number,
    color: number,
    bg: number | null,
    size: number
  ): void {
    const glyph = FONT_5X7[charCode] || FONT_5X7[63]; // fallback to '?'
    for (let col = 0; col < 5; col++) {
      const line = glyph[col];
      for (let row = 0; row < 8; row++) {
        const isLit = row < 7 && (line & (1 << row)) !== 0;
        if (isLit) {
          if (size === 1) {
            this.drawPixel(x + col, y + row, color);
          } else {
            this.fillRect(x + col * size, y + row * size, size, size, color);
          }
        } else if (bg !== null && bg !== color) {
          if (size === 1) {
            this.drawPixel(x + col, y + row, bg);
          } else {
            this.fillRect(x + col * size, y + row * size, size, size, bg);
          }
        }
      }
    }
    // 6th spacing column
    if (bg !== null && bg !== color) {
      this.fillRect(x + 5 * size, y, size, 8 * size, bg);
    }
  }

  public print(val: unknown): void {
    const str = String(val ?? '');
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      if (ch === 10) {
        // '\n'
        this.cursorX = 0;
        this.cursorY += 8 * this.textSize;
      } else if (ch === 13) {
        // '\r'
        this.cursorX = 0;
      } else {
        if (this.textWrap && this.cursorX + 6 * this.textSize > ILI9341Display.WIDTH) {
          this.cursorX = 0;
          this.cursorY += 8 * this.textSize;
        }
        this.drawChar(
          this.cursorX,
          this.cursorY,
          ch,
          this.textColor,
          this.textBgColor,
          this.textSize
        );
        this.cursorX += 6 * this.textSize;
      }
    }
  }

  public println(val?: unknown): void {
    if (val !== undefined) {
      this.print(val);
    }
    this.cursorX = 0;
    this.cursorY += 8 * this.textSize;
  }

  public drawString(str: unknown, x: number, y: number, font = 1): void {
    const prevX = this.cursorX;
    const prevY = this.cursorY;
    const prevSize = this.textSize;
    if (font > 1 && this.textSize === 1) {
      this.textSize = Math.min(4, Math.max(1, Math.trunc(font / 2)));
    }
    this.setCursor(x, y);
    this.print(str);
    this.textSize = prevSize;
    this.cursorX = prevX;
    this.cursorY = prevY;
  }

  public drawCentreString(str: unknown, x: number, y: number, font = 1): void {
    const text = String(str ?? '');
    const effSize = font > 1 && this.textSize === 1 ? Math.min(4, Math.max(1, Math.trunc(font / 2))) : this.textSize;
    const widthPx = text.length * 6 * effSize;
    this.drawString(text, x - Math.floor(widthPx / 2), y, font);
  }

  public drawRightString(str: unknown, x: number, y: number, font = 1): void {
    const text = String(str ?? '');
    const effSize = font > 1 && this.textSize === 1 ? Math.min(4, Math.max(1, Math.trunc(font / 2))) : this.textSize;
    const widthPx = text.length * 6 * effSize;
    this.drawString(text, x - widthPx, y, font);
  }

  public drawBitmap(
    x: number,
    y: number,
    bitmap: number[],
    w: number,
    h: number,
    color: number,
    bg?: number
  ): void {
    const byteWidth = Math.floor((w + 7) / 8);
    let byte = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (i & 7) {
          byte <<= 1;
        } else {
          byte = bitmap[j * byteWidth + Math.floor(i / 8)] || 0;
        }
        if (byte & 0x80) {
          this.drawPixel(x + i, y + j, color);
        } else if (bg !== undefined) {
          this.drawPixel(x + i, y + j, bg);
        }
      }
    }
  }

  public pushImage(x: number, y: number, w: number, h: number, data: number[]): void {
    let idx = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (idx < data.length) {
          this.drawPixel(x + i, y + j, data[idx++]);
        }
      }
    }
  }
}
