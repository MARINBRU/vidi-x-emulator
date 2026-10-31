import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportForRealVidiXHardware } from '../hardwareExporter';
import { DEFAULT_STARTER_CPP, PREMADE_PLAYABLE_PROJECTS, selectPremadeVariant } from '../projectStorage';

// Optional real-toolchain regression: install the ESP32 core, LovyanGFX and
// FastLED, then set ARDUINO_CLI. The regular suite needs no toolchain/network.
const cli = process.env.ARDUINO_CLI;
const fqbn = process.env.ARDUINO_FQBN || 'esp32:esp32:esp32wrover';
const extraArgs: string[] = JSON.parse(process.env.ARDUINO_CLI_ARGS || '[]');
const legacyStarter = readFileSync(new URL('./fixtures/legacy-starter.ino', import.meta.url), 'utf8');

describe('real ESP32 compilation', () => {
  it.runIf(Boolean(cli))('builds the starters and the multiplayer export', () => {
    const temp = mkdtempSync(join(tmpdir(), 'vidix-arduino-'));
    try {
      const sketches = [
        ['Starter', DEFAULT_STARTER_CPP],
        ['ExportedStarter', exportForRealVidiXHardware(DEFAULT_STARTER_CPP, 'Starter')],
        ['EditedLegacy', exportForRealVidiXHardware(
          legacyStarter.replace('int score = 0;', 'int score = 42;'),
          'Edited Legacy'
        )],
        ...(['premade-python-gyro', 'premade-python-quiz', 'premade-sd-logger'] as const).map((id, index) => {
          const item = PREMADE_PLAYABLE_PROJECTS.find((project) => project.id === id)!;
          return [`Example${index}`, exportForRealVidiXHardware(selectPremadeVariant(item, 'cpp').sketchCode, item.name)];
        }),
        ['Multiplayer', exportForRealVidiXHardware(
          PREMADE_PLAYABLE_PROJECTS.find((project) => project.id === 'premade-3d-fps-2p')!.sketchCode,
          'Multiplayer'
        )],
      ];
      for (const [name, code] of sketches) {
        const folder = join(temp, name);
        mkdirSync(folder);
        writeFileSync(join(folder, `${name}.ino`), code);
        const buildPath = join(temp, `${name}-build`);
        execFileSync(cli!, [
          'compile', '--fqbn', fqbn, '--jobs', '4',
          '--build-path', buildPath,
          ...extraArgs, folder,
        ], { encoding: 'utf8', timeout: 240_000, stdio: 'pipe' });
        expect(statSync(join(buildPath, `${name}.ino.bin`)).size).toBeGreaterThan(0);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 600_000);
});
