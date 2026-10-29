import { ButtonId, ExpansionPinDef, PinState, SensorState } from './types';

/**
 * Official VIDI X v1.1 Hardware Pin Constants (verified against VidiLAB-com/Vidi-X)
 */
export const VIDI_X_PINS = {
  // ILI9341 320x240 TFT Display (VSPI)
  TFT_CS: 5,
  TFT_DC: 21,
  TFT_MOSI: 23,
  TFT_SCLK: 18,
  TFT_RST: 4,
  TFT_MISO: 19,

  // XPT2046 Resistive Touch Controller
  TOUCH_CS: 14,
  TOUCH_IRQ: 2,

  // MicroSD Card Slot
  SD_CS: 22,

  // Official VidiLAB Physical Button GPIO & Analog Resistor Ladders
  BTN_LR: 34, // ADC1_CH6: LEFT = 4095 (>4000), RIGHT = 2000 (1800..2200)
  BTN_LEFT_RIGHT: 34,
  BTN_UD: 35, // ADC1_CH7: UP = 4095 (>4000), DOWN = 2000 (1800..2200)
  BTN_UP_DOWN: 35,
  UP_DOWN: 35,
  BTN_SELECT_START: 27, // ADC2_CH7: SELECT = 4095, START = 2000
  BTN_A: 32, // Tipka A / Action Button A (GPIO 32)
  Tipka_A: 32,
  BTN_B: 33, // Tipka B / Action Button B (GPIO 33)
  Tipka_B: 33,
  BTN_MENU: 13, // Menu / Volume / Relay (GPIO 13)
  BTN_BOOT: 0, // ESP32 Boot / Restart Button (GPIO 0)
  BTN_RESTART: 0,

  // Dedicated Direct Button Aliases (Virtual GPIO 101..108 for direct digitalRead convenience)
  BTN_UP: 101,
  BTN_DOWN: 102,
  BTN_LEFT: 103,
  BTN_RIGHT: 104,
  BTN_START: 105,
  BTN_SELECT: 106,
  BTN_VOL_UP: 107,
  BTN_VOL_DOWN: 108,

  // Audio & Onboard Sensors
  SPEAKER_PIN: 25, // Piezo Speaker / DAC1
  DAC1: 25,
  DAC2: 26,
  LED_PIN: 26, // FastLED WS2812B 5x RGB LEDs on GPIO 26
  MIC_PIN: 36, // Analog Microphone AGC (GPIO 36 & GPIO 14)
  LIGHT_PIN: 39, // Light Sensor Photoresistor (SENSOR_VN / ADC1_CH3)
  TEMP_PIN: 26, // Temperature Sensor (GPIO 26, also accessible on 39 via jumper)
  IR_PIN: 15, // Infrared Receiver (GPIO 15)
  IR_TX_PIN: 12, // Infrared Transmitter (GPIO 12)

  // Onboard LEDs
  LED_BUILTIN: 2, // Blue 'stat' LED on GPIO 2
  STATUS_LED: 2,

  // Expansion Bus UART / I2C
  UART2_RX: 16,
  UART2_TX: 17,
  I2C_SDA: 21,
  I2C_SCL: 22,
} as const;

