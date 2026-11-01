/*
 * Synthetic Sandbox-style compatibility fixture, not the user's original sketch.
 * Exercises a full-size falling-sand scene and the reported C++/hardware API
 * patterns (Preferences, enums, RGB565 macros, byte arrays, pointer writes,
 * display rows, controls, touch, menus and colour settings).
 *
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
#include <Preferences.h>

/* --------------------------------------------------------------------------
 *  Display + polled touch
 * -------------------------------------------------------------------------- */
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9341 panel;
  lgfx::Bus_SPI bus;
  lgfx::Touch_XPT2046 touch;

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
    p.invert = false;      /* if your panel is inverted, use Menu > Color fix */
    p.rgb_order = false;   /* if red/blue are swapped, use Menu > Color fix   */
    p.dlen_16bit = false;
    p.bus_shared = true;
    panel.config(p);

    /* Touch on the shared SPI bus, polled (no IRQ dependency on GPIO12).
       x_min/x_max/y_min/y_max are rough starting limits only - run
       Menu > Calibrate touch once and the mapping will be exact. */
    auto t = touch.config();
    t.spi_host = VSPI_HOST;
    t.freq = 2500000;
    t.pin_sclk = 18;
    t.pin_mosi = 23;
    t.pin_miso = 19;
    t.pin_cs = 4;
    t.pin_int = -1;
    t.bus_shared = true;
    t.offset_rotation = 0;
    t.x_min = 200;
    t.x_max = 3900;
    t.y_min = 200;
    t.y_max = 3900;
    touch.config(t);
    panel.setTouch(&touch);

    setPanel(&panel);
  }
};

LGFX lcd;
Preferences prefs;

/* --------------------------------------------------------------------------
 *  Pins (GPIO numbers, not header positions)
 * -------------------------------------------------------------------------- */
constexpr int BTN_LR = 34;      // resistor ladder: left / right
constexpr int BTN_UD = 35;      // resistor ladder: up / down
constexpr int BTN_A = 32;       // active low (also VIDIIC SCL)
constexpr int BTN_B = 33;       // active low (also VIDIIC SDA)
constexpr int BTN_SELECT = 27;  // active low
constexpr int BTN_MENU = 13;    // active low
constexpr int BTN_START = 39;   // input only, external bias
constexpr int LED_PIN = 2;      // blue status LED

/* --------------------------------------------------------------------------
 *  Screen / grid geometry
 * -------------------------------------------------------------------------- */
#define RGB565(r, g, b) ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))

constexpr int SCR_W = 320;
constexpr int SCR_H = 240;
constexpr int BAR = 16;                        // status bar height (px)
constexpr int CELL = 2;                        // pixels per cell
constexpr int GW = SCR_W / CELL;               // 160 cells
constexpr int GH = (SCR_H - BAR) / CELL;       // 112 cells
constexpr int NCELL = GW * GH;                 // 17920 cells

constexpr int FRAME_MS = 30;

/* --------------------------------------------------------------------------
 *  Colour system
 *    colorMode 0 = RGB (normal)      1 = BGR  (red and blue swapped)
 *              2 = inverted          3 = inverted + BGR
 *    Every colour on screen goes through conv565(), so one setting fixes the
 *    whole UI and the whole palette.
 * -------------------------------------------------------------------------- */
#define COLOR_MODE_DEFAULT 0
uint8_t colorMode = COLOR_MODE_DEFAULT;

uint16_t COL_BG, COL_BAR_BG, COL_BAR_FG, COL_ACCENT, COL_CURSOR;
uint16_t COL_MENU_BG, COL_MENU_SEL, COL_MENU_LINE, COL_UI_LINE, COL_HOLD;

static inline uint16_t conv565(uint16_t c) {
  if (colorMode & 1) c = (uint16_t)(((c & 0xF800) >> 11) | (c & 0x07E0) | ((c & 0x001F) << 11));
  if (colorMode & 2) c = (uint16_t)(~c);
  return c;
}

/* --------------------------------------------------------------------------
 *  Materials
 * -------------------------------------------------------------------------- */
enum : uint8_t {
  M_EMPTY = 0,
  /* solids */
  M_WALL, M_BRICK, M_STONE, M_GLASS, M_ICE, M_WOOD, M_PLANT, M_RUBBER,
  M_PLASTIC, M_METAL, M_FUSE, M_BOMB,
  /* powders */
  M_SAND, M_ASH, M_SALT, M_COAL, M_GUNPOWDER, M_SNOW,
  /* liquids */
  M_WATER, M_OIL, M_ACID, M_LAVA, M_MUD, M_SLIME,
  /* gases */
  M_FIRE, M_SMOKE, M_STEAM, M_CLOUD,
  /* devices */
  M_SOURCE, M_VOLCANO, M_TORCH, M_FREEZER, M_VOID,
  /* tool */
  M_ERASER,
  M_COUNT
};

enum : uint8_t { TP_EMPTY = 0, TP_SOLID, TP_POWDER, TP_LIQUID, TP_GAS, TP_TOOL };

const char *const MAT_NAME[M_COUNT] = {
  "EMPTY",
  "WALL", "BRICK", "STONE", "GLASS", "ICE", "WOOD", "PLANT", "RUBBER",
  "PLASTIC", "METAL", "FUSE", "BOMB",
  "SAND", "ASH", "SALT", "COAL", "GUNPOWDER", "SNOW",
  "WATER", "OIL", "ACID", "LAVA", "MUD", "SLIME",
  "FIRE", "SMOKE", "STEAM", "CLOUD",
  "SOURCE", "VOLCANO", "TORCH", "FREEZER", "VOID",
  "ERASER"
};

/* true (panel independent) colours */
const uint32_t MAT_RGB[M_COUNT] = {
  0x000000,
  0x8C8C96, 0xA4553C, 0x787880, 0xB4D6E0, 0xA8E0F8, 0x7A542E, 0x38A03C,
  0x33333A, 0x2F7FA8, 0xA0A8B4, 0xC86432, 0x4E4E58,
  0xE2CD8A, 0x6E6864, 0xF0F0EC, 0x24242A, 0x3C3C42, 0xF0F8FF,
  0x3A78DC, 0x463E34, 0x8CF03C, 0xFF5A14, 0x6B5236, 0x3FAF6A,
  0xFF8C28, 0x5A5A60, 0xC8D2DC, 0xDCE4F0,
  0x00B4C8, 0x8A3018, 0xD8A050, 0x2A6FA8, 0x1E1428,
  0x191920
};

