import { ArduinoSketchVM } from './arduinoRuntime';
import { PiezoSpeakerEngine } from './audio';
import { ILI9341Display } from './display';
import { EXAMPLE_SKETCHES } from './exampleSketches';
import { globalExtensionRegistry } from './extensions/registry';
import { createInitialPins, syncHardwareToPins, VIDI_X_PINS } from './pinout';
import {
  ButtonId,
  ExtensionBusContext,
  PinModeType,
  SDFile,
  SensorState,
  TouchState,
  VidiXBoardState,
  WireConnection,
  WirelessPacket,
  WirelessProtocol,
} from './types';

export interface BoardRuntimeInstance {
  state: VidiXBoardState;
  display: ILI9341Display;
  audio: PiezoSpeakerEngine;
  vm: ArduinoSketchVM;
  bootTimestamp: number;
  uartRxBuffers: { 0: string; 2: string };
  uart2Pins: { tx: number; rx: number };
  wirelessQueue: Array<{
    protocol: WirelessProtocol;
    fromMac: string;
    fromIp: string;
    payload: string;
    irCode?: number;
  }>;
  ledcChannels: Record<number, { freq: number; resolution: number; duty: number; attachedPin: number | null }>;
}

const DEFAULT_BUTTONS: Record<ButtonId, boolean> = {
  UP: false,
  DOWN: false,
  LEFT: false,
  RIGHT: false,
  A: false,
  B: false,
  START: false,
  SELECT: false,
  MENU: false,
  VOL_UP: false,
  VOL_DOWN: false,
  BOOT: false,
  RESET: false,
};

