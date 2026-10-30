import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VidiXClusterManager } from '../clusterManager';
import { createPythonRuntimeEnv, rgb888To565, transpilePythonSketch } from '../pythonRuntime';
import { ILI9341Display } from '../display';
import type { RuntimeCallbacks } from '../arduinoRuntime';
import {
  createDefaultUserProjects,
  DEFAULT_STARTER_PYTHON,
  getActiveProjectIdFromCookie,
  loadProjectsFromCookies,
  PREMADE_PLAYABLE_PROJECTS,
  saveProjectsToCookies,
} from '../projectStorage';

const legacyStarter = readFileSync(new URL('./fixtures/legacy-starter.py', import.meta.url), 'utf8');
const legacyStarterV2 = readFileSync(new URL('../legacy/python-starter-v2.py', import.meta.url), 'utf8');
const starterPath = new URL('../../../examples/CircuitPythonStarter/code.py', import.meta.url);
const gyroPath = new URL('../../../examples/CircuitPythonGyro/code.py', import.meta.url);
const harnessPath = new URL('./fixtures/circuitpython_starter_harness.py', import.meta.url);
const hasPython = spawnSync('python3', ['--version']).status === 0;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ballCenter(board: ReturnType<VidiXClusterManager['getBoards']>[number]): number {
  const color = rgb888To565(0x22ee55);
  let sum = 0;
  let count = 0;
  for (let y = 45; y < 212; y++) {
    for (let x = 0; x < 320; x++) {
      if (board.display.readPixel(x, y) === color) { sum += x; count++; }
    }
  }
  expect(count).toBeGreaterThan(20);
  return sum / count;
}

function scorePixels(board: ReturnType<VidiXClusterManager['getBoards']>[number]): number[] {
  const pixels: number[] = [];
  for (let y = 214; y < 226; y++) {
    for (let x = 8; x < 104; x++) pixels.push(board.display.readPixel(x, y));
  }
  return pixels;
}