const uint8_t MAT_TYPE[M_COUNT] = {
  TP_EMPTY,
  TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID,
  TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID,
  TP_POWDER, TP_POWDER, TP_POWDER, TP_POWDER, TP_POWDER, TP_POWDER,
  TP_LIQUID, TP_LIQUID, TP_LIQUID, TP_LIQUID, TP_LIQUID, TP_LIQUID,
  TP_GAS, TP_GAS, TP_GAS, TP_GAS,
  TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID, TP_SOLID,
  TP_TOOL
};

/* Density decides who displaces whom: powders sink through liquids, oil floats
   on water, gases rise through everything. Solids are never movable. */
const uint8_t MAT_DENS[M_COUNT] = {
  0,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  8, 8, 8, 8, 8, 8,
  4, 3, 5, 6, 7, 5,
  1, 1, 1, 1,
  255, 255, 255, 255, 255,
  0
};

/* Paintable palette, in D-pad order (grouped: solids, powders, liquids, gases,
   devices, tool). */
#define PAL_COUNT (M_COUNT - 1)
const uint8_t PALETTE[PAL_COUNT] = {
  M_WALL, M_BRICK, M_STONE, M_GLASS, M_ICE, M_WOOD, M_PLANT, M_RUBBER,
  M_PLASTIC, M_METAL, M_FUSE, M_BOMB,
  M_SAND, M_ASH, M_SALT, M_COAL, M_GUNPOWDER, M_SNOW,
  M_WATER, M_OIL, M_ACID, M_LAVA, M_MUD, M_SLIME,
  M_FIRE, M_SMOKE, M_STEAM, M_CLOUD,
  M_SOURCE, M_VOLCANO, M_TORCH, M_FREEZER, M_VOID,
  M_ERASER
};

uint16_t MAT_COL[M_COUNT][4];
uint16_t FIRE_COL[4];

/* --------------------------------------------------------------------------
 *  World state
 * -------------------------------------------------------------------------- */
uint8_t grid[NCELL];    // material id per cell
uint8_t life[NCELL];    // fire/smoke/steam/cloud/bomb-fuse counters
uint8_t movedf[NCELL];  // "already updated this step" flag
uint8_t prevApp[NCELL]; // appearance key of the last pushed frame

uint16_t lineBuf[SCR_W];

/* --------------------------------------------------------------------------
 *  Application state
 * -------------------------------------------------------------------------- */
uint8_t selIdx = 0;          // index into PALETTE
uint8_t brush = 3;           // radius in cells
uint8_t tool = 0;            // 0 = paint, 1 = spray, 2 = square
uint8_t simSpeed = 1;
bool paused = false;
bool menuOpen = false;
bool pickOpen = false;
uint8_t menuSel = 0;
bool barDirty = true;
bool forceFullRedraw = true;

uint16_t fps = 0;
uint32_t fpsFrames = 0, fpsStart = 0;
uint32_t colorTestUntil = 0;

bool cursorOn = false;
int curPxX = 0, curPxY = 0;
uint32_t lastTouchMs = 0;
bool wasTouching = false;
int lastPaintX = 0, lastPaintY = 0;

uint32_t bHoldStart = 0;
bool bHolding = false;

const char *const TOOL_NAME[3] = { "PAINT", "SPRAY", "SQUARE" };

/* --------------------------------------------------------------------------
 *  Palette build (call again after the colour mode changes)
 * -------------------------------------------------------------------------- */
void applyColorMode() {
  COL_BG        = conv565(RGB565(12, 12, 18));
  COL_BAR_BG    = conv565(RGB565(20, 20, 30));
  COL_BAR_FG    = conv565(RGB565(225, 232, 244));
  COL_ACCENT    = conv565(RGB565(90, 190, 255));
  COL_CURSOR    = conv565(RGB565(255, 255, 255));
  COL_MENU_BG   = conv565(RGB565(18, 18, 26));
  COL_MENU_SEL  = conv565(RGB565(34, 56, 86));
  COL_MENU_LINE = conv565(RGB565(40, 60, 90));
  COL_UI_LINE   = conv565(RGB565(40, 60, 90));
  COL_HOLD      = conv565(RGB565(255, 90, 60));

  FIRE_COL[0] = conv565(RGB565(140, 30, 15));
  FIRE_COL[1] = conv565(RGB565(240, 90, 30));
  FIRE_COL[2] = conv565(RGB565(255, 180, 60));
  FIRE_COL[3] = conv565(RGB565(255, 240, 150));

  for (int m = 0; m < M_COUNT; m++) {
    uint32_t rgb = MAT_RGB[m];
    int r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
    const int k[4] = { 100, 92, 108, 84 };
    for (int v = 0; v < 4; v++) {
      int rr = r * k[v] / 100, gg = g * k[v] / 100, bb = b * k[v] / 100;
      if (rr > 255) rr = 255;
      if (gg > 255) gg = 255;
      if (bb > 255) bb = 255;
      MAT_COL[m][v] = conv565(RGB565(rr, gg, bb));
    }
  }
  forceFullRedraw = true;
  barDirty = true;
}

/* --------------------------------------------------------------------------
 *  Small helpers
 * -------------------------------------------------------------------------- */
uint32_t rngState = 0x1BADF00DUL;

static inline uint32_t rnd() {
  rngState ^= rngState << 13;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;
  return rngState;
}
static inline int rndN(int n) { return (int)(rnd() % (uint32_t)n); }

enum : uint16_t { T_LEFT = 1, T_RIGHT = 2, T_UP = 4, T_DOWN = 8,
                  T_A = 16, T_B = 32, T_SELECT = 64, T_MENU = 128, T_START = 256 };

static inline bool isFlammable(uint8_t t) {
  return t == M_WOOD || t == M_PLANT || t == M_OIL || t == M_GUNPOWDER ||
         t == M_COAL || t == M_RUBBER || t == M_PLASTIC || t == M_FUSE ||
         t == M_BOMB;
}

