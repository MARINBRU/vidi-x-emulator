import { describe, expect, it } from 'vitest';
import { transpileArduinoSketch } from '../arduinoRuntime';
import {
  BLOCK_TEMPLATES,
  compileBlocksToArduino,
} from '../blocklyEngine';
import { VidiXClusterManager } from '../clusterManager';
import { ILI9341Display, TFT_COLORS } from '../display';
import { EXAMPLE_SKETCHES } from '../exampleSketches';
import { globalExtensionRegistry } from '../extensions/registry';
import { exportForRealVidiXHardware } from '../hardwareExporter';
import { createInitialPins, syncHardwareToPins, VIDI_X_PINS } from '../pinout';
import {
  createDefaultUserProjects,
  DEFAULT_STARTER_PYTHON,
  loadProjectsFromCookies,
  PREMADE_PLAYABLE_PROJECTS,
  saveProjectsToCookies,
} from '../projectStorage';

describe('VIDI X Hardware & Multi-Board Emulator Suite', () => {
  it('renders pixels, ellipses, and text on the ILI9341 320x240 display', () => {
    const display = new ILI9341Display();
    expect(display.width()).toBe(320);
    expect(display.height()).toBe(240);

    display.fillScreen(TFT_COLORS.ILI9341_NAVY);
    expect(display.readPixel(10, 10)).toBe(TFT_COLORS.ILI9341_NAVY);

    display.drawPixel(50, 60, TFT_COLORS.ILI9341_YELLOW);
    expect(display.readPixel(50, 60)).toBe(TFT_COLORS.ILI9341_YELLOW);

    display.fillEllipse(160, 120, 10, 6, TFT_COLORS.ILI9341_CYAN);
    expect(display.readPixel(160, 120)).toBe(TFT_COLORS.ILI9341_CYAN);

    display.setCursor(0, 0);
    display.setTextColor(TFT_COLORS.ILI9341_WHITE, TFT_COLORS.ILI9341_BLACK);
    display.print('VIDI X');
    expect(display.cursorX).toBeGreaterThan(0);
  });

  it('synchronizes VidiLAB official resistor-ladder buttons (GPIO 34=LR, GPIO 35=UD) + onboard sensors', () => {
    const pins = createInitialPins();
    const buttons = {
      UP: true,
      DOWN: false,
      LEFT: false,
      RIGHT: true,
      A: true,
      B: false,
      START: true,
      SELECT: false,
      MENU: false,
      VOL_UP: false,
      VOL_DOWN: false,
      BOOT: false,
      RESET: false,
    };
    const sensors = {
      temperatureC: 25.0,
      lightLevel: 50,
      micLevel: 40,
      micFrequency: 440,
      batteryVoltage: 4.1,
      irLastCode: 0,
      irAvailable: false,
      tempLightJumper: 'LIGHT' as const,
      dpadMapping: 'STD_34LR_35UD' as const,
    };

    pins[VIDI_X_PINS.BTN_A].mode = 'INPUT_PULLUP';
    syncHardwareToPins(pins, buttons, sensors, 1000);

    // RIGHT on GPIO 34 (BTN_LR) => 2000 (satisfies > 1800 && < 2200)
    expect(pins[34].analogValue).toBe(2000);
    // UP on GPIO 35 (BTN_UD) => 4095 (satisfies > 4000)
    expect(pins[35].analogValue).toBe(4095);
    // START on GPIO 27 => 2000
    expect(pins[27].analogValue).toBe(2000);
    // Tipka A active LOW when INPUT_PULLUP
    expect(pins[32].digitalValue).toBe(0);
    // Microphone drives both GPIO 14 and GPIO 36
    expect(pins[14].analogValue).toBeGreaterThan(0);
    expect(pins[36].analogValue).toBe(pins[14].analogValue);
    // Light sensor 50% => ~2048
    expect(pins[39].analogValue).toBeGreaterThan(2000);
  });

  it('transpiles all 5 built-in VIDI X Arduino (.ino) sketches including LovyanGFX & FastLED', () => {
    for (const sketch of EXAMPLE_SKETCHES) {
      const { jsCode, userFunctions } = transpileArduinoSketch(sketch.code);
      expect(userFunctions).toContain('setup');
      expect(userFunctions).toContain('loop');
      expect(() => new Function(jsCode)).not.toThrow();
    }
  });

  it('compiles all Visual Block Coding Studio templates into valid VIDI X Arduino C++ and runs them', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];

    for (const tpl of BLOCK_TEMPLATES) {
      const cppCode = compileBlocksToArduino(tpl.program);
      expect(cppCode).toContain('void setup()');
      expect(cppCode).toContain('void loop()');

      cluster.updateSketch(board.state.id, cppCode, tpl.name);
      cluster.startBoard(board.state.id);
      await new Promise((r) => setTimeout(r, 70));
      expect(board.state.compileError).toBeNull();
      expect(board.state.running).toBe(true);
    }
    cluster.stopBoard(board.state.id);
  });

  it('simulates multiple VIDI X units with wireless ESP-NOW, wired GPIO/UART2, SD files, and extensions', async () => {
    const cluster = new VidiXClusterManager();
    const board1 = cluster.getBoards()[0];
    const board2Id = cluster.addBoard(EXAMPLE_SKETCHES[2].code, 'Pong #2', true);
    const board2 = cluster.getBoard(board2Id)!;

    expect(cluster.getBoards().length).toBe(2);
    expect(board1.state.macAddress).not.toBe(board2.state.macAddress);

    // Connect virtual jumper wires between Board #1 and Board #2
    cluster.autoWireTwoBoards(board1.state.id, board2.state.id);
    expect(cluster.getWireConnections().length).toBe(4);

    // Write and delete SD card files
    cluster.writeSdFile(board1.state.id, '/test.txt', 'HELLO_VIDI_X');
    expect(board1.state.sdFiles['/test.txt']?.content).toBe('HELLO_VIDI_X');
    cluster.deleteSdFile(board1.state.id, '/test.txt');
    expect(board1.state.sdFiles['/test.txt']).toBeUndefined();

    // Attach built-in reference extension
    expect(globalExtensionRegistry.listAvailable().length).toBeGreaterThanOrEqual(2);
    cluster.attachExtension(board1.state.id, 'ext-gpio-pulse-gen');
    expect(board1.state.attachedExtensions.length).toBe(1);
    cluster.detachExtension(board1.state.id, 'ext-gpio-pulse-gen');
    expect(board1.state.attachedExtensions.length).toBe(0);
  });

  it('executes setup() and loop() for all 8 built-in VIDI X sketches without runtime errors', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];

    for (const sketch of EXAMPLE_SKETCHES) {
      cluster.updateSketch(board.state.id, sketch.code, sketch.name);
      cluster.startBoard(board.state.id);
      await new Promise((r) => setTimeout(r, 80));
      expect(board.state.compileError).toBeNull();
      expect(board.state.running).toBe(true);
    }
    cluster.stopBoard(board.state.id);
  });

  it('correctly transpiles parenthesized (int)(...) casts and syncs 2-player 3D FPS positions over ESP-NOW', async () => {
    const { jsCode } = transpileArduinoSketch(`
      void setup() {}
      void loop() {
        int sx = (int)(160.0 + (-0.11 / 0.5236) * 160.0);
        int ci = (int)(sx / 4);
      }
    `);
    expect(jsCode).toContain('Math.trunc(160.0 + (-0.11 / 0.5236) * 160.0)');
    expect(jsCode).toContain('Math.trunc(sx / 4)');

    const mpSketch = EXAMPLE_SKETCHES.find(
      (s) => s.id === 'vidi-3d-fps-multiplayer'
    )!;
    expect(mpSketch).toBeDefined();

    const cluster = new VidiXClusterManager();
    const board1 = cluster.getBoards()[0];
    const board2Id = cluster.addBoard(mpSketch.code, mpSketch.name, true);
    const board2 = cluster.getBoard(board2Id)!;

    cluster.loadSketchToAllBoards(mpSketch.code, mpSketch.name);

    // Hold UP on Board 1 so Player 1 walks forward while broadcasting ESP-NOW packets
    cluster.setButtonState(board1.state.id, 'UP', true);
    await new Promise((r) => setTimeout(r, 180));
    cluster.setButtonState(board1.state.id, 'UP', false);

    expect(board1.state.compileError).toBeNull();
    expect(board2.state.compileError).toBeNull();

    // Verify P,x,y,angle,hp ESP-NOW packets were broadcast by both boards
    const packets = cluster.getWirelessPackets();
    const posPackets = packets.filter((p) => p.payload.startsWith('P,'));
    expect(posPackets.length).toBeGreaterThan(2);

    // Verify Player 1 moved forward from initial x=1.80 (wirelessLog is newest-first)
    const p1Packets = posPackets.filter((p) => p.fromBoardId === board1.state.id);
    expect(p1Packets.length).toBeGreaterThan(0);
    const latestP1 = p1Packets[0].payload.split(',');
    expect(parseFloat(latestP1[1])).toBeGreaterThan(1.8);

    cluster.stopBoard(board1.state.id);
    cluster.stopBoard(board2.state.id);
  });

  it('persists user projects in chunked cookies, provides pre-made playable projects, and exports real hardware .ino files', () => {
    expect(PREMADE_PLAYABLE_PROJECTS.length).toBeGreaterThanOrEqual(8);
    const defaults = createDefaultUserProjects();
    defaults[0].name = 'Cookie Persisted Test Project';
    saveProjectsToCookies(defaults, defaults[0].id);

    const loaded = loadProjectsFromCookies();
    expect(loaded.length).toBe(defaults.length);
    expect(loaded[0].name).toBe('Cookie Persisted Test Project');

    const mpPremade = PREMADE_PLAYABLE_PROJECTS.find(
      (p) => p.id === 'premade-3d-fps-2p'
    )!;
    const exportedHw = exportForRealVidiXHardware(mpPremade.sketchCode, mpPremade.name);
    expect(exportedHw).toContain('class LGFX : public lgfx::LGFX_Device');
    expect(exportedHw).toContain('struct VidiNetworkHardware');
    expect(exportedHw).toContain('esp_now_send');
  });

  it('runs the CircuitPython starter and VidiLAB quiz without idle speaker buzzing', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];

    // Tilt the VIDI X board via the VIDIIC MPU-6050 6-DoF Gyroscope
    cluster.updateSensors(board.state.id, {
      gyroRoll: 30,
      gyroPitch: -15,
      gyroYaw: 45,
    });
    expect(board.state.sensors.gyroRoll).toBe(30);
    expect(board.state.sensors.gyroRateX).toBeGreaterThan(0);

    // Run the dependency-free CircuitPython starter
    cluster.updateSketch(
      board.state.id,
      DEFAULT_STARTER_PYTHON,
      'My Python Gyro App'
    );
    cluster.startBoard(board.state.id);
    await new Promise((r) => setTimeout(r, 90));
    expect(board.state.compileError).toBeNull();
    expect(board.state.running).toBe(true);
    expect(board.state.audio.active).toBe(false);

    // Also run the official VidiLAB CircuitPython displayio Quiz (8080.py)
    const quizPremade = PREMADE_PLAYABLE_PROJECTS.find(
      (p) => p.id === 'premade-python-quiz'
    )!;
    cluster.updateSketch(board.state.id, quizPremade.sketchCode, quizPremade.name);
    cluster.startBoard(board.state.id);
    await new Promise((r) => setTimeout(r, 90));
    expect(board.state.compileError).toBeNull();
    expect(board.state.audio.active).toBe(false);

    cluster.stopBoard(board.state.id);
  });
});