export const EXPANSION_HEADER_PINS: ExpansionPinDef[] = [
  { headerPin: 1, name: 'GND', gpio: null, type: 'GND', capabilities: ['GND'], description: 'Ground Reference' },
  { headerPin: 2, name: '3V3', gpio: null, type: 'POWER_3V3', capabilities: ['3.3V'], description: '3.3V Regulated Rail' },
  { headerPin: 3, name: '5V', gpio: null, type: 'POWER_5V', capabilities: ['5V'], description: '5V USB/Boost Rail' },
  { headerPin: 4, name: 'EN', gpio: null, type: 'SYS', capabilities: ['RESET'], description: 'ESP32 Chip Enable / Reset' },
  { headerPin: 5, name: 'GPIO36', gpio: 36, type: 'GPIO', capabilities: ['ADC1_0', 'MIC_VP'], description: 'Microphone / Analog VP' },
  { headerPin: 6, name: 'GPIO39', gpio: 39, type: 'GPIO', capabilities: ['ADC1_3', 'LDR_VN'], description: 'Light Sensor LDR / VN' },
  { headerPin: 7, name: 'GPIO34', gpio: 34, type: 'GPIO', capabilities: ['ADC1_6', 'BTN_LR'], description: 'D-Pad LEFT(4095) / RIGHT(2000)' },
  { headerPin: 8, name: 'GPIO35', gpio: 35, type: 'GPIO', capabilities: ['ADC1_7', 'BTN_UD'], description: 'D-Pad UP(4095) / DOWN(2000)' },
  { headerPin: 9, name: 'GPIO32', gpio: 32, type: 'GPIO', capabilities: ['ADC1_4', 'BTN_A'], description: 'Tipka A (Action Button A)' },
  { headerPin: 10, name: 'GPIO33', gpio: 33, type: 'GPIO', capabilities: ['ADC1_5', 'BTN_B'], description: 'Tipka B (Action Button B)' },
  { headerPin: 11, name: 'GPIO25', gpio: 25, type: 'GPIO', capabilities: ['DAC1', 'SPEAKER'], description: 'Piezo Speaker / Audio DAC1' },
  { headerPin: 12, name: 'GPIO26', gpio: 26, type: 'GPIO', capabilities: ['DAC2', 'TEMP', 'RGB'], description: 'Temp Sensor / 5x WS2812B RGB' },
  { headerPin: 13, name: 'GPIO27', gpio: 27, type: 'GPIO', capabilities: ['ADC2_7', 'SEL_START'], description: 'SELECT(4095) / START(2000)' },
  { headerPin: 14, name: 'GPIO14', gpio: 14, type: 'GPIO', capabilities: ['MIC_PRE', 'TOUCH_CS'], description: 'Mic Preamp Out / Touch CS' },
  { headerPin: 15, name: 'GPIO12', gpio: 12, type: 'GPIO', capabilities: ['IR_TX', 'HSPI_MISO'], description: 'IR Transmitter LED' },
  { headerPin: 16, name: 'GPIO13', gpio: 13, type: 'GPIO', capabilities: ['MENU', 'RELAY'], description: 'MENU / Volume / Expansion IO' },
  { headerPin: 17, name: 'GPIO15', gpio: 15, type: 'GPIO', capabilities: ['IR_RX', 'HSPI_CS'], description: 'Infrared Receiver (TSOP)' },
  { headerPin: 18, name: 'GPIO2', gpio: 2, type: 'GPIO', capabilities: ['STAT_LED', 'TOUCH_IRQ'], description: 'Onboard Blue STAT LED' },
  { headerPin: 19, name: 'GPIO0', gpio: 0, type: 'GPIO', capabilities: ['BOOT', 'RESTART'], description: 'BOOT / Restart Button' },
  { headerPin: 20, name: 'GPIO4', gpio: 4, type: 'GPIO', capabilities: ['TFT_RST', 'GPIO'], description: 'ILI9341 Display Reset' },
  { headerPin: 21, name: 'GPIO16', gpio: 16, type: 'GPIO', capabilities: ['UART2_RX', 'GPIO'], description: 'Expansion UART2 RX' },
  { headerPin: 22, name: 'GPIO17', gpio: 17, type: 'GPIO', capabilities: ['UART2_TX', 'GPIO'], description: 'Expansion UART2 TX' },
  { headerPin: 23, name: 'GPIO5', gpio: 5, type: 'GPIO', capabilities: ['TFT_CS', 'VSPI_CS0'], description: 'ILI9341 Display CS' },
  { headerPin: 24, name: 'GPIO18', gpio: 18, type: 'GPIO', capabilities: ['VSPI_SCK', 'TFT_SCK'], description: 'VSPI Clock (Display & SD)' },
  { headerPin: 25, name: 'GPIO19', gpio: 19, type: 'GPIO', capabilities: ['VSPI_MISO', 'TFT_MISO'], description: 'VSPI MISO (Display & SD)' },
  { headerPin: 26, name: 'GPIO21', gpio: 21, type: 'GPIO', capabilities: ['I2C_SDA', 'TFT_DC'], description: 'I2C SDA / Display DC' },
  { headerPin: 27, name: 'GPIO22', gpio: 22, type: 'GPIO', capabilities: ['I2C_SCL', 'SD_CS'], description: 'I2C SCL / MicroSD CS' },
  { headerPin: 28, name: 'GPIO23', gpio: 23, type: 'GPIO', capabilities: ['VSPI_MOSI', 'TFT_MOSI'], description: 'VSPI MOSI (Display & SD)' },
  { headerPin: 29, name: 'GND', gpio: null, type: 'GND', capabilities: ['GND'], description: 'Ground Reference' },
  { headerPin: 30, name: '5V_EXT', gpio: null, type: 'POWER_5V', capabilities: ['5V'], description: 'Expansion Bus 5V Rail' },
];