export class VidiXClusterManager {
  private boards = new Map<string, BoardRuntimeInstance>();
  private wireConnections: WireConnection[] = [];
  private wirelessLog: WirelessPacket[] = [];
  private listeners = new Set<() => void>();
  private nextBoardCounter = 1;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Spawn initial VIDI X Unit #1 by default
    this.addBoard(EXAMPLE_SKETCHES[0].code, EXAMPLE_SKETCHES[0].name, true);
    this.startHardwareTickLoop();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private startHardwareTickLoop(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      let anyRunning = false;
      for (const inst of this.boards.values()) {
        if (inst.state.poweredOn && inst.state.running) {
          anyRunning = true;
          inst.state.uptimeMs = Date.now() - inst.bootTimestamp;
          syncHardwareToPins(
            inst.state.pins,
            inst.state.buttons,
            inst.state.sensors,
            inst.state.uptimeMs
          );
          this.propagateWiresFromBoard(inst.state.id);

          // Record logic analyzer / oscilloscope sample for key pins
          inst.state.logicHistory.push({
            timestamp: inst.state.uptimeMs,
            pins: {
              34: inst.state.pins[34]?.analogValue ?? 0,
              35: inst.state.pins[35]?.analogValue ?? 0,
              32: (inst.state.pins[32]?.digitalValue ?? 1) * 4095,
              33: (inst.state.pins[33]?.digitalValue ?? 1) * 4095,
              25: inst.state.audio.active ? inst.state.audio.frequency * 2 : 0,
              26: inst.state.pins[26]?.analogValue ?? 0,
              14: inst.state.pins[14]?.analogValue ?? 0,
              39: inst.state.pins[39]?.analogValue ?? 0,
            },
          });
          if (inst.state.logicHistory.length > 120) {
            inst.state.logicHistory.shift();
          }

          // Tick attached hardware extensions
          if (inst.state.attachedExtensions.length > 0) {
            globalExtensionRegistry.notifyTick(
              inst.state.attachedExtensions,
              this.createExtensionContext(inst),
              50
            );
          }
        }
      }
      if (anyRunning) {
        this.emitChange();
      }
    }, 50);
  }

  private createExtensionContext(inst: BoardRuntimeInstance): ExtensionBusContext {
    return {
      boardId: inst.state.id,
      readDigital: (gpio) => inst.state.pins[gpio]?.digitalValue ?? 0,
      writeDigital: (gpio, val) => {
        if (inst.state.pins[gpio]) {
          inst.state.pins[gpio].digitalValue = val;
          inst.state.pins[gpio].analogValue = val ? 4095 : 0;
          inst.state.pins[gpio].isExternalDriven = true;
        }
      },
      readAnalog: (gpio) => inst.state.pins[gpio]?.analogValue ?? 0,
      writeAnalog: (gpio, val) => {
        if (inst.state.pins[gpio]) {
          inst.state.pins[gpio].analogValue = Math.max(0, Math.min(4095, val));
          inst.state.pins[gpio].digitalValue = val > 2048 ? 1 : 0;
          inst.state.pins[gpio].isExternalDriven = true;
        }
      },
      sendSerialRx: (uart, data) => {
        inst.uartRxBuffers[uart] += data;
      },
      emitInterrupt: () => {},
    };
  }

  public addBoard(
    sketchCode = EXAMPLE_SKETCHES[0].code,
    sketchName = EXAMPLE_SKETCHES[0].name,
    autoRun = true
  ): string {
    const idx = this.nextBoardCounter++;
    const id = `vidi-x-${idx}`;
    const hexId = idx.toString(16).padStart(2, '0').toUpperCase();
    const macAddress = `24:6F:28:VD:10:${hexId}`;
    const ipAddress = `192.168.4.${100 + idx}`;

    const display = new ILI9341Display();
    const audio = new PiezoSpeakerEngine();
    const pins = createInitialPins();

    const state: VidiXBoardState = {
      id,
      name: `VIDI X #${idx}`,
      macAddress,
      ipAddress,
      poweredOn: true,
      running: false,
      compileError: null,
      sketchCode,
      sketchName,
      uptimeMs: 0,
      fps: 60,
      loopHz: 60,
      cpuLoad: 14,
      wifiConnected: false,
      wifiSsid: 'VIDI-X-MESH',
      btEnabled: false,
      btDeviceName: `VIDI-X-${idx}`,
      espNowInitialized: false,
      buttons: { ...DEFAULT_BUTTONS },
      touch: { pressed: false, x: 160, y: 120, z: 0 },
      sensors: {
        temperatureC: 24.5,
        lightLevel: 68,
        micLevel: 25,
        micFrequency: 440,
        batteryVoltage: 4.12,
        irLastCode: 0,
        irAvailable: false,
        tempLightJumper: 'LIGHT',
        dpadMapping: 'STD_34LR_35UD',
        gyroPitch: 0,
        gyroRoll: 0,
        gyroYaw: 0,
        gyroRateX: 0,
        gyroRateY: 0,
        gyroRateZ: 0,
      },
      audio: {
        active: false,
        frequency: 0,
        volume: 60,
        muted: false,
      },
      leds: {
        power: true,
        status: false,
        wifi: false,
        sd: false,
      },
      rgbLeds: Array.from({ length: 5 }, () => ({ r: 0, g: 0, b: 0 })),
      pins,
      serialLog: [
        {
          id: `${id}-boot`,
          timestamp: Date.now(),
          text: `ESP-ROM:esp32-wrover-vidi-x-v1.1 (MAC: ${macAddress})`,
          direction: 'sys',
        },
      ],
      sdFiles: {
        '/readme.txt': {
          name: '/readme.txt',
          content: `VIDI X Unit #${idx} MicroSD Card\nBoard MAC: ${macAddress}\n`,
          updatedAt: Date.now(),
        },
        '/highscore.txt': {
          name: '/highscore.txt',
          content: '120',
          updatedAt: Date.now(),
        },
      },
      attachedExtensions: [],
      logicHistory: [],
    };

    const inst: BoardRuntimeInstance = {
      state,
      display,
      audio,
      bootTimestamp: Date.now(),
      uartRxBuffers: { 0: '', 2: '' },
      uart2Pins: { tx: VIDI_X_PINS.UART2_TX, rx: VIDI_X_PINS.UART2_RX },
      wirelessQueue: [],
      ledcChannels: {},
      vm: null as unknown as ArduinoSketchVM,
    };

    inst.vm = new ArduinoSketchVM({
      boardId: id,
      boardIndex: this.boards.size,
      macAddress,
      ipAddress,
      display,
      getMillis: () => Date.now() - inst.bootTimestamp,
      isRunning: () => inst.state.poweredOn && inst.state.running,
      onPinMode: (gpio: number, mode: PinModeType) => {
        if (!inst.state.pins[gpio]) {
          inst.state.pins[gpio] = {
            gpio,
            label: `GPIO${gpio}`,
            mode,
            digitalValue: mode === 'INPUT_PULLUP' ? 1 : 0,
            analogValue: mode === 'INPUT_PULLUP' ? 4095 : 0,
            pwmFreq: 0,
            pwmDuty: 0,
            pwmChannel: null,
            isExternalDriven: false,
          };
        } else {
          inst.state.pins[gpio].mode = mode;
        }
      },
      onDigitalWrite: (gpio: number, val: 0 | 1) => {
        if (!inst.state.pins[gpio]) return;
        inst.state.pins[gpio].mode = 'OUTPUT';
        inst.state.pins[gpio].digitalValue = val;
        inst.state.pins[gpio].analogValue = val ? 4095 : 0;
        if (gpio === VIDI_X_PINS.LED_BUILTIN || gpio === VIDI_X_PINS.STATUS_LED) {
          inst.state.leds.status = val === 1;
        }
        this.propagateWiresFromBoard(id);
        globalExtensionRegistry.notifyPinWrite(
          inst.state.attachedExtensions,
          this.createExtensionContext(inst),
          gpio,
          val,
          val ? 4095 : 0
        );
      },
      onDigitalRead: (gpio: number) => {
        syncHardwareToPins(
          inst.state.pins,
          inst.state.buttons,
          inst.state.sensors,
          Date.now() - inst.bootTimestamp
        );
        return inst.state.pins[gpio]?.digitalValue ?? 0;
      },
      onAnalogRead: (gpio: number) => {
        syncHardwareToPins(
          inst.state.pins,
          inst.state.buttons,
          inst.state.sensors,
          Date.now() - inst.bootTimestamp
        );
        // Special convenience: if sketch reads TEMP_PIN (26), always return calculated MCP9700A ADC
        if (gpio === VIDI_X_PINS.TEMP_PIN && !inst.state.pins[26]?.isExternalDriven) {
          const tempMv = 500 + inst.state.sensors.temperatureC * 10;
          return Math.max(0, Math.min(4095, Math.round((tempMv / 3300) * 4095)));
        }
        return inst.state.pins[gpio]?.analogValue ?? 0;
      },
      onAnalogWrite: (gpio: number, val: number) => {
        if (!inst.state.pins[gpio]) return;
        const clamped = Math.max(0, Math.min(4095, val));
        inst.state.pins[gpio].mode = 'PWM';
        inst.state.pins[gpio].analogValue = clamped;
        inst.state.pins[gpio].digitalValue = clamped > 127 ? 1 : 0;
        this.propagateWiresFromBoard(id);
      },
      onTone: (_gpio: number, freq: number, duration?: number) => {
        inst.state.audio.active = true;
        inst.state.audio.frequency = Math.round(freq);
        if (inst.state.pins[VIDI_X_PINS.SPEAKER_PIN]) {
          inst.state.pins[VIDI_X_PINS.SPEAKER_PIN].pwmFreq = Math.round(freq);
          inst.state.pins[VIDI_X_PINS.SPEAKER_PIN].digitalValue = 1;
        }
        inst.audio.tone(freq, duration, () => {
          inst.state.audio.active = false;
          inst.state.audio.frequency = 0;
          if (inst.state.pins[VIDI_X_PINS.SPEAKER_PIN]) {
            inst.state.pins[VIDI_X_PINS.SPEAKER_PIN].pwmFreq = 0;
            inst.state.pins[VIDI_X_PINS.SPEAKER_PIN].digitalValue = 0;
          }
        });
      },
      onNoTone: () => {
        inst.audio.noTone();
        inst.state.audio.active = false;
        inst.state.audio.frequency = 0;
      },
      onLedcSetup: (channel: number, freq: number, resolution: number) => {
        inst.ledcChannels[channel] = {
          freq,
          resolution,
          duty: 0,
          attachedPin: inst.ledcChannels[channel]?.attachedPin ?? null,
        };
      },
      onLedcAttachPin: (gpio: number, channel: number) => {
        if (!inst.ledcChannels[channel]) {
          inst.ledcChannels[channel] = { freq: 2000, resolution: 8, duty: 0, attachedPin: gpio };
        } else {
          inst.ledcChannels[channel].attachedPin = gpio;
        }
        if (inst.state.pins[gpio]) {
          inst.state.pins[gpio].pwmChannel = channel;
          inst.state.pins[gpio].mode = 'PWM';
        }
      },
      onLedcWrite: (channel: number, duty: number) => {
        const ch = inst.ledcChannels[channel];
        if (!ch) return;
        ch.duty = duty;
        if (ch.attachedPin !== null && inst.state.pins[ch.attachedPin]) {
          inst.state.pins[ch.attachedPin].pwmDuty = duty;
          inst.state.pins[ch.attachedPin].analogValue = Math.min(4095, duty * 16);
          inst.state.pins[ch.attachedPin].digitalValue = duty > 0 ? 1 : 0;
        }
      },
      onLedcWriteTone: (_channel: number, freq: number) => {
        if (freq <= 0) {
          inst.audio.noTone();
          inst.state.audio.active = false;
          inst.state.audio.frequency = 0;
        } else {
          inst.state.audio.active = true;
          inst.state.audio.frequency = Math.round(freq);
          inst.audio.tone(freq);
        }
      },
      onUpdateRgbLeds: (leds) => {
        inst.state.rgbLeds = leds;
      },
      getTouch: () => inst.state.touch,
      getSensors: () => inst.state.sensors,
      onConfigureUart: (tx: number, rx: number) => { inst.uart2Pins = { tx, rx }; },
      onSerialPrint: (uart: 0 | 2, text: string) => {
        if (uart === 0) {
          this.appendSerialLog(inst, text, 'tx');
        } else {
          // UART2 TX (GPIO 17) -> forward to any board wired to GPIO 17!
          this.forwardWiredUart2(id, text);
        }
      },
      onSerialAvailable: (uart: 0 | 2) => inst.uartRxBuffers[uart].length,
      onSerialReadString: (uart: 0 | 2) => {
        const s = inst.uartRxBuffers[uart];
        inst.uartRxBuffers[uart] = '';
        return s;
      },
      onSerialReadChar: (uart: 0 | 2) => {
        const buf = inst.uartRxBuffers[uart];
        if (!buf.length) return -1;
        const code = buf.charCodeAt(0);
        inst.uartRxBuffers[uart] = buf.slice(1);
        return code;
      },
      onWifiConnect: (ssid: string) => {
        inst.state.wifiConnected = true;
        inst.state.wifiSsid = ssid;
        inst.state.leds.wifi = true;
      },
      onEspNowInit: () => {
        inst.state.espNowInitialized = true;
        inst.state.leds.wifi = true;
      },
      onBtBegin: (name: string) => {
        inst.state.btEnabled = true;
        inst.state.btDeviceName = name;
        inst.state.leds.wifi = true;
      },
      onSendWireless: (
        protocol: WirelessProtocol,
        toMacOrIp: string,
        payload: string,
        portOrIrCode?: number
      ) => {
        this.routeWirelessPacket(inst, protocol, toMacOrIp, payload, portOrIrCode);
      },
      onPopWirelessPacket: (protocol?: WirelessProtocol) => {
        if (!inst.wirelessQueue.length) return null;
        if (!protocol) {
          return inst.wirelessQueue.shift() || null;
        }
        const idx = inst.wirelessQueue.findIndex((p) => p.protocol === protocol);
        if (idx === -1) return null;
        const [pkt] = inst.wirelessQueue.splice(idx, 1);
        return pkt;
      },
      onPeekWirelessCount: (protocol?: WirelessProtocol) => {
        if (!protocol) return inst.wirelessQueue.length;
        return inst.wirelessQueue.filter((p) => p.protocol === protocol).length;
      },
      onGetIrCode: () => ({
        available: inst.state.sensors.irAvailable,
        code: inst.state.sensors.irLastCode,
      }),
      onConsumeIrCode: () => {
        inst.state.sensors.irAvailable = false;
      },
      onSdRead: (path: string) => {
        const clean = path.startsWith('/') ? path : `/${path}`;
        inst.state.leds.sd = true;
        setTimeout(() => {
          inst.state.leds.sd = false;
        }, 80);
        return inst.state.sdFiles[clean] || null;
      },
      onSdWrite: (path: string, content: string, append: boolean) => {
        const clean = path.startsWith('/') ? path : `/${path}`;
        inst.state.leds.sd = true;
        setTimeout(() => {
          inst.state.leds.sd = false;
        }, 80);
        const existing = inst.state.sdFiles[clean]?.content ?? '';
        inst.state.sdFiles[clean] = {
          name: clean,
          content: append ? existing + content : content,
          updatedAt: Date.now(),
        };
        this.emitChange();
      },
      onSdRemove: (path: string) => {
        const clean = path.startsWith('/') ? path : `/${path}`;
        if (inst.state.sdFiles[clean]) {
          delete inst.state.sdFiles[clean];
          this.emitChange();
          return true;
        }
        return false;
      },
    });

    this.boards.set(id, inst);
    this.reindexBoardIndices();

    if (autoRun) {
      this.startBoard(id);
    } else {
      this.emitChange();
    }

    return id;
  }

  private reindexBoardIndices(): void {
    let idx = 0;
    for (const inst of this.boards.values()) {
      (inst.vm as unknown as { callbacks: { boardIndex: number } }).callbacks.boardIndex = idx++;
    }
  }

  public removeBoard(boardId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.vm.stop();
    inst.audio.destroy();
    this.boards.delete(boardId);
    this.wireConnections = this.wireConnections.filter(
      (w) => w.fromBoardId !== boardId && w.toBoardId !== boardId
    );
    this.reindexBoardIndices();
    this.emitChange();
  }

  public getBoards(): BoardRuntimeInstance[] {
    return Array.from(this.boards.values());
  }

  public getBoard(boardId: string): BoardRuntimeInstance | undefined {
    return this.boards.get(boardId);
  }

  public startBoard(boardId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst || !inst.state.poweredOn) return;
    inst.audio.noTone();
    inst.state.audio.active = false;
    inst.state.audio.frequency = 0;
    inst.state.compileError = null;
    inst.uart2Pins = { tx: VIDI_X_PINS.UART2_TX, rx: VIDI_X_PINS.UART2_RX };
    inst.bootTimestamp = Date.now();
    inst.state.uptimeMs = 0;
    inst.state.running = true;
    inst.display.begin();

    syncHardwareToPins(inst.state.pins, inst.state.buttons, inst.state.sensors, 0);

    const ok = inst.vm.compileAndStart(inst.state.sketchCode, (err) => {
      inst.state.compileError = err;
      inst.state.running = false;
      this.appendSerialLog(inst, `[ERROR] ${err}`, 'sys');
      this.emitChange();
    });

    if (!ok) {
      inst.state.running = false;
    }
    this.emitChange();
  }

  public stopBoard(boardId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.vm.stop();
    inst.audio.noTone();
    inst.state.running = false;
    inst.state.audio.active = false;
    inst.state.audio.frequency = 0;
    this.emitChange();
  }

  public resetBoard(boardId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    this.stopBoard(boardId);
    inst.uartRxBuffers = { 0: '', 2: '' };
    inst.wirelessQueue = [];
    if (inst.state.poweredOn) {
      this.startBoard(boardId);
    }
  }

  public togglePower(boardId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.state.poweredOn = !inst.state.poweredOn;
    inst.state.leds.power = inst.state.poweredOn;
    if (!inst.state.poweredOn) {
      this.stopBoard(boardId);
      inst.display.fillScreen(0x0000);
      inst.state.leds.status = false;
      inst.state.leds.wifi = false;
      inst.state.leds.sd = false;
    } else {
      this.startBoard(boardId);
    }
    this.emitChange();
  }

  public updateSketch(boardId: string, sketchCode: string, sketchName?: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.audio.noTone();
    inst.state.audio.active = false;
    inst.state.audio.frequency = 0;
    inst.state.sketchCode = sketchCode;
    if (sketchName) inst.state.sketchName = sketchName;
    this.emitChange();
  }

  public loadSketchToAllBoards(sketchCode: string, sketchName: string): void {
    for (const inst of this.boards.values()) {
      inst.state.sketchCode = sketchCode;
      inst.state.sketchName = sketchName;
      if (inst.state.poweredOn) {
        this.startBoard(inst.state.id);
      }
    }
    this.emitChange();
  }

  public setButtonState(boardId: string, button: ButtonId, pressed: boolean): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    if (button === 'RESET') {
      inst.state.buttons.RESET = pressed;
      if (pressed) {
        this.resetBoard(boardId);
      }
      this.emitChange();
      return;
    }
    inst.state.buttons[button] = pressed;
    syncHardwareToPins(
      inst.state.pins,
      inst.state.buttons,
      inst.state.sensors,
      Date.now() - inst.bootTimestamp
    );
    this.propagateWiresFromBoard(boardId);
    this.emitChange();
  }

  public setTouchState(boardId: string, touch: Partial<TouchState>): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.state.touch = { ...inst.state.touch, ...touch };
    if (inst.state.pins[VIDI_X_PINS.TOUCH_IRQ]) {
      inst.state.pins[VIDI_X_PINS.TOUCH_IRQ].digitalValue = inst.state.touch.pressed ? 0 : 1;
    }
    this.emitChange();
  }

  public updateSensors(boardId: string, partial: Partial<SensorState>): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    const prev = inst.state.sensors;
    const next: SensorState = { ...prev, ...partial };
    if (partial.gyroRoll !== undefined && partial.gyroRateX === undefined) {
      next.gyroRateX = +(((partial.gyroRoll - (prev.gyroRoll ?? 0)) * Math.PI) / 180 * 4).toFixed(2);
    }
    if (partial.gyroPitch !== undefined && partial.gyroRateY === undefined) {
      next.gyroRateY = +(((partial.gyroPitch - (prev.gyroPitch ?? 0)) * Math.PI) / 180 * 4).toFixed(2);
    }
    if (partial.gyroYaw !== undefined && partial.gyroRateZ === undefined) {
      next.gyroRateZ = +(((partial.gyroYaw - (prev.gyroYaw ?? 0)) * Math.PI) / 180 * 4).toFixed(2);
    }
    inst.state.sensors = next;
    syncHardwareToPins(
      inst.state.pins,
      inst.state.buttons,
      inst.state.sensors,
      Date.now() - inst.bootTimestamp
    );
    this.emitChange();
  }

  public sendIrCommandToBoard(boardId: string, commandCode: number): void {
    const inst = this.boards.get(boardId);
    if (!inst || !inst.state.poweredOn) return;
    inst.state.sensors.irLastCode = commandCode;
    inst.state.sensors.irAvailable = true;
    this.emitChange();
  }

  public setAudioMuted(boardId: string, muted: boolean): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.state.audio.muted = muted;
    inst.audio.setMuted(muted);
    this.emitChange();
  }

  public setAudioVolume(boardId: string, volume: number): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.state.audio.volume = volume;
    inst.audio.setVolume(volume);
    this.emitChange();
  }

  public sendSerialInput(boardId: string, text: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.uartRxBuffers[0] += text + '\n';
    this.appendSerialLog(inst, text, 'rx');
    this.emitChange();
  }

  public clearSerialLog(boardId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    inst.state.serialLog = [];
    this.emitChange();
  }

  public writeSdFile(boardId: string, name: string, content: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    const clean = name.startsWith('/') ? name : `/${name}`;
    inst.state.sdFiles[clean] = {
      name: clean,
      content,
      updatedAt: Date.now(),
    };
    this.emitChange();
  }

  public deleteSdFile(boardId: string, name: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    const clean = name.startsWith('/') ? name : `/${name}`;
    delete inst.state.sdFiles[clean];
    this.emitChange();
  }

  public attachExtension(boardId: string, extensionId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    if (inst.state.attachedExtensions.some((x) => x.extensionId === extensionId)) return;
    const attached = globalExtensionRegistry.notifyAttach(
      extensionId,
      this.createExtensionContext(inst)
    );
    if (attached) {
      inst.state.attachedExtensions.push(attached);
      this.emitChange();
    }
  }

  public detachExtension(boardId: string, extensionId: string): void {
    const inst = this.boards.get(boardId);
    if (!inst) return;
    globalExtensionRegistry.notifyDetach(extensionId, this.createExtensionContext(inst));
    inst.state.attachedExtensions = inst.state.attachedExtensions.filter(
      (x) => x.extensionId !== extensionId
    );
    this.emitChange();
  }

  private appendSerialLog(
    inst: BoardRuntimeInstance,
    text: string,
    direction: 'tx' | 'rx' | 'sys'
  ): void {
    const clean = text.replace(/\n$/, '');
    if (!clean) return;
    inst.state.serialLog.push({
      id: `${inst.state.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      text: clean,
      direction,
    });
    if (inst.state.serialLog.length > 150) {
      inst.state.serialLog.shift();
    }
  }

  // ============================================================================
  // Multi-Board Wireless Bus (ESP-NOW / WiFi UDP / Bluetooth / IR)
  // ============================================================================
  private routeWirelessPacket(
    sender: BoardRuntimeInstance,
    protocol: WirelessProtocol,
    toMacOrIp: string,
    payload: string,
    portOrIrCode?: number
  ): void {
    const pkt: WirelessPacket = {
      id: `pkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      protocol,
      fromBoardId: sender.state.id,
      fromMac: sender.state.macAddress,
      fromIp: sender.state.ipAddress,
      toMac: toMacOrIp,
      port: protocol === 'WIFI-UDP' ? portOrIrCode : undefined,
      irCode: protocol === 'IR' ? portOrIrCode : undefined,
      payload,
    };

    this.wirelessLog.unshift(pkt);
    if (this.wirelessLog.length > 120) {
      this.wirelessLog.pop();
    }

    sender.state.leds.wifi = true;

    for (const target of this.boards.values()) {
      if (target.state.id === sender.state.id || !target.state.poweredOn) continue;

      const isBroadcast =
        toMacOrIp === 'FF:FF:FF:FF:FF:FF' ||
        toMacOrIp === '255.255.255.255' ||
        toMacOrIp === '*';
      const isDirectMatch =
        target.state.macAddress.toLowerCase() === toMacOrIp.toLowerCase() ||
        target.state.ipAddress === toMacOrIp;

      if (isBroadcast || isDirectMatch) {
        if (protocol === 'IR' && portOrIrCode !== undefined) {
          target.state.sensors.irLastCode = portOrIrCode;
          target.state.sensors.irAvailable = true;
        } else {
          target.wirelessQueue.push({
            protocol,
            fromMac: sender.state.macAddress,
            fromIp: sender.state.ipAddress,
            payload,
            irCode: portOrIrCode,
          });
          if (target.wirelessQueue.length > 50) {
            target.wirelessQueue.shift();
          }
        }
        target.state.leds.wifi = true;
      }
    }
  }

  public getWirelessPackets(): WirelessPacket[] {
    return this.wirelessLog;
  }

  public clearWirelessPackets(): void {
    this.wirelessLog = [];
    this.emitChange();
  }

  // ============================================================================
  // Multi-Board Wired Expansion Header GPIO & UART2 Interconnects
  // ============================================================================
  public getWireConnections(): WireConnection[] {
    return this.wireConnections;
  }

  public addWireConnection(
    fromBoardId: string,
    fromGpio: number,
    toBoardId: string,
    toGpio: number,
    color = '#38bdf8',
    label?: string
  ): WireConnection | null {
    if (fromBoardId === toBoardId && fromGpio === toGpio) return null;
    const exists = this.wireConnections.some(
      (w) =>
        (w.fromBoardId === fromBoardId &&
          w.fromGpio === fromGpio &&
          w.toBoardId === toBoardId &&
          w.toGpio === toGpio) ||
        (w.fromBoardId === toBoardId &&
          w.fromGpio === toGpio &&
          w.toBoardId === fromBoardId &&
          w.toGpio === fromGpio)
    );
    if (exists) return null;

    const conn: WireConnection = {
      id: `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      color,
      fromBoardId,
      fromGpio,
      toBoardId,
      toGpio,
      label,
    };
    this.wireConnections.push(conn);
    this.propagateWiresFromBoard(fromBoardId);
    this.propagateWiresFromBoard(toBoardId);
    this.emitChange();
    return conn;
  }

  public removeWireConnection(wireId: string): void {
    const wire = this.wireConnections.find((w) => w.id === wireId);
    this.wireConnections = this.wireConnections.filter((w) => w.id !== wireId);
    if (wire) {
      const b1 = this.boards.get(wire.fromBoardId);
      const b2 = this.boards.get(wire.toBoardId);
      if (b1?.state.pins[wire.fromGpio]) b1.state.pins[wire.fromGpio].isExternalDriven = false;
      if (b2?.state.pins[wire.toGpio]) b2.state.pins[wire.toGpio].isExternalDriven = false;
    }
    this.emitChange();
  }

  public autoWireTwoBoards(boardAId: string, boardBId: string): void {
    // 1. UART2 Crossover: TX2 (17) <-> RX2 (16)
    this.addWireConnection(boardAId, 17, boardBId, 16, '#22d3ee', 'UART2 TX2->RX2');
    this.addWireConnection(boardBId, 17, boardAId, 16, '#a855f7', 'UART2 TX2->RX2');
    // 2. Digital GPIO Bridge: GPIO 26 <-> GPIO 14
    this.addWireConnection(boardAId, 26, boardBId, 14, '#f59e0b', 'GPIO26->GPIO14');
    this.addWireConnection(boardBId, 26, boardAId, 14, '#10b981', 'GPIO26->GPIO14');
  }

  public autoWireSafeBridge(boardAId: string, boardBId: string): void {
    this.addWireConnection(boardAId, 15, boardBId, 27, '#22d3ee', 'GPIO15 TX -> GPIO27 RX');
    this.addWireConnection(boardBId, 15, boardAId, 27, '#a855f7', 'GPIO15 TX -> GPIO27 RX');
    this.addWireConnection(boardAId, 26, boardBId, 14, '#f59e0b', 'GPIO26 -> GPIO14');
    this.addWireConnection(boardBId, 26, boardAId, 14, '#10b981', 'GPIO26 -> GPIO14');
  }

  private propagateWiresFromBoard(sourceBoardId: string): void {
    const srcBoard = this.boards.get(sourceBoardId);
    if (!srcBoard || !srcBoard.state.poweredOn) return;

    for (const wire of this.wireConnections) {
      let fromInst: BoardRuntimeInstance | undefined;
      let fromPinNum = 0;
      let toInst: BoardRuntimeInstance | undefined;
      let toPinNum = 0;

      if (wire.fromBoardId === sourceBoardId) {
        fromInst = srcBoard;
        fromPinNum = wire.fromGpio;
        toInst = this.boards.get(wire.toBoardId);
        toPinNum = wire.toGpio;
      } else if (wire.toBoardId === sourceBoardId) {
        fromInst = srcBoard;
        fromPinNum = wire.toGpio;
        toInst = this.boards.get(wire.fromBoardId);
        toPinNum = wire.fromGpio;
      }

      if (!fromInst || !toInst || !toInst.state.poweredOn) continue;

      const srcPin = fromInst.state.pins[fromPinNum];
      const dstPin = toInst.state.pins[toPinNum];
      if (!srcPin || !dstPin) continue;

      // Drive destination input pin when source pin is in OUTPUT or PWM mode
      if (srcPin.mode === 'OUTPUT' || srcPin.mode === 'PWM') {
        dstPin.isExternalDriven = true;
        dstPin.digitalValue = srcPin.digitalValue;
        dstPin.analogValue = srcPin.analogValue;
      }
    }
  }

  private forwardWiredUart2(sourceBoardId: string, data: string): void {
    const source = this.boards.get(sourceBoardId);
    if (!source) return;
    for (const wire of this.wireConnections) {
      const forward = wire.fromBoardId === sourceBoardId && wire.fromGpio === source.uart2Pins.tx;
      const reverse = wire.toBoardId === sourceBoardId && wire.toGpio === source.uart2Pins.tx;
      const destinationId = forward ? wire.toBoardId : reverse ? wire.fromBoardId : null;
      const destinationGpio = forward ? wire.toGpio : wire.fromGpio;
      const destination = destinationId ? this.boards.get(destinationId) : undefined;
      if (destination?.state.poweredOn && destinationGpio === destination.uart2Pins.rx) {
        destination.uartRxBuffers[2] += data;
      }
    }
  }
}
