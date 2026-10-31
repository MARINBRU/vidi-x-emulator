import pythonBase from '../premadePython/base.py?raw';
import pythonRaycast from '../premadePython/raycast.py?raw';
import { rgb888To565 } from '../pythonRuntime';
import { exportForRealVidiXHardware } from '../hardwareExporter';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transpileArduinoSketch } from '../arduinoRuntime';
import { VidiXClusterManager } from '../clusterManager';
import { PREMADE_PLAYABLE_PROJECTS, selectPremadeVariant } from '../projectStorage';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('premade example languages', () => {
  for (const item of PREMADE_PLAYABLE_PROJECTS) {
    for (const mode of ['cpp', 'python'] as const) {
      it(`${item.id} ${mode} compiles and starts`, async () => {
        const chosen = selectPremadeVariant(item, mode);
        expect(chosen.mode).toBe(mode);
        expect(chosen.blockProgram).toBeUndefined();
        const { jsCode } = transpileArduinoSketch(chosen.sketchCode);
        expect(() => new Function(jsCode)).not.toThrow();
        const cluster = new VidiXClusterManager();
        const board = cluster.getBoards()[0];
        try {
          cluster.updateSketch(board.state.id, chosen.sketchCode, item.name);
          cluster.startBoard(board.state.id);
          await wait(180);
          expect(board.state.compileError).toBeNull();
          expect(board.state.running).toBe(true);
        } finally {
          cluster.stopBoard(board.state.id);
        }
      }, 5000);
    }
  }
});

const example = (id: string, mode: 'cpp' | 'python') => {
  const item = PREMADE_PLAYABLE_PROJECTS.find((p) => p.id === id)!;
  return selectPremadeVariant(item, mode);
};

function startPair(id: string, firstMode: 'cpp' | 'python', secondMode: 'cpp' | 'python') {
  const first = example(id, firstMode);
  const second = example(id, secondMode);
  const cluster = new VidiXClusterManager();
  const one = cluster.getBoards()[0];
  const two = cluster.getBoard(cluster.addBoard(second.sketchCode, second.name, false))!;
  cluster.updateSketch(one.state.id, first.sketchCode, first.name);
  cluster.updateSketch(two.state.id, second.sketchCode, second.name);
  cluster.startBoard(one.state.id);
  cluster.startBoard(two.state.id);
  return { cluster, one, two, stop: () => { cluster.stopBoard(one.state.id); cluster.stopBoard(two.state.id); } };
}