static inline uint8_t matAt(int x, int y) {
  if ((unsigned)x >= (unsigned)GW || (unsigned)y >= (unsigned)GH) return M_WALL;
  return grid[y * GW + x];
}
static inline void setCell(int x, int y, uint8_t m) {
  if ((unsigned)x >= (unsigned)GW || (unsigned)y >= (unsigned)GH) return;
  int i = y * GW + x;
  grid[i] = m;
  life[i] = 0;
  movedf[i] = 0;
}
static inline uint8_t startLife(uint8_t m) {
  if (m == M_FIRE)  return 40 + rndN(30);
  if (m == M_SMOKE) return 50 + rndN(40);
  if (m == M_STEAM) return 60 + rndN(50);
  if (m == M_CLOUD) return 400 + rndN(400);
  return 0;
}

/* --------------------------------------------------------------------------
 *  Movement
 * -------------------------------------------------------------------------- */
static inline bool canEnter(uint8_t m, uint8_t t) {
  if (t == M_EMPTY) return true;
  uint8_t tt = MAT_TYPE[t];
  if (tt != TP_POWDER && tt != TP_LIQUID && tt != TP_GAS) return false;
  if (MAT_TYPE[m] == TP_GAS && tt == TP_LIQUID) return true;  // bubbles rise
  return MAT_DENS[t] < MAT_DENS[m];
}

static inline void moveTo(int i, int j) {
  grid[j] = grid[i];
  life[j] = life[i];
  grid[i] = M_EMPTY;
  life[i] = 0;
  movedf[j] = 1;
  movedf[i] = 1;
}
static inline void swapCells(int i, int j) {
  uint8_t g = grid[i]; grid[i] = grid[j]; grid[j] = g;
  uint8_t l = life[i]; life[i] = life[j]; life[j] = l;
  movedf[i] = 1;
  movedf[j] = 1;
}

static inline bool tryMove(int x, int y, int nx, int ny) {
  if ((unsigned)nx >= (unsigned)GW || (unsigned)ny >= (unsigned)GH) return false;
  int i = y * GW + x;
  int j = ny * GW + nx;
  if (j == i) return false;
  uint8_t t = grid[j];
  if (t == M_EMPTY) { moveTo(i, j); return true; }
  if (canEnter(grid[i], t)) { swapCells(i, j); return true; }
  return false;
}

/* --------------------------------------------------------------------------
 *  Material rules
 * -------------------------------------------------------------------------- */
const int8_t DX4[4] = { 0, 0, -1, 1 };
const int8_t DY4[4] = { -1, 1, 0, 0 };

void explode(int cx, int cy, int r);
void armBomb(int i);

/* A heat source touching cell j. Returns true when the material reacted. */
bool ignite(int x, int y, int j, uint8_t t) {
  switch (t) {
    case M_WOOD:
      if (rndN(100) < 12) { grid[j] = M_FIRE; life[j] = 40 + rndN(30); return true; }
      break;
    case M_PLANT:
      if (rndN(100) < 22) { grid[j] = M_FIRE; life[j] = 28 + rndN(20); return true; }
      break;
    case M_OIL:
      if (rndN(100) < 38) { grid[j] = M_FIRE; life[j] = 28 + rndN(25); return true; }
      break;
    case M_COAL:
      if (rndN(100) < 6) { grid[j] = M_FIRE; life[j] = 90 + rndN(50); return true; }
      break;
    case M_RUBBER:
      if (rndN(100) < 5) { grid[j] = M_FIRE; life[j] = 70 + rndN(30); return true; }
      break;
    case M_PLASTIC:
      if (rndN(100) < 9) { grid[j] = M_FIRE; life[j] = 40 + rndN(25); return true; }
      break;
    case M_FUSE:
      if (rndN(100) < 35) { grid[j] = M_FIRE; life[j] = 18 + rndN(10); return true; }
      break;
    case M_GUNPOWDER:
      explode(x, y, 8);
      return true;
    case M_BOMB:
      armBomb(j);
      return true;
    default: break;
  }
  return false;
}

void explode(int cx, int cy, int r) {
  int r2 = r * r;
  int inner = (r / 2) * (r / 2);
  for (int y = cy - r; y <= cy + r; y++) {
    if ((unsigned)y >= (unsigned)GH) continue;
    for (int x = cx - r; x <= cx + r; x++) {
      if ((unsigned)x >= (unsigned)GW) continue;
      int dx = x - cx, dy = y - cy;
      int d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      int i = y * GW + x;
      uint8_t t = grid[i];
      if (t == M_WALL || t == M_VOID || t == M_SOURCE) continue;
      if (t == M_BOMB) { armBomb(i); continue; }        /* chain reaction */
      if (isFlammable(t)) {
        grid[i] = M_FIRE; life[i] = 25 + rndN(25); movedf[i] = 1;
      } else if (t == M_EMPTY && rndN(100) < 70) {
        grid[i] = M_FIRE; life[i] = 8 + rndN(22); movedf[i] = 1;
      } else if (d2 <= inner) {
        if (t == M_BRICK || t == M_GLASS) { grid[i] = M_ASH; life[i] = 0; }
        else { grid[i] = M_FIRE; life[i] = 15 + rndN(20); }
        movedf[i] = 1;
      }
    }
  }
  for (int k = 0; k < 6; k++) {
    int x = cx + rndN(2 * r + 1) - r;
    int y = cy + rndN(2 * r + 1) - r;
    if ((unsigned)x < (unsigned)GW && (unsigned)y < (unsigned)GH) setCell(x, y + 1, M_ASH);
  }
}

void armBomb(int i) {
  if (grid[i] == M_BOMB && life[i] == 0) life[i] = 25 + rndN(20);
}

void powderCell(int x, int y) {
  if (tryMove(x, y, x, y + 1)) return;
  int d = (rnd() & 1) ? 1 : -1;
  if (tryMove(x, y, x + d, y + 1)) return;
  if (tryMove(x, y, x - d, y + 1)) return;
}

void liquidCell(int x, int y, int visc) {
  if (visc < 100 && rndN(100) >= visc) return;
  if (tryMove(x, y, x, y + 1)) return;
  int d = (rnd() & 1) ? 1 : -1;
  if (tryMove(x, y, x + d, y + 1)) return;
  if (tryMove(x, y, x - d, y + 1)) return;
  if (tryMove(x, y, x + d, y)) return;
  if (tryMove(x, y, x - d, y)) return;
}

