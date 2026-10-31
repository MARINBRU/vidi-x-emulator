import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_SKETCHES } from '../exampleSketches';
import { exportForRealVidiXHardware, needsVidiXDisplayConfig } from '../hardwareExporter';
import {
  createDefaultUserProjects,
  loadProjectsFromCookies,
  PREMADE_PLAYABLE_PROJECTS,
  saveProjectsToCookies,
  selectPremadeVariant,
} from '../projectStorage';

const item = PREMADE_PLAYABLE_PROJECTS.find((project) => project.id === 'premade-3d-maze')!;
const maze = selectPremadeVariant(item, 'cpp').sketchCode;
const legacyMaze = EXAMPLE_SKETCHES.find((sketch) => sketch.id === 'vidi-3d-maze-minimap-coins')!.code;
const displayClasses = (code: string) => code.match(/class\s+LGFX\s*:\s*public\s+lgfx::LGFX_Device/g) || [];
const hostCppAvailable = spawnSync('g++', ['--version'], { encoding: 'utf8' }).status === 0;

describe('C++ maze for real VIDI X hardware', () => {
  it('ships the same complete source in the premade editor and standalone file', () => {
    const standalone = readFileSync(new URL('../../../examples/VIDIXMaze/VIDIXMaze.ino', import.meta.url), 'utf8');
    expect(standalone).toBe(maze);
    for (const code of [maze, exportForRealVidiXHardware(maze, 'Maze')]) {
      expect(displayClasses(code)).toHaveLength(1);
      expect(needsVidiXDisplayConfig(code)).toBe(false);
      expect(code.indexOf('#define LGFX_USE_V1')).toBeLessThan(code.indexOf('#include <LovyanGFX.hpp>'));
      expect(code.indexOf('class LGFX')).toBeLessThan(code.indexOf('LGFX lcd;'));
      expect(code).toContain('cfg.spi_host = VSPI_HOST;');
      expect(code).toContain('cfg.pin_sclk = 18;');
      expect(code).toContain('cfg.pin_mosi = 23;');
      expect(code).toContain('cfg.pin_cs = 5;');
      expect(code).toContain('cfg.pin_dc = 21;');
      expect(code).toContain('cfg.pin_rst = -1;');
      expect(code.match(/canvas\.setPsram\(true\)/g)).toHaveLength(1);
      expect(code.match(/BEGIN VIDI X LEGACY TONE COMPATIBILITY/g)).toHaveLength(1);
    }
  });

  it('keeps existing edited projects unchanged while their hardware export is repaired', () => {
    expect(needsVidiXDisplayConfig(legacyMaze)).toBe(true);
    const project = createDefaultUserProjects()[0];
    project.sketchCode = legacyMaze.replace('float playerX = 1.5;', 'float playerX = 1.6;');
    saveProjectsToCookies([project], project.id);
    const saved = loadProjectsFromCookies().find((p) => p.id === project.id)!;
    expect(saved.sketchCode).toBe(project.sketchCode);
    const exported = exportForRealVidiXHardware(saved.sketchCode, 'Edited Maze');
    expect(exported).toContain('float playerX = 1.6;');
    expect(displayClasses(exported)).toHaveLength(1);
    expect(needsVidiXDisplayConfig(exported)).toBe(false);
    expect(saved.sketchCode).not.toContain('class LGFX :');
  });

  it.runIf(hostCppAvailable)('syntax-checks both visible and exported maze code against Arduino-shaped stubs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vidix-maze-cpp-'));
    const includes = fileURLToPath(new URL('./fixtures/arduino_host', import.meta.url));
    try {
      for (const [name, code] of [['editor', maze], ['export', exportForRealVidiXHardware(maze, 'Maze')]]) {
        const path = join(dir, `${name}.cpp`);
        writeFileSync(path, code);
        const result = spawnSync('g++', [
          '-std=c++11', '-fsyntax-only', '-include', join(includes, 'Arduino.h'), '-I', includes, path,
        ], { encoding: 'utf8' });
        expect(result.status, `${name}: ${result.stderr}`).toBe(0);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
