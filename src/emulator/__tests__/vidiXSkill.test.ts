import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import skill from '../../../docs/vidi-x-cpp/SKILL.md?raw';

function codeBlock(name: string): string {
  const marker = `<!-- vidi-x-skill:${name} -->`;
  const start = skill.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name} example`);
  const match = skill.slice(start + marker.length).match(/^\s*```cpp\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`Missing ${name} C++ block`);
  return match[1] + '\n';
}

function replaceOnce(text: string, search: string, replacement: string): string {
  if (!text.includes(search) || text.indexOf(search) !== text.lastIndexOf(search)) {
    throw new Error(`Expected exactly one ${search} in starter`);
  }
  return text.replace(search, replacement);
}

// Exercise the documented instructions for combining optional touch, audio and
// a sprite with the starter, rather than compiling unrelated sample code.
function integratedExample(): string {
  let code = codeBlock('starter');
  code = replaceOnce(code, 'lgfx::Bus_SPI bus;', 'lgfx::Bus_SPI bus;\n  lgfx::Touch_XPT2046 touch;');
  const touch = codeBlock('touch').trimEnd().split('\n').map((line) => `    ${line}`).join('\n');
  code = replaceOnce(code, '    setPanel(&panel);', `${touch}\n    setPanel(&panel);`);
  code = replaceOnce(code, 'void setup() {', `${codeBlock('audio')}\n${codeBlock('sprite')}\nvoid setup() {`);
  code = replaceOnce(code, '  lcd.setRotation(0);', [
    '  lcd.setRotation(0);',
    '  uint16_t cal[8]; lcd.calibrateTouch(cal, 0xFFFF, 0x0000, 15); lcd.setTouchCalibrate(cal);',
    '  if (initSpeaker()) { setSpeakerTone(440); setSpeakerTone(0); }',
    '  if (initCanvas()) canvas.pushSprite(0, 0);',
  ].join('\n'));
  return replaceOnce(code, '  const int rawLR =', [
    '  uint16_t x, y; if (lcd.getTouch(&x, &y)) { Serial.printf("%u,%u\\n", x, y); }',
    '  const int rawLR =',
  ].join('\n'));
}

const hostCppAvailable = spawnSync('g++', ['--version'], { encoding: 'utf8' }).status === 0;
const cli = process.env.ARDUINO_CLI;
const fqbn = process.env.ARDUINO_FQBN || 'esp32:esp32:esp32wrover';
const extraArgs: string[] = JSON.parse(process.env.ARDUINO_CLI_ARGS || '[]');

describe('VIDI X C++ AI skill', () => {
  it('uses one canonical, self-contained and hardware-focused Markdown file', () => {
    const source = readFileSync(new URL('../../../docs/vidi-x-cpp/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toBe(source);
    expect(skill).toMatch(/^---\nname: vidi-x-cpp\ndescription:/);
    expect(skill).toContain('A / B | 32 / 33');
    expect(skill).toContain('SDA 33 / SCL 32');
    expect(skill).toContain('GPIO12 is touch IRQ, not IR TX');
    expect(skill).toContain('Wi-Fi conflicts with ADC2 analog readings');
    expect(skill).toContain('current');
    const starter = codeBlock('starter');
    expect(starter.indexOf('class LGFX : public lgfx::LGFX_Device')).toBeLessThan(starter.indexOf('LGFX lcd;'));
    expect(starter).toContain('b.pin_mosi = 23;');
    expect(starter).toContain('b.pin_miso = 19;');
    expect(starter).toContain('void setup()');
    expect(starter).toContain('void loop()');
    expect(starter).toContain('Copyright (c) 2026 VIDI X');
    expect(starter).toContain('Permission is hereby granted');
  });

  it.runIf(hostCppAvailable)('syntax-checks the starter and documented peripheral integrations, and checks ladder thresholds', () => {
    const temp = mkdtempSync(join(tmpdir(), 'vidix-skill-host-'));
    const includes = fileURLToPath(new URL('./fixtures/arduino_host', import.meta.url));
    try {
      for (const [name, code, version] of [
        ['starter', codeBlock('starter'), ''],
        ['integrated-legacy', integratedExample(), ''],
        ['integrated-core3', integratedExample(), '-DESP_ARDUINO_VERSION_MAJOR=3'],
      ]) {
        const source = join(temp, `${name}.cpp`);
        const binary = join(temp, name);
        writeFileSync(source, code + `
#include <assert.h>
#include <string.h>
FakeSerial Serial, Serial2;
int main() {
  assert(readAxis(0) == 0);
  assert(readAxis(999) == 0);
  assert(readAxis(1000) == 2);
  assert(readAxis(1600) == 2);
  assert(readAxis(1935) == -1);
  assert(readAxis(2400) == 2);
  assert(readAxis(3800) == 2);
  assert(readAxis(4095) == 1);
  assert(strcmp(axisName(2, "left", "right"), "check ADC") == 0);
  return 0;
}
`);
        const args = ['-std=c++11', '-I', includes, ...(version ? [version] : []), source, '-o', binary];
        const compiled = spawnSync('g++', args, { encoding: 'utf8' });
        expect(compiled.status, `${name}: ${compiled.stderr}`).toBe(0);
        const ran = spawnSync(binary, [], { encoding: 'utf8' });
        expect(ran.status, `${name}: ${ran.stderr}`).toBe(0);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  // Optional actual Arduino build. The normal suite only needs the host stubs;
  // installing the core and LovyanGFX and setting ARDUINO_CLI enables this test.
  it.runIf(Boolean(cli))('builds both examples with the configured real Arduino toolchain', () => {
    const temp = mkdtempSync(join(tmpdir(), 'vidix-skill-arduino-'));
    try {
      for (const [name, code] of [['SkillStarter', codeBlock('starter')], ['SkillPeripherals', integratedExample()]]) {
        const folder = join(temp, name);
        const build = join(temp, `${name}-build`);
        mkdirSync(folder);
        writeFileSync(join(folder, `${name}.ino`), code);
        execFileSync(cli!, ['compile', '--fqbn', fqbn, '--jobs', '4', '--build-path', build, ...extraArgs, folder], {
          encoding: 'utf8', timeout: 240_000, stdio: 'pipe',
        });
        expect(statSync(join(build, `${name}.ino.bin`)).size).toBeGreaterThan(0);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 600_000);
});