void gasCell(int x, int y, int visc) {
  if (visc < 100 && rndN(100) >= visc) return;
  int d = (rnd() & 1) ? 1 : -1;
  if (rndN(100) < 82) {
    if (tryMove(x, y, x, y - 1)) return;
    if (tryMove(x, y, x + d, y - 1)) return;
    if (tryMove(x, y, x - d, y - 1)) return;
  }
  if (tryMove(x, y, x + d, y)) return;
  if (tryMove(x, y, x - d, y)) return;
}

void fireCell(int x, int y, int i) {
  if (life[i] == 0) life[i] = 40 + rndN(30);
  bool onFuel = false;

  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    uint8_t t = matAt(nx, ny);
    if (t == M_EMPTY || t == M_WALL) continue;
    int j = ny * GW + nx;
    if (isFlammable(t)) onFuel = true;
    if (t == M_WATER || t == M_STEAM || t == M_CLOUD) {
      grid[j] = M_STEAM; life[j] = 50 + rndN(40);
      grid[i] = M_SMOKE; life[i] = 30;
      return;
    } else if (t == M_ICE || t == M_SNOW) {
      grid[j] = M_WATER; life[j] = 0;
    } else if (ignite(x, y, j, t)) {
      return;                                  /* gunpowder / bomb took over */
    }
  }

  if (--life[i] == 0) {
    int r = rndN(100);
    if (r < 30) { grid[i] = M_SMOKE; life[i] = 40 + rndN(30); }
    else if (r < 48) { grid[i] = M_ASH; life[i] = 0; }
    else { grid[i] = M_EMPTY; life[i] = 0; }
    return;
  }
  /* flames lick upward, but a fire sitting on fuel stays and burns it */
  if (!onFuel && rndN(100) < 40) tryMove(x, y, x, y - 1);
}

void waterCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    uint8_t t = matAt(nx, ny);
    if (t == M_FIRE) {
      grid[i] = M_STEAM; life[i] = 50 + rndN(40);
      return;
    }
    if (t == M_LAVA) {
      grid[i] = M_STEAM; life[i] = 60 + rndN(40);
      if (rndN(100) < 60) { int j = ny * GW + nx; grid[j] = M_STONE; life[j] = 0; }
      return;
    }
    if (t == M_ICE && rndN(700) == 0) { grid[i] = M_ICE; life[i] = 0; return; }
  }
  liquidCell(x, y, 100);
}

void oilCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if (t == M_FIRE || t == M_LAVA) { grid[i] = M_FIRE; life[i] = 30 + rndN(20); return; }
  }
  liquidCell(x, y, 62);
}

void lavaCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    uint8_t t = matAt(nx, ny);
    if (t == M_EMPTY || t == M_WALL) continue;
    int j = ny * GW + nx;
    if (t == M_WATER) {
      grid[j] = M_STEAM; life[j] = 60 + rndN(40);
      grid[i] = M_STONE; life[i] = 0;
      return;
    } else if (t == M_ICE) {
      grid[j] = M_STEAM; life[j] = 40 + rndN(30);
    } else if (t == M_SNOW) {
      grid[j] = M_WATER; life[j] = 0;
    } else if (t == M_SAND) {
      if (rndN(100) < 4) { grid[j] = M_GLASS; life[j] = 0; }
    } else if (t == M_METAL) {
      if (rndN(1200) == 0) { grid[j] = M_LAVA; life[j] = 0; }
    } else if (t == M_PLASTIC) {
      if (rndN(100) < 20) { grid[j] = M_OIL; life[j] = 0; }
    } else if (t == M_MUD) {
      if (rndN(100) < 20) { grid[j] = M_SAND; life[j] = 0; }
    } else if (ignite(x, y, j, t)) {
      return;
    }
  }
  liquidCell(x, y, 45);
}

void acidCell(int x, int y, int i) {
  static const uint8_t eatable[] = { M_STONE, M_WOOD, M_METAL, M_GLASS, M_SAND,
                                     M_ASH, M_PLANT, M_ICE, M_SNOW, M_SALT,
                                     M_BRICK, M_MUD, M_FUSE };
  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    uint8_t t = matAt(nx, ny);
    bool eats = false;
    for (uint8_t e = 0; e < sizeof(eatable); e++) if (eatable[e] == t) { eats = true; break; }
    if (!eats) continue;
    int j = ny * GW + nx;
    grid[j] = M_EMPTY; life[j] = 0;
    if (rndN(100) < 45) {                       // the acid is used up
      if (rndN(100) < 50) { grid[i] = M_SMOKE; life[i] = 40 + rndN(30); }
      else { grid[i] = M_EMPTY; life[i] = 0; }
      return;
    }
  }
  liquidCell(x, y, 85);
}

void mudCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if ((t == M_FIRE || t == M_LAVA) && rndN(100) < 25) { grid[i] = M_SAND; life[i] = 0; return; }
  }
  liquidCell(x, y, 22);
}

void plantCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    if (matAt(nx, ny) != M_WATER) continue;
    if (ny > y) continue;                       // grow up / sideways only
    if (rndN(100) < 3) { int j = ny * GW + nx; grid[j] = M_PLANT; life[j] = 0; }
  }
}

void iceCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if (t == M_FIRE || t == M_LAVA) { grid[i] = M_WATER; life[i] = 0; return; }
  }
}

void snowCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if (t == M_FIRE || t == M_LAVA) { grid[i] = M_WATER; life[i] = 0; return; }
  }
  powderCell(x, y);
}

void gunpowderCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if (t == M_FIRE || t == M_LAVA) { explode(x, y, 8); return; }
  }
  powderCell(x, y);
}

void plasticCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if ((t == M_FIRE || t == M_LAVA) && rndN(100) < 12) { grid[i] = M_OIL; life[i] = 0; return; }
  }
}

void bombCell(int x, int y, int i) {
  if (life[i] > 0) {
    if (--life[i] == 0) {
      grid[i] = M_EMPTY;   /* clear first: explode() would otherwise re-arm it */
      explode(x, y, 13);
    }
    return;
  }
  for (int k = 0; k < 4; k++) {
    uint8_t t = matAt(x + DX4[k], y + DY4[k]);
    if (t == M_FIRE || t == M_LAVA) { armBomb(i); return; }
  }
}

void saltCell(int x, int y, int i) {
  for (int k = 0; k < 4; k++) {
    if (matAt(x + DX4[k], y + DY4[k]) == M_WATER && rndN(100) < 2) {
      grid[i] = M_EMPTY; life[i] = 0;           // dissolves into the water
      return;
    }
  }
  powderCell(x, y);
}