export function createInitialPins(): Record<number, PinState> {
  const pins: Record<number, PinState> = {};

  const activeLowButtonGpios = new Set([0, 13, 27, 32, 33]);
  for (const def of EXPANSION_HEADER_PINS) {
    if (def.gpio !== null) {
      const isPullupBtn = activeLowButtonGpios.has(def.gpio);
      pins[def.gpio] = {
        gpio: def.gpio,
        label: def.name,
        mode: isPullupBtn ? 'INPUT_PULLUP' : 'INPUT',
        digitalValue: isPullupBtn ? 1 : 0,
        analogValue: 0,
        pwmFreq: 0,
        pwmDuty: 0,
        pwmChannel: null,
        isExternalDriven: false,
      };
    }
  }

  // Virtual direct button aliases (101..108)
  const virtualButtons: Array<[number, string]> = [
    [VIDI_X_PINS.BTN_UP, 'BTN_UP'],
    [VIDI_X_PINS.BTN_DOWN, 'BTN_DOWN'],
    [VIDI_X_PINS.BTN_LEFT, 'BTN_LEFT'],
    [VIDI_X_PINS.BTN_RIGHT, 'BTN_RIGHT'],
    [VIDI_X_PINS.BTN_START, 'BTN_START'],
    [VIDI_X_PINS.BTN_SELECT, 'BTN_SELECT'],
    [VIDI_X_PINS.BTN_VOL_UP, 'BTN_VOL_UP'],
    [VIDI_X_PINS.BTN_VOL_DOWN, 'BTN_VOL_DOWN'],
  ];

  for (const [gpio, label] of virtualButtons) {
    pins[gpio] = {
      gpio,
      label,
      mode: 'INPUT_PULLUP',
      digitalValue: 1,
      analogValue: 4095,
      pwmFreq: 0,
      pwmDuty: 0,
      pwmChannel: null,
      isExternalDriven: false,
    };
  }

  return pins;
}

/**
 * Synchronizes physical buttons and onboard sensors with the ESP32 GPIO and ADC table.
 * Matches VidiLAB's official resistor ladder values:
 * - Pressed primary button on ladder = 4095 (satisfies > 4000)
 * - Pressed secondary button on ladder = 2000 (satisfies > 1800 && < 2200)
 */
