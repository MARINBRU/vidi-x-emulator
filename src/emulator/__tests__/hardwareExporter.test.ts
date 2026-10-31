import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { transpileArduinoSketch } from '../arduinoRuntime';
import { VidiXClusterManager } from '../clusterManager';
import {
  addVidiXHardwareSupport,
  exportForRealVidiXHardware,
  needsVidiXDisplayConfig,
} from '../hardwareExporter';
import { createInitialPins, VIDI_X_PINS } from '../pinout';
import {
  createDefaultUserProjects,
  DEFAULT_STARTER_CPP,
  getActiveProjectIdFromCookie,
  loadProjectsFromCookies,
  saveProjectsToCookies,
} from '../projectStorage';

const legacyStarter = readFileSync(
  new URL('./fixtures/legacy-starter.ino', import.meta.url),
  'utf8'
);
const displayClasses = (code: string) => code.match(/class\s+LGFX\s*:\s*public\s+lgfx::LGFX_Device/g) || [];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('VIDI X Arduino starter and hardware export', () => {
  it('includes one real display configuration and PSRAM setup in the editor and export', () => {
    const starter = DEFAULT_STARTER_CPP;
    const standalone = readFileSync(new URL('../../../examples/VIDIXStarter/VIDIXStarter.ino', import.meta.url), 'utf8');
    expect(standalone).toBe(starter);
    const exported = exportForRealVidiXHardware(starter, 'Test');

    for (const code of [starter, exported]) {
      expect(displayClasses(code)).toHaveLength(1);
      expect(code.indexOf('#define LGFX_USE_V1')).toBeLessThan(code.indexOf('#include <LovyanGFX.hpp>'));
      expect(code.indexOf('class LGFX')).toBeLessThan(code.indexOf('LGFX lcd;'));
      expect(code).toContain('cfg.pin_rst = -1;');
      expect(code).not.toMatch(/cfg\.pin_rst\s*=\s*4\s*;/);
      expect(code).toContain('cfg.pin_cs = 5;');
      expect(code).toContain('cfg.pin_dc = 21;');
      expect(code).toContain('cfg.pin_sclk = 18;');
      expect(code).toContain('cfg.pin_mosi = 23;');
      expect(code).toContain('cfg.pin_miso = 19;');
      expect(code).toContain('canvas.setPsram(true);');
      expect(code.match(/BEGIN VIDI X LEGACY TONE COMPATIBILITY/g)).toHaveLength(1);
      expect(needsVidiXDisplayConfig(code)).toBe(false);
    }
    expect(exported.match(/canvas\.setPsram\(true\)/g)).toHaveLength(1);
    expect(addVidiXHardwareSupport(starter)).toBe(starter);
  });

  it('continues to run the self-contained starter in the emulator', async () => {
    const { jsCode } = transpileArduinoSketch(DEFAULT_STARTER_CPP);
    expect(jsCode).not.toContain('vidiXLegacyTone');
    expect(() => new Function(jsCode)).not.toThrow();

    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    try {
      cluster.updateSketch(board.state.id, DEFAULT_STARTER_CPP, 'Starter');
      cluster.startBoard(board.state.id);
      await wait(100);
      expect(board.state.compileError).toBeNull();
      expect(board.state.running).toBe(true);
      expect(board.display.readPixel(160, 120)).toBe(0x07e0);

      cluster.setButtonState(board.state.id, 'A', true);
      await wait(80);
      cluster.setButtonState(board.state.id, 'A', false);
      expect(board.state.rgbLeds.some((led) => led.g > 0 && led.b > 0)).toBe(true);
      expect(board.state.compileError).toBeNull();
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('upgrades only untouched old starter projects, retaining edits and the active project', () => {
    const projects = createDefaultUserProjects().slice(0, 2);
    projects[0].sketchCode = legacyStarter;
    projects[1] = {
      ...projects[0],
      id: 'customized-cpp',
      name: 'My edited code',
      sketchCode: legacyStarter.replace('int score = 0;', 'int score = 42;'),
    };
    const edited = projects[1].sketchCode;
    saveProjectsToCookies(projects, projects[1].id);

    const loaded = loadProjectsFromCookies();
    expect(loaded[0].sketchCode).toBe(DEFAULT_STARTER_CPP);
    expect(loaded[1].sketchCode).toBe(edited);
    expect(loaded[1].name).toBe('My edited code');
    expect(getActiveProjectIdFromCookie()).toBe('customized-cpp');
  });

  it('adds display and audio support to an edited legacy copy without changing its source', () => {
    const edited = legacyStarter.replace('int score = 0;', 'int score = 42;');
    expect(needsVidiXDisplayConfig(edited)).toBe(true);
    const exported = exportForRealVidiXHardware(edited, 'Edited');
    expect(displayClasses(exported)).toHaveLength(1);
    expect(exported).toContain('int score = 42;');
    expect(exported).toContain('cfg.pin_rst = -1;');
    expect(exported).toContain('#ifndef ESP_ARDUINO_VERSION_MAJOR');
    expect(exported).toContain('canvas.setPsram(true);');
    expect(edited).not.toContain('class LGFX :');
  });

  it('includes the hardware network initializer used by multiplayer sketches', () => {
    const source = '#include <LovyanGFX.hpp>\nLGFX lcd;\nvoid setup() { VidiNetwork.begin(); }\nvoid loop() {}';
    const result = exportForRealVidiXHardware(source);
    expect(result).toContain('void begin() {\n    ensureInit();\n  }');
    expect(result).toContain('VidiNetwork.begin();');
  });

  it('respects existing display classes, aliases, autodetection, and named config headers', () => {
    const existing = '#include <LovyanGFX.hpp>\nclass LGFX : public lgfx::LGFX_Device {};\nLGFX lcd;';
    const struct = 'struct LGFX { };\nLGFX lcd;';
    const alias = 'using LGFX = SomeDisplay;\nLGFX lcd;';
    const auto = '#define LGFX_AUTODETECT\n#include <LovyanGFX.hpp>\nLGFX lcd;';
    const header = '#include "LGFX_MyBoard.hpp"\nLGFX lcd;';
    for (const source of [existing, struct, alias, auto, header]) {
      expect(needsVidiXDisplayConfig(source)).toBe(false);
      expect(addVidiXHardwareSupport(source)).toBe(source);
    }
  });

  it('ignores misleading comments/strings and handles quoted includes without duplicate macros', () => {
    const code = '#define LGFX_USE_V1\n#include "LovyanGFX.hpp" // include\n'
      + '// class LGFX {};\nLGFX lcd;\n'
      + 'void setup() { Serial.println("canvas.createSprite(320, 240); tone(1,2,3)"); }\n';
    expect(needsVidiXDisplayConfig(code)).toBe(true);
    const result = exportForRealVidiXHardware(code);
    expect(displayClasses(result)).toHaveLength(1);
    expect(result.match(/#define LGFX_USE_V1/g)).toHaveLength(1);
    expect(result).not.toContain('BEGIN VIDI X LEGACY TONE COMPATIBILITY');
    expect(result).toContain('Serial.println("canvas.createSprite(320, 240); tone(1,2,3)")');
    expect(needsVidiXDisplayConfig('void setup() { Serial.println("LGFX lcd;"); }')).toBe(false);
  });

  it('reflects the display and touch pins in the simulated hardware', () => {
    expect(VIDI_X_PINS.TFT_RST).toBe(-1);
    expect(VIDI_X_PINS.TOUCH_CS).toBe(4);
    expect(VIDI_X_PINS.TOUCH_IRQ).toBe(12);
    const pins = createInitialPins();
    expect(pins[4]).toBeDefined();
    expect(pins[12].digitalValue).toBe(1);
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    cluster.setTouchState(board.state.id, { pressed: true, x: 40, y: 80 });
    expect(board.state.pins[12].digitalValue).toBe(0);
    expect(board.state.touch).toMatchObject({ x: 40, y: 80 });
    cluster.setTouchState(board.state.id, { pressed: false });
    expect(board.state.pins[12].digitalValue).toBe(1);
    cluster.stopBoard(board.state.id);
  });
});

describe('legacy premade hardware compatibility', () => {
  it('supplies physical pin aliases and removes only simulator-only direct button checks', async () => {
    const { PREMADE_PLAYABLE_PROJECTS, selectPremadeVariant } = await import('../projectStorage');
    const block = PREMADE_PLAYABLE_PROJECTS.find((p) => p.id === 'premade-block-0')!;
    const source = selectPremadeVariant(block, 'cpp').sketchCode;
    const exported = exportForRealVidiXHardware(source, 'Blocks');
    expect(exported).toContain('#define TFT_CS 5');
    expect(exported).toContain('#define BTN_B 33');
    expect(exported).not.toMatch(/digitalRead\(BTN_(?:LEFT|RIGHT|UP|DOWN|SELECT|START)\)/);
    expect(exported).toMatch(/if \(\(analogRead\(BTN_LR\) > 3800\)\)/);
    expect(exported).toContain('int getBoardNumber() { return boardIndex() + 1; }');
    expect(exported).toContain('const char *getMac()');
    expect(source).not.toContain('BEGIN VIDI X LEGACY PIN COMPATIBILITY');
    const withQuotedText = source + '\n// || digitalRead(BTN_UP) == LOW\nvoid note() { Serial.println(" || digitalRead(BTN_UP) == LOW"); }\n';
    const quotedExport = exportForRealVidiXHardware(withQuotedText);
    expect(quotedExport).toContain('Serial.println(" || digitalRead(BTN_UP) == LOW")');
    expect(quotedExport).toContain('// || digitalRead(BTN_UP) == LOW');
    const twice = exportForRealVidiXHardware(exported, 'Blocks');
    expect(twice.match(/BEGIN VIDI X LEGACY PIN COMPATIBILITY/g)).toHaveLength(1);
  });
});