void cloudCell(int x, int y, int i) {
  if (life[i] == 0) life[i] = 700 + rndN(400);
  if (rndN(1000) < 4) { grid[i] = M_WATER; life[i] = 0; return; }  // rain
  if (--life[i] == 0) { grid[i] = M_EMPTY; life[i] = 0; return; }
  gasCell(x, y, 55);
}

void sourceCell(int x, int y) {
  int k = rndN(4);
  int nx = x + DX4[k], ny = y + DY4[k];
  if (matAt(nx, ny) == M_EMPTY && rndN(100) < 40) setCell(nx, ny, M_WATER);
}

void volcanoCell(int x, int y) {
  if (matAt(x, y - 1) == M_EMPTY && rndN(100) < 14) setCell(x, y - 1, M_LAVA);
  else if (matAt(x, y - 1) == M_EMPTY && rndN(100) < 3) setCell(x, y - 1, M_SMOKE);
}

void torchCell(int x, int y) {
  if (matAt(x, y - 1) == M_EMPTY) {
    if (rndN(100) < 26) { setCell(x, y - 1, M_FIRE); life[(y - 1) * GW + x] = 40 + rndN(20); }
  }
  if (matAt(x + 1, y - 1) == M_EMPTY && rndN(100) < 3) setCell(x + 1, y - 1, M_SMOKE);
}

void freezerCell(int x, int y) {
  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    uint8_t t = matAt(nx, ny);
    int j = ny * GW + nx;
    if (t == M_WATER && rndN(100) < 6) { grid[j] = M_ICE; life[j] = 0; }
    else if (t == M_STEAM && rndN(100) < 10) { grid[j] = M_WATER; life[j] = 0; }
    else if (t == M_LAVA && rndN(100) < 5) { grid[j] = M_STONE; life[j] = 0; }
  }
}

void voidCell(int x, int y) {
  for (int k = 0; k < 4; k++) {
    int nx = x + DX4[k], ny = y + DY4[k];
    uint8_t t = matAt(nx, ny);
    if (t == M_EMPTY || t == M_VOID || t == M_WALL) continue;
    int j = ny * GW + nx;
    grid[j] = M_EMPTY; life[j] = 0;
  }
}

void updateCell(int x, int y) {
  int i = y * GW + x;
  uint8_t m = grid[i];
  if (m == M_EMPTY || movedf[i]) return;
  switch (m) {
    case M_FIRE:       fireCell(x, y, i); break;
    case M_SMOKE:
    case M_STEAM: {
      if (life[i] == 0) life[i] = startLife(m);
      if (--life[i] == 0) { grid[i] = M_EMPTY; life[i] = 0; break; }
      gasCell(x, y, m == M_STEAM ? 92 : 100);
      break;
    }
    case M_CLOUD:      cloudCell(x, y, i); break;
    case M_WATER:      waterCell(x, y, i); break;
    case M_OIL:        oilCell(x, y, i); break;
    case M_LAVA:       lavaCell(x, y, i); break;
    case M_ACID:       acidCell(x, y, i); break;
    case M_MUD:        mudCell(x, y, i); break;
    case M_SLIME:      liquidCell(x, y, 15); break;
    case M_PLANT:      plantCell(x, y, i); break;
    case M_ICE:        iceCell(x, y, i); break;
    case M_SNOW:       snowCell(x, y, i); break;
    case M_GUNPOWDER:  gunpowderCell(x, y, i); break;
    case M_PLASTIC:    plasticCell(x, y, i); break;
    case M_BOMB:       bombCell(x, y, i); break;
    case M_SALT:       saltCell(x, y, i); break;
    case M_SAND:
    case M_ASH:
    case M_COAL:       powderCell(x, y); break;
    case M_SOURCE:     sourceCell(x, y); break;
    case M_VOLCANO:    volcanoCell(x, y); break;
    case M_TORCH:      torchCell(x, y); break;
    case M_FREEZER:    freezerCell(x, y); break;
    case M_VOID:       voidCell(x, y); break;
    default: break;
  }
}

void simulateStep() {
  memset(movedf, 0, sizeof(movedf));
  static bool flip = false;
  flip = !flip;
  for (int y = GH - 1; y >= 0; y--) {
    if (flip) {
      for (int x = GW - 1; x >= 0; x--) updateCell(x, y);
    } else {
      for (int x = 0; x < GW; x++) updateCell(x, y);
    }
  }
}

/* --------------------------------------------------------------------------
 *  Input
 * -------------------------------------------------------------------------- */
uint16_t padsStable = 0, padsPrev = 0, padsPressed = 0, padsRepeat = 0;

/* 0 = none, 1 = first direction (left / up), -1 = second (right / down),
   2 = ambiguous, do not treat it as a press. */
int readAxis(int raw) {
  if (raw > 3800) return 1;
  if (raw > 1600 && raw < 2400) return -1;
  if (raw < 1000) return 0;
  return 2;
}

uint16_t readPads() {
  uint16_t b = 0;
  int lr = readAxis(analogRead(BTN_LR));
  int ud = readAxis(analogRead(BTN_UD));
  if (lr == 1) b |= T_LEFT; else if (lr == -1) b |= T_RIGHT;
  if (ud == 1) b |= T_UP; else if (ud == -1) b |= T_DOWN;
  if (digitalRead(BTN_A) == LOW) b |= T_A;
  if (digitalRead(BTN_B) == LOW) b |= T_B;
  if (digitalRead(BTN_SELECT) == LOW) b |= T_SELECT;
  if (digitalRead(BTN_MENU) == LOW) b |= T_MENU;
  if (digitalRead(BTN_START) == LOW) b |= T_START;
  return b;
}

void updatePads() {
  static uint16_t cand = 0;
  static uint8_t candCount = 0;
  static uint32_t repeatAt = 0;

  uint16_t raw = readPads();
  if (raw == cand) { if (candCount < 3) candCount++; }
  else { cand = raw; candCount = 1; }

  uint16_t stable = (candCount >= 2) ? cand : padsStable;
  padsPressed = stable & ~padsStable;
  padsPrev = padsStable;
  padsStable = stable;

  uint16_t dirs = stable & (T_LEFT | T_RIGHT | T_UP | T_DOWN);
  padsRepeat = 0;
  uint32_t now = millis();
  if (dirs) {
    if (padsPressed & dirs) repeatAt = now + 420;
    else if (now >= repeatAt) { padsRepeat = dirs; repeatAt = now + 110; }
  }
}

