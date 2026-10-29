export type ButtonId =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'A'
  | 'B'
  | 'START'
  | 'SELECT'
  | 'MENU'
  | 'VOL_UP'
  | 'VOL_DOWN'
  | 'BOOT'
  | 'RESET';

export type PinModeType = 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' | 'INPUT_PULLDOWN' | 'ANALOG' | 'PWM';

export interface PinState {
  gpio: number;
  label: string;
  mode: PinModeType;
  digitalValue: 0 | 1;
  analogValue: number; // 0..4095 (12-bit ADC) or 0..255 (DAC)
  pwmFreq: number;
  pwmDuty: number;
  pwmChannel: number | null;
  isExternalDriven: boolean;
}

export interface ExpansionPinDef {
  headerPin: number; // 1..30 on VIDI X top expansion connector
  name: string;
  gpio: number | null; // null for 3V3, 5V, GND, EN
  type: 'GPIO' | 'POWER_3V3' | 'POWER_5V' | 'GND' | 'SYS';
  capabilities: string[];
  description: string;
}

export interface TouchState {
  pressed: boolean;
  x: number; // 0..319
  y: number; // 0..239
  z: number; // pressure 0..4095
}

export interface SensorState {
  temperatureC: number; // -20 to 85 C (MCP9700A on GPIO 26)
  lightLevel: number; // 0 to 100 % (Photoresistor on GPIO 39)
  micLevel: number; // 0 to 100 % (Microphone preamp on GPIO 14 & GPIO 36)
  micFrequency: number; // Simulated audio input frequency Hz
  batteryVoltage: number; // 3.2V to 4.2V LiPo
  irLastCode: number; // Last received NEC IR code
  irAvailable: boolean;
  tempLightJumper: 'LIGHT' | 'TEMP'; // Jumper selector for GPIO 39
  dpadMapping: 'STD_34LR_35UD' | 'ALT_34UD_35LR'; // Official VidiLAB uses 34=LR, 35=UD
  // VIDIIC I2C 6-DoF Gyroscope + Accelerometer (MPU-6050 @ 0x68 on SCL=32, SDA=33)
  gyroPitch?: number; // -90 to +90 degrees (tilt forward/back)
  gyroRoll?: number; // -90 to +90 degrees (tilt left/right)
  gyroYaw?: number; // -180 to +180 degrees (heading)
  gyroRateX?: number; // Angular rate X (rad/s)
  gyroRateY?: number; // Angular rate Y (rad/s)
  gyroRateZ?: number; // Angular rate Z (rad/s)
}

export interface AudioState {
  active: boolean;
  frequency: number;
  volume: number; // 0..100
  muted: boolean;
}

export interface SDFile {
  name: string;
  content: string;
  updatedAt: number;
}

export interface SerialMessage {
  id: string;
  timestamp: number;
  text: string;
  direction: 'tx' | 'rx' | 'sys';
}

export type WirelessProtocol = 'ESP-NOW' | 'WIFI-UDP' | 'BLUETOOTH' | 'IR';

export interface WirelessPacket {
  id: string;
  timestamp: number;
  protocol: WirelessProtocol;
  fromBoardId: string;
  fromMac: string;
  fromIp: string;
  toMac: string; // 'FF:FF:FF:FF:FF:FF' for broadcast, or specific MAC
  toIp?: string;
  port?: number;
  payload: string;
  irCode?: number;
}

export interface WireConnection {
  id: string;
  color: string;
  fromBoardId: string;
  fromGpio: number;
  toBoardId: string;
  toGpio: number;
  label?: string;
}

export interface LogicSample {
  timestamp: number;
  pins: Record<number, number>; // gpio -> 0..4095
}

/**
 * Hardware Extension System Architecture
 * Allows plug-and-play expansion modules to attach to the 60-pin VIDI X Expansion Bus.
 */
export interface ExtensionBusContext {
  boardId: string;
  readDigital: (gpio: number) => 0 | 1;
  writeDigital: (gpio: number, value: 0 | 1) => void;
  readAnalog: (gpio: number) => number;
  writeAnalog: (gpio: number, value: number) => void;
  sendSerialRx: (uartNum: 0 | 2, data: string) => void;
  emitInterrupt: (gpio: number) => void;
}

export interface HardwareExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  usedGpios: number[];
  onAttach?: (ctx: ExtensionBusContext) => void;
  onDetach?: (ctx: ExtensionBusContext) => void;
  onTick?: (ctx: ExtensionBusContext, deltaMs: number) => void;
  onPinWrite?: (ctx: ExtensionBusContext, gpio: number, digital: 0 | 1, analog: number) => void;
  onI2CWrite?: (ctx: ExtensionBusContext, address: number, bytes: number[]) => number[];
}

export interface AttachedExtensionState {
  extensionId: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface RGBLedColor {
  r: number;
  g: number;
  b: number;
}

export interface VidiXBoardState {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  poweredOn: boolean;
  running: boolean;
  compileError: string | null;
  sketchCode: string;
  sketchName: string;
  uptimeMs: number;
  fps: number;
  loopHz: number;
  cpuLoad: number;
  wifiConnected: boolean;
  wifiSsid: string;
  btEnabled: boolean;
  btDeviceName: string;
  espNowInitialized: boolean;
  buttons: Record<ButtonId, boolean>;
  touch: TouchState;
  sensors: SensorState;
  audio: AudioState;
  leds: {
    power: boolean; // Green PWR LED
    status: boolean; // Blue STAT LED (GPIO 2 / GPIO 33)
    wifi: boolean; // Cyan RF activity LED
    sd: boolean; // Amber SD activity LED
  };
  rgbLeds: RGBLedColor[]; // 5x WS2812B FastLED NeoPixels on GPIO 26
  pins: Record<number, PinState>;
  serialLog: SerialMessage[];
  sdFiles: Record<string, SDFile>;
  attachedExtensions: AttachedExtensionState[];
  logicHistory: LogicSample[];
}