describe('example behavior', () => {
  it('keeps saved project modes and sources independent when choosing a premade language', () => {
    const original = PREMADE_PLAYABLE_PROJECTS.find((p) => p.id === 'premade-block-0')!;
    const blocks = selectPremadeVariant(original, 'blocks');
    const cpp = selectPremadeVariant(original, 'cpp');
    const python = selectPremadeVariant(original, 'python');
    expect(blocks.blockProgram).toBeDefined();
    expect(cpp.blockProgram).toBeUndefined();
    expect(python.blockProgram).toBeUndefined();
    expect(python.sketchCode).not.toBe(cpp.sketchCode);
    expect(original.mode).toBe('blocks');
    expect(original.blockProgram).toBeDefined();
  });

  it.each([['python', 'python'], ['cpp', 'python']] as const)(
    'synchronizes Pong between %s and %s', async (first, second) => {
      const pair = startPair('premade-espnow-pong', first, second);
      try {
        await wait(300);
        pair.cluster.setButtonState(pair.two.state.id, 'DOWN', true);
        await wait(600);
        pair.cluster.setButtonState(pair.two.state.id, 'DOWN', false);
        const packets = pair.cluster.getWirelessPackets();
        expect(packets.some((p) => p.fromBoardId === pair.one.state.id && p.payload.startsWith('STATE:'))).toBe(true);
        const paddle = packets.filter((p) => p.fromBoardId === pair.two.state.id && p.payload.startsWith('P2:'));
        expect(paddle.length).toBeGreaterThan(1);
        expect(Number(paddle[0].payload.slice(3))).toBeGreaterThan(95);
        expect(pair.one.state.compileError).toBeNull();
        expect(pair.two.state.compileError).toBeNull();
      } finally { pair.stop(); }
    }, 5000
  );

  it.each([['python', 'python'], ['cpp', 'python']] as const)(
    'exchanges FPS positions between %s and %s', async (first, second) => {
      const pair = startPair('premade-3d-fps-2p', first, second);
      try {
        await wait(400);
        pair.cluster.setButtonState(pair.one.state.id, 'UP', true);
        await wait(700);
        pair.cluster.setButtonState(pair.one.state.id, 'UP', false);
        const packets = pair.cluster.getWirelessPackets().filter((p) => p.payload.startsWith('P,'));
        const left = packets.filter((p) => p.fromBoardId === pair.one.state.id);
        const right = packets.filter((p) => p.fromBoardId === pair.two.state.id);
        expect(left.length).toBeGreaterThan(2);
        expect(right.length).toBeGreaterThan(2);
        expect(Number(left[0].payload.split(',')[1])).toBeGreaterThan(1.8);
        expect(Number(right[0].payload.split(',')[1])).toBeGreaterThan(7);
        expect(pair.one.state.compileError).toBeNull();
        expect(pair.two.state.compileError).toBeNull();
      } finally { pair.stop(); }
    }, 6000
  );

  it.each([['python', 'python'], ['cpp', 'python']] as const)(
    'carries UART and GPIO between wired %s and %s boards', async (first, second) => {
      const pair = startPair('premade-sd-logger', first, second);
      try {
        pair.cluster.autoWireSafeBridge(pair.one.state.id, pair.two.state.id);
        await wait(200);
        pair.cluster.setButtonState(pair.one.state.id, 'A', true);
        pair.cluster.setButtonState(pair.one.state.id, 'B', true);
        await wait(400);
        expect(pair.two.state.pins[14].digitalValue).toBe(1);
        expect(pair.two.state.serialLog.some((line) => line.text.includes('UART RX: FRAME#1'))).toBe(true);
        expect(pair.one.state.compileError).toBeNull();
        expect(pair.two.state.compileError).toBeNull();
      } finally { pair.stop(); }
    }, 4000
  );

  it.each(['cpp', 'python'] as const)('scores the English quiz in %s', async (mode) => {
    const selected = example('premade-python-quiz', mode);
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    try {
      cluster.updateSketch(board.state.id, selected.sketchCode, selected.name);
      cluster.startBoard(board.state.id);
      await wait(150);
      for (const direction of ['RIGHT', 'UP', 'LEFT', 'DOWN', 'UP', 'LEFT'] as const) {
        cluster.setButtonState(board.state.id, direction, true);
        await wait(120);
        cluster.setButtonState(board.state.id, direction, false);
        await wait(90);
      }
      expect(board.state.serialLog.some((line) => line.text.includes('Correct! Score 6'))).toBe(true);
      expect(board.state.compileError).toBeNull();
    } finally { cluster.stopBoard(board.state.id); }
  }, 6000);
});


describe('Python exports against strict CircuitPython-shaped hardware APIs', () => {
  for (const item of PREMADE_PLAYABLE_PROJECTS) {
    if (item.id === 'premade-python-gyro') continue; // covered by the MPU-specific strict harness
    it(`${item.id} uses supported pins, display and radio methods`, () => {
      const temp = mkdtempSync(join(tmpdir(), 'vidix-premade-'));
      try {
        const path = join(temp, 'code.py');
        writeFileSync(path, selectPremadeVariant(item, 'python').sketchCode);
        const result = spawnSync('python3', [fileURLToPath(new URL('./fixtures/premade_circuitpython_harness.py', import.meta.url)), path, item.id], { encoding: 'utf8' });
        expect(result.stderr, result.stdout).toBe('');
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(result.stdout).toContain(`PASS ${item.id}`);
      } finally { rmSync(temp, { recursive: true, force: true }); }
    });
  }
});