static inline bool hit(uint16_t b) { return (padsPressed | padsRepeat) & b; }

/* --------------------------------------------------------------------------
 *  Colour lookup
 * -------------------------------------------------------------------------- */
uint8_t appearanceKey(uint8_t m, uint8_t lf) {
  if (m == M_EMPTY) return 0;
  if (m == M_FIRE) {
    uint8_t b = lf > 50 ? 3 : (lf > 32 ? 2 : (lf > 16 ? 1 : 0));
    return (uint8_t)(0x80 | b);
  }
  if (m == M_BOMB && lf > 0) return (uint8_t)(0x90 | ((lf >> 2) & 1));  // blinking fuse
  return m;
}

uint16_t colorOf(uint8_t m, uint8_t lf, int x, int y) {
  if (m == M_EMPTY) return COL_BG;
  if (m == M_FIRE) {
    uint8_t b = lf > 50 ? 3 : (lf > 32 ? 2 : (lf > 16 ? 1 : 0));
    return FIRE_COL[b];
  }
  if (m == M_BOMB && lf > 0) return ((lf >> 2) & 1) ? COL_CURSOR : FIRE_COL[1];
  uint8_t v = (uint8_t)(((x * 53 + y * 97) >> 2) & 3);
  if (m == M_LAVA) v = (uint8_t)(((x * 31 + y * 17 + (lf >> 1)) >> 1) & 3);
  return MAT_COL[m][v];
}

/* --------------------------------------------------------------------------
 *  Rendering
 * -------------------------------------------------------------------------- */
static inline bool inCursorRing(int x, int y) {
  if (!cursorOn) return false;
  int dx = (x * CELL + 1) - curPxX;
  int dy = (y * CELL + 1) - curPxY;
  int d2 = dx * dx + dy * dy;
  int r = brush * CELL + 1;
  int r2 = (r - 2 > 0) ? (r - 2) * (r - 2) : 0;
  return d2 <= r * r && d2 >= r2;
}

void renderFrame() {
  for (int y = 0; y < GH; y++) {
    int base = y * GW;
    bool dirty = forceFullRedraw;
    for (int x = 0; x < GW; x++) {
      uint8_t a = inCursorRing(x, y) ? 0xFF : appearanceKey(grid[base + x], life[base + x]);
      if (a != prevApp[base + x]) { prevApp[base + x] = a; dirty = true; }
    }
    if (!dirty) continue;

    uint16_t *p = lineBuf;
    for (int x = 0; x < GW; x++) {
      uint16_t c = inCursorRing(x, y) ? COL_CURSOR
                                      : colorOf(grid[base + x], life[base + x], x, y);
      *p++ = c;
      *p++ = c;
    }
    int py = BAR + y * CELL;
    lcd.pushImage(0, py, SCR_W, 1, lineBuf);
    lcd.pushImage(0, py + 1, SCR_W, 1, lineBuf);
  }
  forceFullRedraw = false;
}

void drawBar() {
  lcd.fillRect(0, 0, SCR_W, BAR, COL_BAR_BG);
  lcd.drawFastHLine(0, BAR - 1, SCR_W, COL_UI_LINE);
  uint8_t m = PALETTE[selIdx];
  lcd.fillRect(3, 3, 11, 11, MAT_COL[m][0]);
  lcd.drawRect(2, 2, 13, 13, COL_BAR_FG);

  lcd.setTextSize(1);
  lcd.setTextColor(COL_BAR_FG, COL_BAR_BG);
  lcd.setCursor(19, 5);
  lcd.print(MAT_NAME[m]);

  lcd.setTextColor(COL_ACCENT, COL_BAR_BG);
  lcd.setCursor(96, 5);
  lcd.print(TOOL_NAME[tool]);

  lcd.setTextColor(COL_BAR_FG, COL_BAR_BG);
  char buf[24];
  snprintf(buf, sizeof(buf), "B%d", brush);
  lcd.setCursor(160, 5);
  lcd.print(buf);
  snprintf(buf, sizeof(buf), "%dx", simSpeed);
  lcd.setCursor(196, 5);
  lcd.print(buf);
  snprintf(buf, sizeof(buf), "%2ufps", (unsigned)fps);
  lcd.setCursor(232, 5);
  lcd.print(buf);

  if (paused) {
    lcd.setTextColor(FIRE_COL[2], COL_BAR_BG);
    lcd.setCursor(292, 5);
    lcd.print("||");
  }
  barDirty = false;
}

/* --------------------------------------------------------------------------
 *  Painting
 * -------------------------------------------------------------------------- */
void paintDot(int gx, int gy) {
  uint8_t m = PALETTE[selIdx];
  if (m == M_ERASER) m = M_EMPTY;
  int r = brush;
  for (int dy = -r; dy <= r; dy++) {
    int y = gy + dy;
    if ((unsigned)y >= (unsigned)GH) continue;
    for (int dx = -r; dx <= r; dx++) {
      int x = gx + dx;
      if ((unsigned)x >= (unsigned)GW) continue;
      if (tool != 2 && dx * dx + dy * dy > r * r) continue;
      if (tool == 1 && rndN(100) > 32) continue;
      int i = y * GW + x;
      grid[i] = m;
      life[i] = startLife(m);
      movedf[i] = 0;
    }
  }
}

void paintLine(int x0, int y0, int x1, int y1) {
  int dx = x1 - x0, dy = y1 - y0;
  int steps = abs(dx) > abs(dy) ? abs(dx) : abs(dy);
  if (steps == 0) { paintDot(x0, y0); return; }
  for (int s = 0; s <= steps; s++) paintDot(x0 + dx * s / steps, y0 + dy * s / steps);
}

/* --------------------------------------------------------------------------
 *  World management + demo
 * -------------------------------------------------------------------------- */
void clearWorld() {
  memset(grid, 0, sizeof(grid));
  memset(life, 0, sizeof(life));
  memset(movedf, 0, sizeof(movedf));
  forceFullRedraw = true;
}

void rectCells(int x0, int y0, int x1, int y1, uint8_t m) {
  for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) setCell(x, y, m);
}