export function syncHardwareToPins(
  pins: Record<number, PinState>,
  buttons: Record<ButtonId, boolean>,
  sensors: SensorState,
  uptimeMs: number
): void {
  const isStdMapping = sensors.dpadMapping !== 'ALT_34UD_35LR';
  const lrPin = isStdMapping ? 34 : 35;
  const udPin = isStdMapping ? 35 : 34;

  // 1. D-Pad LEFT / RIGHT resistor ladder (GPIO 34 by default)
  if (pins[lrPin] && !pins[lrPin].isExternalDriven) {
    if (buttons.LEFT) {
      pins[lrPin].analogValue = 4095;
      pins[lrPin].digitalValue = 1;
    } else if (buttons.RIGHT) {
      pins[lrPin].analogValue = 2000;
      pins[lrPin].digitalValue = 1;
    } else {
      pins[lrPin].analogValue = 0;
      pins[lrPin].digitalValue = 0;
    }
  }

  // 2. D-Pad UP / DOWN resistor ladder (GPIO 35 by default)
  if (pins[udPin] && !pins[udPin].isExternalDriven) {
    if (buttons.UP) {
      pins[udPin].analogValue = 4095;
      pins[udPin].digitalValue = 1;
    } else if (buttons.DOWN) {
      pins[udPin].analogValue = 2000;
      pins[udPin].digitalValue = 1;
    } else {
      pins[udPin].analogValue = 0;
      pins[udPin].digitalValue = 0;
    }
  }

  // 3. GPIO 27: SELECT / START analog resistor ladder (also digital INPUT_PULLUP)
  if (pins[27] && !pins[27].isExternalDriven && pins[27].mode !== 'OUTPUT') {
    if (buttons.SELECT) {
      pins[27].analogValue = 4095;
      pins[27].digitalValue = 0;
    } else if (buttons.START) {
      pins[27].analogValue = 2000;
      pins[27].digitalValue = 0;
    } else {
      pins[27].analogValue = 0;
      pins[27].digitalValue = 1;
    }
  }

  // 4. GPIO 32: Tipka A (Action Button A, active LOW)
  if (pins[32] && !pins[32].isExternalDriven && pins[32].mode !== 'OUTPUT') {
    pins[32].digitalValue = buttons.A ? 0 : 1;
    pins[32].analogValue = buttons.A ? 4095 : 0;
  }

  // 5. GPIO 33: Tipka B (Action Button B, active LOW)
  if (pins[33] && !pins[33].isExternalDriven && pins[33].mode !== 'OUTPUT') {
    pins[33].digitalValue = buttons.B ? 0 : 1;
    pins[33].analogValue = buttons.B ? 4095 : 0;
  }

  // 6. GPIO 13: MENU / Volume button (active LOW)
  if (pins[13] && !pins[13].isExternalDriven && pins[13].mode !== 'OUTPUT') {
    if (buttons.MENU) {
      pins[13].analogValue = 4095;
      pins[13].digitalValue = 0;
    } else if (buttons.VOL_UP) {
      pins[13].analogValue = 2800;
      pins[13].digitalValue = 0;
    } else if (buttons.VOL_DOWN) {
      pins[13].analogValue = 1400;
      pins[13].digitalValue = 0;
    } else {
      pins[13].analogValue = 0;
      pins[13].digitalValue = 1;
    }
  }

  // 7. GPIO 0: BOOT / Restart Button (active LOW with pullup)
  if (pins[0] && !pins[0].isExternalDriven && pins[0].mode !== 'OUTPUT') {
    pins[0].digitalValue = buttons.BOOT ? 0 : 1;
    pins[0].analogValue = buttons.BOOT ? 0 : 4095;
  }

  // 8. Virtual direct button pins (101..108, active LOW)
  const mapDirect = (pin: number, pressed: boolean) => {
    if (!pins[pin]) return;
    pins[pin].digitalValue = pressed ? 0 : 1;
    pins[pin].analogValue = pressed ? 4095 : 0;
  };
  mapDirect(VIDI_X_PINS.BTN_UP, buttons.UP);
  mapDirect(VIDI_X_PINS.BTN_DOWN, buttons.DOWN);
  mapDirect(VIDI_X_PINS.BTN_LEFT, buttons.LEFT);
  mapDirect(VIDI_X_PINS.BTN_RIGHT, buttons.RIGHT);
  mapDirect(VIDI_X_PINS.BTN_START, buttons.START);
  mapDirect(VIDI_X_PINS.BTN_SELECT, buttons.SELECT);
  mapDirect(VIDI_X_PINS.BTN_VOL_UP, buttons.VOL_UP);
  mapDirect(VIDI_X_PINS.BTN_VOL_DOWN, buttons.VOL_DOWN);

  // 9. Microphone Preamp (drives both GPIO 36 and GPIO 14 when not externally driven)
  const amp = (sensors.micLevel / 100) * 1950;
  const phase = (uptimeMs / 1000) * Math.PI * 2 * sensors.micFrequency;
  const harmonic = Math.sin(phase) * 0.75 + Math.sin(phase * 2.5) * 0.25;
  const micAdc = Math.max(0, Math.min(4095, Math.round(2048 + harmonic * amp)));

  if (pins[36] && !pins[36].isExternalDriven) {
    pins[36].analogValue = micAdc;
    pins[36].digitalValue = micAdc > 2400 ? 1 : 0;
  }
  if (pins[14] && !pins[14].isExternalDriven && pins[14].mode !== 'OUTPUT') {
    pins[14].analogValue = micAdc;
    pins[14].digitalValue = micAdc > 2400 ? 1 : 0;
  }

  // 10. MCP9700A Temperature Sensor ADC Calculation on GPIO 26:
  // Vout = 500mV + 10mV/C. On 3.3V 12-bit ADC: ADC = ((500 + tempC * 10) / 3300) * 4095
  const tempMv = 500 + sensors.temperatureC * 10;
  const tempAdc = Math.max(0, Math.min(4095, Math.round((tempMv / 3300) * 4095)));

  // Light sensor ADC Calculation (0..100% -> 0..4095)
  const lightAdc = Math.max(0, Math.min(4095, Math.round((sensors.lightLevel / 100) * 4095)));

  if (pins[26] && !pins[26].isExternalDriven && pins[26].mode !== 'OUTPUT') {
    pins[26].analogValue = tempAdc;
  }

  if (pins[39] && !pins[39].isExternalDriven) {
    pins[39].analogValue = sensors.tempLightJumper === 'TEMP' ? tempAdc : lightAdc;
    pins[39].digitalValue = pins[39].analogValue > 2048 ? 1 : 0;
  }
}