it('switches the Python scope between speaker and IR receive/send', async () => {
  const selected = example('premade-synth-scope', 'python');
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  try {
    cluster.updateSketch(board.state.id, selected.sketchCode, selected.name);
    cluster.startBoard(board.state.id);
    await wait(150);
    cluster.setButtonState(board.state.id, 'B', true);
    await wait(120);
    cluster.setButtonState(board.state.id, 'B', false);
    await wait(80);
    cluster.setButtonState(board.state.id, 'A', true);
    await wait(120);
    cluster.setButtonState(board.state.id, 'A', false);
    cluster.sendIrCommandToBoard(board.state.id, 42);
    await wait(180);
    expect(board.state.serialLog.some((line) => line.text.includes('IR TX: 69'))).toBe(true);
    expect(board.state.serialLog.some((line) => line.text.includes('IR RX: 42'))).toBe(true);
    expect(cluster.getWirelessPackets().some((p) => p.protocol === 'IR' && p.irCode === 69)).toBe(true);
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 4000);

it.runIf(Boolean(process.env.MPY_CROSS))('compiles every Python premade with the CircuitPython cross-compiler', () => {
  const temp = mkdtempSync(join(tmpdir(), 'vidix-mpy-'));
  try {
    for (const item of PREMADE_PLAYABLE_PROJECTS) {
      const path = join(temp, `${item.id}.py`);
      writeFileSync(path, selectPremadeVariant(item, 'python').sketchCode);
      const result = spawnSync(process.env.MPY_CROSS!, ['-o', `${path}.mpy`, path], { encoding: 'utf8' });
      expect(result.status, `${item.id}: ${result.stdout}${result.stderr}`).toBe(0);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
}, 15000);

it.each(['premade-diagnostics', 'premade-python-quiz', 'premade-block-0', 'premade-3d-maze', 'premade-space-defender'])(
  '%s handles installed optional touch/RGB libraries and shared SPI', (id) => {
    const temp = mkdtempSync(join(tmpdir(), 'vidix-optional-'));
    try {
      const path = join(temp, 'code.py');
      writeFileSync(path, example(id, 'python').sketchCode);
      const result = spawnSync('python3', [fileURLToPath(new URL('./fixtures/premade_circuitpython_harness.py', import.meta.url)), path, id],
        { encoding: 'utf8', env: { ...process.env, PREMADE_OPTIONALS: '1' } });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      if (['premade-diagnostics', 'premade-python-quiz', 'premade-block-0'].includes(id)) {
        expect(result.stdout).toContain('Touch unavailable');
      }
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
);

it('reads the C++ gyro over simulated raw I2C and scores with MENU', async () => {
  const selected = example('premade-python-gyro', 'cpp');
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  try {
    cluster.updateSketch(board.state.id, selected.sketchCode, selected.name);
    cluster.startBoard(board.state.id);
    await wait(140);
    const initial = board.display.readPixel(160, 128);
    cluster.updateSensors(board.state.id, { gyroRoll: 30 });
    await wait(260);
    expect(board.display.readPixel(160, 128)).not.toBe(initial);
    cluster.setButtonState(board.state.id, 'MENU', true);
    await wait(120);
    cluster.setButtonState(board.state.id, 'MENU', false);
    expect(board.state.serialLog.some((line) => line.text.includes('Score: 1'))).toBe(true);
    expect(board.state.serialLog.some((line) => line.text.includes('Gyro deg/s'))).toBe(true);
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 4000);

it('respects local and global Python variables in simple and tuple assignments', async () => {
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  const source = `import time
x = 1
y = 2
def local_values():
    x, y = [9, 8]
    print("local", x, y)
def change_globals():
    global x, y
    x, y = [3, 4]
local_values()
print("before", x, y)
change_globals()
print("after", x, y)
while True:
    time.sleep(0.1)
`;
  try {
    cluster.updateSketch(board.state.id, source, 'Python scope');
    cluster.startBoard(board.state.id);
    await wait(120);
    const log = board.state.serialLog.map((line) => line.text).join('');
    expect(log).toContain('local 9 8');
    expect(log).toContain('before 1 2');
    expect(log).toContain('after 3 4');
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
});

it.each([['python', 'python'], ['cpp', 'python']] as const)(
  'delivers multiplayer FPS hit damage between %s and %s', async (first, second) => {
    const pair = startPair('premade-3d-fps-2p', first, second);
    try {
      await wait(500);
      pair.cluster.setButtonState(pair.one.state.id, 'A', true);
      await wait(200);
      pair.cluster.setButtonState(pair.one.state.id, 'A', false);
      await wait(350);
      const packets = pair.cluster.getWirelessPackets();
      expect(packets.some((p) => p.fromBoardId === pair.one.state.id && p.payload === 'HIT,34')).toBe(true);
      const right = packets.filter((p) => p.fromBoardId === pair.two.state.id && p.payload.startsWith('P,'));
      expect(right.some((p) => Number(p.payload.split(',')[4]) === 66)).toBe(true);
      expect(pair.two.state.compileError).toBeNull();
    } finally { pair.stop(); }
  }, 5000
);


it('projects Python 3D sprites in multiple directions and hides them behind walls', async () => {
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  const source = `${pythonBase}\n${pythonRaycast}\n
player_x = 1.5
player_y = 4.5
player_angle = 0.0
render_walls()
render_sprite(4.5, 4.5, 6, 1)
screen.refresh()
print("FRONT")
time.sleep(0.3)
player_angle = 1.570796
render_walls()
render_sprite(1.5, 7.5, 6, 1)
screen.refresh()
print("TURNED")
time.sleep(0.3)
player_x = 1.5
player_y = 2.5
player_angle = 0.0
render_walls()
render_sprite(3.5, 2.5, 6, 1)
screen.refresh()
print("OCCLUDED")
while True:
    time.sleep(0.1)
`;
  try {
    cluster.updateSketch(board.state.id, source, 'Projection regression');
    cluster.startBoard(board.state.id);
    await wait(180);
    expect(board.state.serialLog.some((line) => line.text.includes('FRONT'))).toBe(true);
    expect(board.display.readPixel(160, 120)).toBe(rgb888To565(0xFFCC33));
    await wait(300);
    expect(board.state.serialLog.some((line) => line.text.includes('TURNED'))).toBe(true);
    expect(board.display.readPixel(160, 120)).toBe(rgb888To565(0xFFCC33));
    await wait(300);
    expect(board.state.serialLog.some((line) => line.text.includes('OCCLUDED'))).toBe(true);
    expect(board.display.readPixel(160, 120)).not.toBe(rgb888To565(0xFFCC33));
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 4000);


const hostCppAvailable = spawnSync('g++', ['--version'], { encoding: 'utf8' }).status === 0;
it.runIf(hostCppAvailable)('syntax-checks new C++ hardware exports with host Arduino-shaped stubs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vidix-cpp-'));
  const includes = fileURLToPath(new URL('./fixtures/arduino_host', import.meta.url));
  try {
    for (const id of ['premade-python-gyro', 'premade-python-quiz', 'premade-sd-logger']) {
      const path = join(dir, `${id}.cpp`);
      const source = exportForRealVidiXHardware(example(id, 'cpp').sketchCode, id);
      writeFileSync(path, source);
      const result = spawnSync('g++', ['-std=c++11', '-fsyntax-only', '-include', join(includes, 'Arduino.h'), '-I', includes, path], { encoding: 'utf8' });
      expect(result.status, `${id}: ${result.stderr}`).toBe(0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 15000);

it('selects the answer under each touch on the Python quiz', async () => {
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  try {
    cluster.updateSketch(board.state.id, example('premade-python-quiz', 'python').sketchCode, 'Quiz touch');
    cluster.startBoard(board.state.id);
    await wait(200);
    // Third, first, second, fourth, first, second answer rectangles.
    for (const y of [130, 58, 94, 166, 58, 94]) {
      cluster.setTouchState(board.state.id, { pressed: true, x: 100, y });
      await wait(140);
      cluster.setTouchState(board.state.id, { pressed: false });
      await wait(100);
    }
    const log = board.state.serialLog.map((line) => line.text).join('');
    expect(log).toContain('Correct! Score 6');
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 5000);

it('keeps CircuitPython display changes hidden until a manual refresh', async () => {
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  const source = `${pythonBase}\n
screen.auto_refresh = False
canvas.fill(6)
print("QUEUED")
time.sleep(0.3)
screen.refresh()
print("PRESENTED")
time.sleep(0.3)
canvas.fill(3)
screen.auto_refresh = True
print("AUTOMATIC")
while True:
    time.sleep(0.1)
`;
  try {
    cluster.updateSketch(board.state.id, source, 'Manual refresh');
    cluster.startBoard(board.state.id);
    await wait(180);
    expect(board.state.serialLog.some((line) => line.text.includes('QUEUED'))).toBe(true);
    expect(board.display.readPixel(40, 80)).toBe(0);
    await wait(300);
    expect(board.state.serialLog.some((line) => line.text.includes('PRESENTED'))).toBe(true);
    expect(board.display.readPixel(40, 80)).toBe(rgb888To565(0xFFCC33));
    await wait(300);
    expect(board.state.serialLog.some((line) => line.text.includes('AUTOMATIC'))).toBe(true);
    expect(board.display.readPixel(40, 80)).toBe(rgb888To565(0x3366AA));
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 4000);

it('keeps the faster 3D camera and depth buffer aligned in all four directions', async () => {
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  const source = `${pythonBase}\n${pythonRaycast}\n
player_x = 1.5
player_y = 4.5
player_angle = 0.0
render_walls()
print("EAST", int(depth[20] * 10 + 0.5))
render_sprite(3.5, 4.0, 6, 1)
render_sprite(3.5, 5.0, 6, 1)
screen.refresh()
time.sleep(0.3)
player_angle = 1.57079632679
render_walls()
print("SOUTH", int(depth[20] * 10 + 0.5))
player_angle = 3.14159265359
render_walls()
print("WEST", int(depth[20] * 10 + 0.5))
player_angle = -1.57079632679
render_walls()
print("NORTH", int(depth[20] * 10 + 0.5))
screen.refresh()
while True:
    time.sleep(0.1)
`;
  try {
    cluster.updateSketch(board.state.id, source, 'Camera projection');
    cluster.startBoard(board.state.id);
    await wait(180);
    expect(board.display.readPixel(90, 120)).toBe(rgb888To565(0xFFCC33));
    expect(board.display.readPixel(230, 120)).toBe(rgb888To565(0xFFCC33));
    await wait(300);
    const log = board.state.serialLog.map((line) => line.text).join('');
    expect(log).toContain('EAST 75');
    expect(log).toContain('SOUTH 45');
    expect(log).toContain('WEST 5');
    expect(log).toContain('NORTH 35');
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 4000);

it.each(['premade-3d-maze', 'premade-3d-fps-1p', 'premade-3d-fps-2p'])(
  '%s renders with CircuitPython bitmaptools that has no blit', (id) => {
    const temp = mkdtempSync(join(tmpdir(), 'vidix-no-blit-'));
    try {
      const path = join(temp, 'code.py');
      writeFileSync(path, example(id, 'python').sketchCode);
      const result = spawnSync('python3', [fileURLToPath(new URL('./fixtures/premade_circuitpython_harness.py', import.meta.url)), path, id],
        { encoding: 'utf8', env: { ...process.env, PREMADE_NO_BLIT: '1' } });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain('PASS');
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
);

it('ships the same standalone maze file as the Python premade', async () => {
  const { readFileSync } = await import('node:fs');
  const standalone = readFileSync(new URL('../../../examples/CircuitPythonMaze/code.py', import.meta.url), 'utf8');
  expect(standalone).toBe(example('premade-3d-maze', 'python').sketchCode);
});

it('copies a cropped displayio bitmap with CircuitPython skip indices', async () => {
  const cluster = new VidiXClusterManager();
  const board = cluster.getBoards()[0];
  const source = `import board
import displayio
import bitmaptools
import time
src = displayio.Bitmap(4, 1, 16)
dst = displayio.Bitmap(4, 1, 16)
src[0] = 1
src[1] = 2
src[2] = 3
src[3] = 4
dst.fill(9)
bitmaptools.blit(dst, src, 0, 0, x1=1, x2=4, skip_source_index=3)
print("CROP", dst[0], dst[1], dst[2], dst[3])
bitmaptools.blit(dst, src, 0, 0, skip_dest_index=9)
print("SKIP", dst[0], dst[1], dst[2], dst[3])
while True:
    time.sleep(0.1)
`;
  try {
    cluster.updateSketch(board.state.id, source, 'Bitmap blit');
    cluster.startBoard(board.state.id);
    await wait(140);
    const log = board.state.serialLog.map((line) => line.text).join('');
    expect(log).toContain('CROP 2 9 4 9');
    expect(log).toContain('SKIP 1 9 3 9');
    expect(board.state.compileError).toBeNull();
  } finally { cluster.stopBoard(board.state.id); }
}, 3000);