void demoScene() {
  clearWorld();
  rectCells(0, GH - 3, GW - 1, GH - 1, M_WALL);      // floor
  rectCells(10, 40, 11, GH - 4, M_BRICK);            // left tank
  rectCells(60, 40, 61, GH - 4, M_BRICK);
  rectCells(10, 88, 61, 89, M_BRICK);
  rectCells(12, 70, 59, 87, M_WATER);
  rectCells(12, 64, 59, 69, M_OIL);                   // oil floats on water
  rectCells(95, 36, 97, GH - 4, M_STONE);            // volcano chimney
  rectCells(125, 36, 127, GH - 4, M_STONE);
  rectCells(97, GH - 10, 125, GH - 4, M_LAVA);
  rectCells(104, 35, 118, 35, M_VOLCANO);
  rectCells(72, 82, 82, 87, M_WOOD);
  rectCells(76, 70, 78, 81, M_FUSE);
  rectCells(75, 68, 79, 69, M_BOMB);
  rectCells(68, 28, 90, 32, M_SAND);                  // falls when unpaused
  rectCells(30, 24, 45, 25, M_CLOUD);
  forceFullRedraw = true;
  barDirty = true;
}

/* --------------------------------------------------------------------------
 *  Material picker overlay
 * -------------------------------------------------------------------------- */
constexpr int PICK_COLS = 9;
constexpr int PICK_ROWS = 4;
constexpr int PICK_X = 16;
constexpr int PICK_Y = 37;
constexpr int PICK_W = 32;
constexpr int PICK_H = 32;

void drawPicker() {
  lcd.fillRect(0, BAR, SCR_W, SCR_H - BAR, COL_MENU_BG);
  lcd.setTextSize(1);
  lcd.setTextColor(COL_BAR_FG, COL_MENU_BG);
  lcd.setCursor(16, 22);
  lcd.print("Pick a material   A/tap: choose   B: back");
  for (int n = 0; n < PAL_COUNT; n++) {
    int x = PICK_X + (n % PICK_COLS) * PICK_W;
    int y = PICK_Y + (n / PICK_COLS) * PICK_H;
    uint8_t m = PALETTE[n];
    lcd.fillRect(x + 3, y + 3, PICK_W - 6, PICK_H - 6, MAT_COL[m][0]);
    uint16_t border = n == selIdx ? COL_ACCENT : COL_MENU_LINE;
    lcd.drawRect(x + 1, y + 1, PICK_W - 2, PICK_H - 2, border);
    if (n == selIdx) lcd.drawRect(x, y, PICK_W, PICK_H, COL_ACCENT);
  }
  lcd.setTextColor(COL_ACCENT, COL_MENU_BG);
  lcd.setCursor(16, 179);
  lcd.print(MAT_NAME[PALETTE[selIdx]]);
}

void closeOverlay() {
  menuOpen = false;
  pickOpen = false;
  memset(prevApp, 0xFF, sizeof(prevApp));
  forceFullRedraw = true;
  barDirty = true;
}

void pickerInput() {
  int s = selIdx;
  if (hit(T_LEFT))  s--;
  if (hit(T_RIGHT)) s++;
  if (hit(T_UP))    s -= PICK_COLS;
  if (hit(T_DOWN))  s += PICK_COLS;
  while (s < 0) s += PAL_COUNT;
  while (s >= PAL_COUNT) s -= PAL_COUNT;
  if (s != selIdx) { selIdx = s; drawPicker(); }
  if (padsPressed & T_A) { closeOverlay(); return; }
  if (padsPressed & (T_B | T_SELECT | T_MENU)) { closeOverlay(); return; }

  uint16_t tx, ty;
  if (lcd.getTouch(&tx, &ty)) {
    if (ty >= PICK_Y && ty < PICK_Y + PICK_ROWS * PICK_H &&
        tx >= PICK_X && tx < PICK_X + PICK_COLS * PICK_W) {
      int col = (tx - PICK_X) / PICK_W;
      int row = (ty - PICK_Y) / PICK_H;
      int n = row * PICK_COLS + col;
      if (n < PAL_COUNT) { selIdx = n; closeOverlay(); }
    }
  }
}

/* --------------------------------------------------------------------------
 *  Function menu
 * -------------------------------------------------------------------------- */
const char *const MENU_NAME[] = {
  "Resume", "Clear world", "Load demo", "Pause / run", "Speed", "Tool",
  "Brush size", "Color fix", "Color test", "Calibrate touch"
};
constexpr int MENU_COUNT = sizeof(MENU_NAME) / sizeof(MENU_NAME[0]);

void drawMenu() {
  lcd.fillRect(0, BAR, SCR_W, SCR_H - BAR, COL_MENU_BG);
  lcd.setTextSize(1);
  lcd.setTextColor(COL_BAR_FG, COL_MENU_BG);
  lcd.setCursor(12, 21);
  lcd.print("FUNCTIONS    A: select/change   MENU: back");

  for (int n = 0; n < MENU_COUNT; n++) {
    int y = 34 + n * 19;
    if (n == menuSel) lcd.fillRect(6, y - 2, SCR_W - 12, 17, COL_MENU_SEL);
    lcd.setTextColor(n == menuSel ? COL_ACCENT : COL_BAR_FG,
                     n == menuSel ? COL_MENU_SEL : COL_MENU_BG);
    lcd.setCursor(14, y + 2);
    lcd.print(MENU_NAME[n]);

    char val[16]; val[0] = 0;
    if (n == 3) snprintf(val, sizeof(val), "%s", paused ? "Paused" : "Running");
    if (n == 4) snprintf(val, sizeof(val), "%dx", simSpeed);
    if (n == 5) snprintf(val, sizeof(val), "%s", TOOL_NAME[tool]);
    if (n == 6) snprintf(val, sizeof(val), "%d", brush);
    if (n == 7) snprintf(val, sizeof(val), "%s%s", (colorMode & 1) ? "BGR" : "RGB",
                          (colorMode & 2) ? " + INV" : "");
    if (val[0]) { lcd.setCursor(238, y + 2); lcd.print(val); }
  }
}

void saveColorMode() {
  prefs.begin("vidix-sand", false);
  prefs.putUChar("color", colorMode);
  prefs.end();
  Serial.print("Color mode: "); Serial.println(colorMode);
}

