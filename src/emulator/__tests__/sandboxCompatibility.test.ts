import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { transpileArduinoSketch } from '../arduinoRuntime';
import { VidiXClusterManager } from '../clusterManager';
import { createInitialPins, syncHardwareToPins } from '../pinout';
import { SimulatedPreferences } from '../preferences';
import type { ButtonId, SensorState } from '../types';

// Representative reconstruction, not the user's original sketch.
const sandbox = readFileSync(new URL('./fixtures/SandboxCompatibility.ino', import.meta.url), 'utf8');
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, message: string, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}`);
    await wait(20);
  }
}

const txText = (board: ReturnType<VidiXClusterManager['getBoards']>[number]) =>
  board.state.serialLog.filter((message) => message.direction === 'tx').map((message) => message.text).join('');

describe('Arduino Sandbox compatibility', () => {
  it('transpiles the representative Sandbox-style sketch into valid JavaScript', () => {
    const result = transpileArduinoSketch(sandbox);
    expect(result.userFunctions).toContain('setup');
    expect(result.userFunctions).toContain('loop');
    expect(() => new Script(result.jsCode)).not.toThrow();
  });

  it('handles integer expressions, typed arrays, macros, pointer writes, sizeof and C strings', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const code = `
      #define RGB565(r, g, b) ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))
      #define SHIFT 5
      #define INNER(v) ((v) << SHIFT)
      #define OUTER(v) \\
        INNER(v)
      constexpr int COLS = 9;
      enum : uint8_t { FIRST = 3, SECOND, THIRD = 8 };
      const char *const names[] = {"one", "two", "RGB565(1,2,3)"};
      uint8_t bytes[4];
      uint16_t pixels[4];
      uint16_t partial[2];
      uint32_t state = 0x1BADF00DUL;
      uint32_t shared = 0;
      LGFX lcd;
      int signedShift(int shared) { return shared >> 1; }
      uint32_t nextValue() {
        state ^= state << 13; state ^= state >> 17; state ^= state << 5;
        return state;
      }
      void independentScope() {
        int p[2] = {7, 8};
        Serial.printf("other:%d|", p[0]);
      }
      void setup() {
        int n = 1;
        int row = 37 + (n / COLS) * 32;
        int negative = -7 / 2;
        float fractional = 7.0 / 2;
        memset(bytes, 0xff, sizeof(bytes));
        bytes[0] = 400; bytes[1] = 0; bytes[1]--;
        memset(partial, 0x12, 3);
        memset(pixels, 0xff, sizeof(pixels));
        uint16_t *p = pixels;
        *p++ = RGB565(255, 0, 0);
        *p++ = RGB565(0, 255, 0);
        p[0] = RGB565(0, 0, 255);
        p++; *p = 0xffff;
        lcd.pushImage(0, 0, 4, 1, pixels);
        independentScope();
        Serial.printf("signed:%d|", signedShift(-2));
        uint8_t tiny = 1;
        uint16_t wide = 2;
        Serial.printf("sizes:%d,%d,%d,%d|", sizeof(tiny), sizeof wide, sizeof(uint8_t), sizeof(uint16_t));
        Serial.printf("casts:%u,%d|", (unsigned)-1, (uint8_t)bytes[0]);
        char text[5];
        char label[8] = "HI";
        label[0] = 'B';
        int written = snprintf(text, sizeof(text), "%s-%d", "AB", 123);
        text[0] = 'Z';
        Serial.printf("values:%d,%d,%d|%d,%d,%.1f|%d,%d|%d,%d,%d,%d|%d,%d|%d,%s|%s,%d|%d|%s|%u",
          FIRST, SECOND, THIRD, row, negative, fractional,
          sizeof(names) / sizeof(names[0]), sizeof(pixels), bytes[0], bytes[1], bytes[2], pixels[2],
          partial[0], partial[1], written, text, label, sizeof(label), OUTER(3), names[2], nextValue());
      }
      void loop() { delay(50); }
    `;
    let expectedRandom = 0x1badf00d;
    expectedRandom = (expectedRandom ^ (expectedRandom << 13)) >>> 0;
    expectedRandom = (expectedRandom ^ (expectedRandom >>> 17)) >>> 0;
    expectedRandom = (expectedRandom ^ (expectedRandom << 5)) >>> 0;
    try {
      cluster.updateSketch(board.state.id, code, 'C++ compatibility');
      cluster.startBoard(board.state.id);
      await waitUntil(() => txText(board).includes('values:'), 'compatibility output');
      expect(board.state.compileError).toBeNull();
      expect(txText(board)).toContain('other:7|signed:-1|sizes:1,2,1,2|casts:4294967295,144|');
      expect(txText(board)).toContain(`values:3,4,8|37,-3,3.5|3,8|144,255,255,31|4626,18|6,ZB-1|BI,8|96|RGB565(1,2,3)|${expectedRandom}`);
      expect(board.display.readPixel(0, 0)).toBe(0xf800);
      expect(board.display.readPixel(1, 0)).toBe(0x07e0);
      expect(board.display.readPixel(2, 0)).toBe(0x001f);
      expect(board.display.readPixel(3, 0)).toBe(0xffff);
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('lets the browser stop a sketch with a busy braced C++ loop', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    try {
      cluster.updateSketch(board.state.id, `void setup() {}\nvoid loop() { while (true) { } }`, 'Busy loop');
      cluster.startBoard(board.state.id);
      await wait(40);
      expect(board.state.running).toBe(true);
      cluster.stopBoard(board.state.id);
      await wait(20);
      expect(board.state.running).toBe(false);
      expect(board.state.compileError).toBeNull();
    } finally {
      cluster.stopBoard(board.state.id);
    }
  }, 5000);

  it('honors ADC resolution and supplies simulated heap and touch calibration APIs', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const code = `
      LGFX lcd;
      void setup() {
        analogReadResolution(10);
        int a = analogRead(34);
        analogReadResolution(12);
        int b = analogRead(34);
        uint16_t cal[8];
        lcd.setSwapBytes(true);
        lcd.calibrateTouch(cal, 0xffff, 0, 15);
        lcd.setTouchCalibrate(cal);
        Serial.printf("adc:%d,%d heap:%u cal:%u,%u", a, b, ESP.getFreeHeap(), cal[2], cal[7]);
      }
      void loop() { delay(50); }
    `;
    try {
      cluster.setButtonState(board.state.id, 'RIGHT', true);
      cluster.updateSketch(board.state.id, code, 'Hardware APIs');
      cluster.startBoard(board.state.id);
      await waitUntil(() => txText(board).includes('adc:'), 'hardware API output');
      expect(board.state.compileError).toBeNull();
      expect(txText(board)).toContain('adc:500,2000 heap:204800 cal:319,239');
      expect(txText(board)).toContain('Touch coordinates are already calibrated');
    } finally {
      cluster.setButtonState(board.state.id, 'RIGHT', false);
      cluster.stopBoard(board.state.id);
    }
  });

  it('maps the physical START and SELECT buttons independently without losing legacy analog values', () => {
    const pins = createInitialPins();
    const buttons: Record<ButtonId, boolean> = {
      UP: false, DOWN: false, LEFT: false, RIGHT: false, A: false, B: false,
      START: false, SELECT: false, MENU: false, VOL_UP: false, VOL_DOWN: false,
      BOOT: false, RESET: false,
    };
    const sensors: SensorState = {
      temperatureC: 25, lightLevel: 0, micLevel: 0, micFrequency: 440,
      batteryVoltage: 4, irLastCode: 0, irAvailable: false,
      tempLightJumper: 'LIGHT', dpadMapping: 'STD_34LR_35UD',
    };
    syncHardwareToPins(pins, buttons, sensors, 0);
    expect(pins[39].digitalValue).toBe(1); // idle even when the simulated light is dark
    expect(pins[27].digitalValue).toBe(1);
    buttons.START = true;
    syncHardwareToPins(pins, buttons, sensors, 0);
    expect(pins[39].digitalValue).toBe(0);
    expect(pins[27].digitalValue).toBe(1);
    expect(pins[27].analogValue).toBe(2000); // backward-compatible simulator alias
    buttons.START = false;
    buttons.SELECT = true;
    syncHardwareToPins(pins, buttons, sensors, 0);
    expect(pins[39].digitalValue).toBe(1);
    expect(pins[27].digitalValue).toBe(0);
    expect(pins[27].analogValue).toBe(4095);
  });

  it('renders and interacts with a full-size representative scene, picker, touch, menu, START and NVS', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const prefs = new SimulatedPreferences(board.state.id);
    prefs.begin('vidix-sand'); prefs.clear(); prefs.end();
    const printed: string[] = [];
    let selectedMenu = -1;
    const print = board.display.print.bind(board.display);
    const fillRect = board.display.fillRect.bind(board.display);
    vi.spyOn(board.display, 'print').mockImplementation((value) => {
      printed.push(String(value ?? ''));
      print(value);
    });
    vi.spyOn(board.display, 'fillRect').mockImplementation((x, y, w, h, color) => {
      if (x === 6 && w === 308 && h === 17) selectedMenu = (y - 32) / 19;
      fillRect(x, y, w, h, color);
    });
    const pressUntil = async (button: ButtonId, condition: () => boolean, message: string) => {
      cluster.setButtonState(board.state.id, button, true);
      try { await waitUntil(condition, message); } finally {
        cluster.setButtonState(board.state.id, button, false);
      }
      // The sketch debounces both press and release over two frames.
      await wait(130);
    };
    try {
      cluster.updateSketch(board.state.id, sandbox, 'Representative Sandbox');
      cluster.startBoard(board.state.id);
      await waitUntil(() => printed.includes('WALL'), 'initial scene');
      expect(board.state.compileError).toBeNull();
      expect(txText(board)).toContain('VIDI X Sandbox v2');
      expect(board.display.readPixel(1, 238)).not.toBe(board.display.readPixel(300, 25));

      let mark = printed.length;
      await pressUntil('SELECT', () => printed.slice(mark).some((s) => s.startsWith('Pick a material')), 'picker');
      const menuBackground = board.display.readPixel(5, 220);
      // All nine swatches occupy the same row; integer division must not
      // diagonally stagger the last columns.
      expect(board.display.readPixel(24, 45)).not.toBe(menuBackground);
      expect(board.display.readPixel(248, 45)).not.toBe(menuBackground);
      expect(board.display.readPixel(280, 45)).not.toBe(menuBackground);

      mark = printed.length;
      cluster.setTouchState(board.state.id, { pressed: true, x: 120, y: 77, z: 1000 });
      await waitUntil(() => printed.slice(mark).includes('SAND'), 'touch selection of sand');
      cluster.setTouchState(board.state.id, { pressed: false, z: 0 });
      await wait(150);

      mark = printed.length;
      await pressUntil('A', () => printed.slice(mark).includes('||'), 'pause');
      const background = board.display.readPixel(300, 25);
      cluster.setTouchState(board.state.id, { pressed: true, x: 300, y: 25, z: 1000 });
      await waitUntil(() => board.display.readPixel(300, 25) !== background, 'touch painting');
      cluster.setTouchState(board.state.id, { pressed: false, z: 0 });
      await wait(150);

      mark = printed.length;
      await pressUntil('RIGHT', () => printed.slice(mark).includes('ASH'), 'D-pad material change');
      await pressUntil('START', () => board.display.readPixel(300, 25) === background, 'START demo reload');

      mark = printed.length;
      await pressUntil('MENU', () => printed.slice(mark).some((s) => s.startsWith('FUNCTIONS')), 'function menu');
      expect(selectedMenu).toBe(0);
      await pressUntil('UP', () => selectedMenu === 9, 'menu item 9');
      await pressUntil('UP', () => selectedMenu === 8, 'menu item 8');
      await pressUntil('UP', () => selectedMenu === 7, 'color setting');
      await pressUntil('A', () => txText(board).includes('Color mode: 1'), 'saved color mode');
      prefs.begin('vidix-sand', true);
      expect(prefs.getUChar('color', 0)).toBe(1);
      prefs.end();

      await pressUntil('DOWN', () => selectedMenu === 8, 'menu item 8');
      await pressUntil('DOWN', () => selectedMenu === 9, 'touch calibration menu');
      await pressUntil('A', () => txText(board).includes('Touch coordinates are already calibrated'), 'simulated touch calibration');
      expect(board.state.compileError).toBeNull();

      const logMark = board.state.serialLog.length;
      cluster.resetBoard(board.state.id);
      await waitUntil(() => board.state.serialLog.slice(logMark).some((entry) => entry.text.includes('Sandbox v2')), 'restart');
      const restartLog = board.state.serialLog.slice(logMark).map((entry) => entry.text).join('');
      expect(restartLog).toContain('Color mode: 1');
      expect(board.state.compileError).toBeNull();
    } finally {
      cluster.stopBoard(board.state.id);
      prefs.begin('vidix-sand'); prefs.clear(); prefs.end();
      vi.restoreAllMocks();
    }
  }, 30000);
});
