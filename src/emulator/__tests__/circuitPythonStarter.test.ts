import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VidiXClusterManager } from '../clusterManager';
import { rgb888To565, transpilePythonSketch } from '../pythonRuntime';
import {
  createDefaultUserProjects,
  DEFAULT_STARTER_PYTHON,
  getActiveProjectIdFromCookie,
  loadProjectsFromCookies,
  PREMADE_PLAYABLE_PROJECTS,
  saveProjectsToCookies,
} from '../projectStorage';

const legacyStarter = readFileSync(new URL('./fixtures/legacy-starter.py', import.meta.url), 'utf8');
const starterPath = new URL('../../../examples/CircuitPythonStarter/code.py', import.meta.url);
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
    for (const code of [DEFAULT_STARTER_PYTHON, gyro.sketchCode]) {
      const { jsCode } = transpilePythonSketch(code);
      expect(() => new Function(jsCode)).not.toThrow();
      expect(code).not.toMatch(/mpu\.(roll|pitch|yaw)/);
      expect(code).toContain('display.root_group = scene');
    }
  });

  it.skipIf(!hasPython)('runs without any third-party library or I2C in strict CircuitPython API mocks', () => {
    const result = spawnSync('python3', [fileURLToPath(harnessPath), fileURLToPath(starterPath), 'default'], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS no external libraries');
  });

  it.skipIf(!hasPython)('runs the optional MPU using real driver properties without pin conflicts', () => {
    const result = spawnSync('python3', [fileURLToPath(harnessPath), fileURLToPath(starterPath), 'mpu'], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS optional MPU-6050');
  });

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
      await wait(120);
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

  it('migrates only untouched legacy Python projects, preserving edits and the active ID', () => {
    const starter = createDefaultUserProjects().find((p) => p.mode === 'python')!;
    const edited = legacyStarter + '\n# My changes must survive\n';
    const projects = [
      { ...starter, id: 'old-untouched', sketchCode: legacyStarter },
      { ...starter, id: 'old-edited', sketchCode: edited },
      { ...starter, id: 'old-gyro-copy', name: 'Gyroscope Horizon & Tilt Ball (CircuitPython + MPU-6050) (My Copy)', sketchCode: legacyStarter },
    ];
    saveProjectsToCookies(projects, 'old-edited');
    const loaded = loadProjectsFromCookies();
    expect(loaded.find((p) => p.id === 'old-untouched')!.sketchCode).toBe(DEFAULT_STARTER_PYTHON);
    expect(loaded.find((p) => p.id === 'old-edited')!.sketchCode).toBe(edited);
    expect(loaded.find((p) => p.id === 'old-gyro-copy')!.sketchCode).toContain('USE_MPU6050 = True');
    expect(getActiveProjectIdFromCookie()).toBe('old-edited');
    expect(loadProjectsFromCookies().find((p) => p.id === 'old-edited')!.sketchCode).toBe(edited);
  });
});