describe('CircuitPython starter on VIDI X', () => {
  it('uses the same standalone file in the editor and the optional gyro demo', () => {
    expect(readFileSync(starterPath, 'utf8')).toBe(DEFAULT_STARTER_PYTHON);
    expect(DEFAULT_STARTER_PYTHON).toContain('USE_MPU6050 = False');
    const gyro = PREMADE_PLAYABLE_PROJECTS.find((p) => p.id === 'premade-python-gyro')!;
    expect(gyro.sketchCode).toBe(DEFAULT_STARTER_PYTHON.replace('USE_MPU6050 = False', 'USE_MPU6050 = True'));
    expect(readFileSync(gyroPath, 'utf8')).toBe(gyro.sketchCode);
    for (const code of [DEFAULT_STARTER_PYTHON, gyro.sketchCode]) {
      const { jsCode } = transpilePythonSketch(code);
      expect(() => new Function(jsCode)).not.toThrow();
      expect(code).not.toMatch(/mpu\.(roll|pitch|yaw)|^\s*import\s+adafruit_mpu6050/m);
      expect(code).toContain('display.root_group = scene');
    }
  });

  it.skipIf(!hasPython)('runs without any third-party library or I2C in strict CircuitPython API mocks', () => {
    const result = spawnSync('python3', [fileURLToPath(harnessPath), fileURLToPath(starterPath), 'default'], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS no external libraries');
  });

  it.skipIf(!hasPython).each(['mpu68', 'mpu69'])(
    'reads and configures an external MPU at %s with locked I2C and signed data in host mocks',
    (scenario) => {
      const result = spawnSync('python3', [fileURLToPath(harnessPath), fileURLToPath(gyroPath), scenario], { encoding: 'utf8' });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('PASS optional MPU-6050');
    }
  );

  it.skipIf(!hasPython).each(['missing', 'bad-id', 'busy', 'init-error', 'config-error', 'read-error'])(
    'continues with D-pad and MENU after a sensor/bus failure: %s',
    (scenario) => {
      const result = spawnSync('python3', [fileURLToPath(harnessPath), fileURLToPath(gyroPath), scenario], { encoding: 'utf8' });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`PASS fallback ${scenario}`);
    }
  );

  it('moves and scores in the simulator without a gyro, using a transparent bitmap', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    try {
      cluster.updateSensors(board.state.id, { gyroRoll: 30 });
      cluster.updateSketch(board.state.id, DEFAULT_STARTER_PYTHON, 'Python starter');
      cluster.startBoard(board.state.id);
      await wait(130);
      expect(board.state.compileError).toBeNull();
      expect(board.state.running).toBe(true);
      const startX = ballCenter(board);
      expect(startX).toBeGreaterThan(159);
      expect(startX).toBeLessThan(161);
      expect(board.display.readPixel(148, 116)).toBe(rgb888To565(0x0a1220));
      const beforeScore = scorePixels(board);
      cluster.setButtonState(board.state.id, 'LEFT', true);
      cluster.setButtonState(board.state.id, 'A', true);
      await wait(100);
      cluster.setButtonState(board.state.id, 'LEFT', false);
      cluster.setButtonState(board.state.id, 'A', false);
      expect(ballCenter(board)).toBeLessThan(startX - 5);
      expect(scorePixels(board)).not.toEqual(beforeScore);
      expect(board.state.audio.active).toBe(false);
      expect(board.state.compileError).toBeNull();
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('uses accelerometer tilt and MENU in the simulator for the optional gyro demo', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const gyro = PREMADE_PLAYABLE_PROJECTS.find((p) => p.id === 'premade-python-gyro')!;
    try {
      cluster.updateSensors(board.state.id, { gyroRoll: 0, gyroPitch: 0 });
      cluster.updateSketch(board.state.id, gyro.sketchCode, gyro.name);
      cluster.startBoard(board.state.id);
      await wait(170);
      expect(board.state.compileError).toBeNull();
      const startX = ballCenter(board);
      const beforeScore = scorePixels(board);
      cluster.updateSensors(board.state.id, { gyroRoll: 30 });
      cluster.setButtonState(board.state.id, 'MENU', true);
      await wait(110);
      cluster.setButtonState(board.state.id, 'MENU', false);
      expect(ballCenter(board)).toBeGreaterThan(startX + 5);
      expect(scorePixels(board)).not.toEqual(beforeScore);
      expect(board.state.compileError).toBeNull();
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('reports a missing simulated MPU and continues to run with D-pad and MENU', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const gyro = readFileSync(gyroPath, 'utf8').replace('MPU6050_ADDRESS = 0x68', 'MPU6050_ADDRESS = 0x70');
    try {
      cluster.updateSketch(board.state.id, gyro, 'Gyro with absent simulated sensor');
      cluster.startBoard(board.state.id);
      await wait(130);
      expect(board.state.compileError).toBeNull();
      expect(board.state.running).toBe(true);
      expect(board.state.serialLog.some((entry) => entry.text.includes('MPU-6050 unavailable'))).toBe(true);
      const startX = ballCenter(board);
      const beforeScore = scorePixels(board);
      cluster.setButtonState(board.state.id, 'LEFT', true);
      cluster.setButtonState(board.state.id, 'MENU', true);
      await wait(110);
      cluster.setButtonState(board.state.id, 'LEFT', false);
      cluster.setButtonState(board.state.id, 'MENU', false);
      expect(ballCenter(board)).toBeLessThan(startX - 5);
      expect(scorePixels(board)).not.toEqual(beforeScore);
      expect(board.state.compileError).toBeNull();
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('models signed MPU register data and both addresses on a locked simulated bus', () => {
    const callbacks = {
      display: new ILI9341Display(),
      getSensors: () => ({ gyroRoll: -30, gyroPitch: 0, gyroRateX: Math.PI / 2, gyroRateY: -Math.PI / 4 }),
    } as unknown as RuntimeCallbacks;
    const { env } = createPythonRuntimeEnv(callbacks, async () => {}, async () => {});
    const board = env.board as { VIDIIC: () => {
      try_lock: () => boolean; unlock: () => void; deinit: () => void;
      writeto: (address: number, data: Uint8Array) => void;
      writeto_then_readfrom: (address: number, out: Uint8Array, input: Uint8Array) => void;
    } };
    const bus = board.VIDIIC();
    const who = new Uint8Array(1);
    expect(() => bus.writeto_then_readfrom(0x68, new Uint8Array([0x75]), who)).toThrow(/not locked/);
    expect(bus.try_lock()).toBe(true);
    expect(bus.try_lock()).toBe(false);
    for (const address of [0x68, 0x69]) {
      bus.writeto_then_readfrom(address, new Uint8Array([0x75]), who);
      expect(who[0]).toBe(0x68);
      bus.writeto(address, new Uint8Array([0x6b, 0]));
      const motion = new Uint8Array(14);
      bus.writeto_then_readfrom(address, new Uint8Array([0x3b]), motion);
      const signed = (index: number) => new DataView(motion.buffer).getInt16(index, false);
      expect(signed(0)).toBe(-8192);
      expect(signed(8) / 131).toBeCloseTo(90, 1);
      expect(signed(10) / 131).toBeCloseTo(-45, 1);
      expect(() => bus.writeto_then_readfrom(0x70, new Uint8Array([0x75]), who)).toThrow(/No I2C device/);
    }
    bus.unlock();
    bus.deinit();
    expect(() => bus.try_lock()).toThrow(/deinitialized/);
  });

  it('only catches matching simulated I2C exceptions and always runs finally, including on stop', async () => {
    const messages: string[] = [];
    const callbacks = {
      display: new ILI9341Display(),
      onSerialPrint: (_uart: 0 | 2, text: string) => messages.push(text.trim()),
    } as unknown as RuntimeCallbacks;
    const fail = new Error('No I2C device');
    fail.name = 'OSError';
    let thrown: Error = fail;
    const { env } = createPythonRuntimeEnv(callbacks, async () => {}, async () => { throw thrown; });
    const source = `import time
try:
    time.sleep(0.1)
except (OSError, ValueError, RuntimeError) as error:
    print("caught", error)
finally:
    print("finally")
`;
    const { jsCode } = transpilePythonSketch(source);
    const setup = new Function(...Object.keys(env), `${jsCode}\nreturn setup;`)(...Object.values(env)) as () => Promise<void>;
    await setup();
    expect(messages).toEqual(['caught OSError: No I2C device', 'finally']);
    messages.length = 0;
    thrown = new TypeError('not an I2C failure');
    await expect(setup()).rejects.toBe(thrown);
    expect(messages).toEqual(['finally']);
    messages.length = 0;
    thrown = new Error('__ABORTED__');
    await expect(setup()).rejects.toBe(thrown);
    expect(messages).toEqual(['finally']);

    // Even an `except Exception` must not swallow the VM's stop signal.
    const broadSource = source.replace('except (OSError, ValueError, RuntimeError)', 'except Exception');
    const broadSetup = new Function(...Object.keys(env), `${transpilePythonSketch(broadSource).jsCode}\nreturn setup;`)(...Object.values(env)) as () => Promise<void>;
    messages.length = 0;
    await expect(broadSetup()).rejects.toBe(thrown);
    expect(messages).toEqual(['finally']);
  });

  it('migrates only untouched legacy Python projects, preserving edits and the active ID', () => {
    const starter = createDefaultUserProjects().find((p) => p.mode === 'python')!;
    const edited = legacyStarter + '\n# My changes must survive\n';
    const projects = [
      { ...starter, id: 'old-untouched', sketchCode: legacyStarter },
      { ...starter, id: 'old-edited', sketchCode: edited },
      { ...starter, id: 'old-gyro-copy', name: 'Gyroscope Horizon & Tilt Ball (CircuitPython + MPU-6050) (My Copy)', sketchCode: legacyStarter },
      { ...starter, id: 'v2-default', sketchCode: legacyStarterV2 },
      { ...starter, id: 'v2-gyro', sketchCode: legacyStarterV2.replace('USE_MPU6050 = False', 'USE_MPU6050 = True') },
      { ...starter, id: 'v2-edited-gyro', sketchCode: legacyStarterV2.replace('USE_MPU6050 = False', 'USE_MPU6050 = True') + '\n# My gyro changes\n' },
    ];
    saveProjectsToCookies(projects, 'old-edited');
    const loaded = loadProjectsFromCookies();
    expect(loaded.find((p) => p.id === 'old-untouched')!.sketchCode).toBe(DEFAULT_STARTER_PYTHON);
    expect(loaded.find((p) => p.id === 'old-edited')!.sketchCode).toBe(edited);
    expect(loaded.find((p) => p.id === 'old-gyro-copy')!.sketchCode).toContain('USE_MPU6050 = True');
    expect(loaded.find((p) => p.id === 'v2-default')!.sketchCode).toBe(DEFAULT_STARTER_PYTHON);
    expect(loaded.find((p) => p.id === 'v2-gyro')!.sketchCode).toBe(readFileSync(gyroPath, 'utf8'));
    expect(loaded.find((p) => p.id === 'v2-edited-gyro')!.sketchCode).toBe(projects.find((p) => p.id === 'v2-edited-gyro')!.sketchCode);

    expect(getActiveProjectIdFromCookie()).toBe('old-edited');
    expect(loadProjectsFromCookies().find((p) => p.id === 'old-edited')!.sketchCode).toBe(edited);
  });
});