void menuInput() {
  if (hit(T_UP))   { menuSel = (menuSel + MENU_COUNT - 1) % MENU_COUNT; drawMenu(); }
  if (hit(T_DOWN)) { menuSel = (menuSel + 1) % MENU_COUNT; drawMenu(); }
  int delta = hit(T_RIGHT) ? 1 : (hit(T_LEFT) ? -1 : 0);
  bool activate = (padsPressed & T_A) || delta;
  if (activate) {
    if (delta == 0) delta = 1;
    switch (menuSel) {
      case 0: closeOverlay(); return;
      case 1: clearWorld(); closeOverlay(); return;
      case 2: demoScene(); closeOverlay(); return;
      case 3: paused = !paused; break;
      case 4: simSpeed = (simSpeed + 3 + delta) % 4 + 1; break;
      case 5: tool = (tool + 3 + delta) % 3; break;
      case 6: brush = constrain((int)brush + delta, 1, 8); break;
      case 7: colorMode = (colorMode + 4 + delta) % 4; applyColorMode(); saveColorMode(); break;
      case 8: closeOverlay(); colorTestUntil = millis() + 3000; return;
      case 9: {
        uint16_t cal[8];
        lcd.fillScreen(COL_MENU_BG);
        lcd.setCursor(10, 10); lcd.setTextColor(COL_BAR_FG, COL_MENU_BG);
        lcd.println("Touch the four corners as prompted...");
        lcd.calibrateTouch(cal, COL_BAR_FG, COL_MENU_BG, 15);
        lcd.setTouchCalibrate(cal);
        closeOverlay();
        return;
      }
    }
    drawMenu();
  }
  if (padsPressed & (T_MENU | T_B)) closeOverlay();
}

/* --------------------------------------------------------------------------
 *  Buttons in normal play
 * -------------------------------------------------------------------------- */
void normalInput() {
  if (hit(T_LEFT))  { selIdx = (selIdx + PAL_COUNT - 1) % PAL_COUNT; barDirty = true; }
  if (hit(T_RIGHT)) { selIdx = (selIdx + 1) % PAL_COUNT; barDirty = true; }
  if (hit(T_UP))    { brush = min(8, (int)brush + 1); barDirty = true; }
  if (hit(T_DOWN))  { brush = max(1, (int)brush - 1); barDirty = true; }
  if (padsPressed & T_A) { paused = !paused; barDirty = true; }
  if (padsPressed & T_SELECT) { pickOpen = true; drawPicker(); return; }
  if (padsPressed & T_MENU)   { menuOpen = true; drawMenu(); return; }
  if (padsPressed & T_START)  { demoScene(); return; }

  if (padsStable & T_B) {
    if (!bHolding) { bHolding = true; bHoldStart = millis(); }
    if (millis() - bHoldStart >= 600) { clearWorld(); bHolding = false; }
  } else {
    bHolding = false;
  }
}

/* --------------------------------------------------------------------------
 *  Touch painting
 * -------------------------------------------------------------------------- */
void updateTouch() {
  uint16_t tx, ty;
  bool touching = lcd.getTouch(&tx, &ty);
  uint32_t now = millis();
  if (touching && ty >= BAR) {
    curPxX = tx;
    curPxY = ty - BAR;
    cursorOn = true;
    lastTouchMs = now;
    int gx = constrain((int)tx / CELL, 0, GW - 1);
    int gy = constrain(((int)ty - BAR) / CELL, 0, GH - 1);
    if (wasTouching) paintLine(lastPaintX, lastPaintY, gx, gy);
    else paintDot(gx, gy);
    lastPaintX = gx; lastPaintY = gy;
    wasTouching = true;
  } else {
    wasTouching = false;
    if (cursorOn && now - lastTouchMs > 450) cursorOn = false;
  }
}

/* --------------------------------------------------------------------------
 *  Setup / main loop
 * -------------------------------------------------------------------------- */
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(BTN_LR, INPUT); pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP); pinMode(BTN_B, INPUT_PULLUP);
  pinMode(BTN_SELECT, INPUT_PULLUP); pinMode(BTN_MENU, INPUT_PULLUP);
  pinMode(BTN_START, INPUT); pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  lcd.init();
  lcd.setRotation(0);
  lcd.setSwapBytes(true);
  prefs.begin("vidix-sand", true);
  colorMode = prefs.getUChar("color", COLOR_MODE_DEFAULT) & 3;
  prefs.end();
  applyColorMode();
  clearWorld();
  memset(prevApp, 0xFF, sizeof(prevApp));

  Serial.println();
  Serial.println("=== VIDI X Sandbox v2 ===");
  Serial.println("Touch to paint. SELECT: palette. MENU: functions. START: demo.");
  Serial.print("Color mode: "); Serial.println(colorMode);
  Serial.print("Free heap:  "); Serial.println(ESP.getFreeHeap());
  fpsStart = millis();
  lcd.fillScreen(COL_BG);
  demoScene();
}

void loop() {
  uint32_t t0 = millis();
  updatePads();
  if (pickOpen) { pickerInput(); delay(FRAME_MS); return; }
  if (menuOpen) { menuInput(); delay(FRAME_MS); return; }

  normalInput();
  if (pickOpen || menuOpen) return;
  updateTouch();
  if (!paused) for (int s = 0; s < simSpeed; s++) simulateStep();
  renderFrame();
  if (barDirty) drawBar();

  if (bHolding) {
    int w = constrain((int)(millis() - bHoldStart) * SCR_W / 600, 0, SCR_W);
    lcd.fillRect(0, BAR - 2, w, 2, COL_HOLD);
  }

  if (colorTestUntil && millis() < colorTestUntil) {
    lcd.fillRect(0, BAR, 40, 20, conv565(RGB565(255, 0, 0)));    // red
    lcd.fillRect(40, BAR, 40, 20, conv565(RGB565(0, 255, 0)));   // green
    lcd.fillRect(80, BAR, 40, 20, conv565(RGB565(0, 0, 255)));   // blue
    lcd.fillRect(120, BAR, 40, 20, conv565(RGB565(255, 255, 255))); // white
    forceFullRedraw = true;
  } else if (colorTestUntil) {
    colorTestUntil = 0;
    forceFullRedraw = true;
  }

  fpsFrames++;
  uint32_t now = millis();
  if (now - fpsStart >= 1000) {
    fps = fpsFrames * 1000 / (now - fpsStart);
    fpsFrames = 0; fpsStart = now;
    barDirty = true;
  }
  int remain = FRAME_MS - (int)(millis() - t0);
  if (remain > 0) delay(remain);
  else delay(1);  // keep the ESP32's Wi-Fi / idle task happy
}
