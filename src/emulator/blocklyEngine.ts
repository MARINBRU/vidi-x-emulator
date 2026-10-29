/**
 * VIDI X Visual Block Coding Engine
 * Represents hierarchical hardware blocks (setup, loop, conditionals, loops, display,
 * buttons, sensors, RGB LEDs, speaker audio, wireless ESP-NOW) and compiles them
 * into clean, idiomatic VIDI X Arduino C++ (.ino) code.
 */

export type BlockCategory =
  | 'display'
  | 'controls'
  | 'leds'
  | 'audio'
  | 'sensors'
  | 'logic'
  | 'variables'
  | 'comms';

export type BlockType =
  // Display (ILI9341)
  | 'tft_clear'
  | 'tft_text'
  | 'tft_var'
  | 'tft_rect'
  | 'tft_circle'
  | 'tft_line'
  | 'tft_pixel'
  // Controls (Buttons & Touch)
  | 'if_button_pressed'
  | 'if_touch_pressed'
  | 'draw_at_touch'
  // LEDs (WS2812B FastLED & Status LED)
  | 'rgb_set_led'
  | 'rgb_clear'
  | 'status_led_set'
  // Audio (Piezo Speaker GPIO 25)
  | 'speaker_tone'
  | 'speaker_note'
  | 'speaker_notone'
  // Sensors (Temp, Light, Mic, VIDIIC MPU-6050 Gyroscope)
  | 'tft_sensor_readout'
  | 'if_sensor_threshold'
  | 'read_gyro_axis'
  // Variables & Math
  | 'var_set'
  | 'var_change'
  | 'var_constrain_screen'
  // Logic & Timing
  | 'if_var_compare'
  | 'repeat_times'
  | 'delay_ms'
  // Comms (Serial & ESP-NOW)
  | 'serial_println'
  | 'espnow_broadcast'
  | 'if_espnow_received'
  // 3D Raycast Maze Engine + Minimap & Coins
  | 'maze3d_init'
  | 'maze3d_step_controls'
  | 'maze3d_render_scene'
  | 'maze3d_draw_minimap'
  // 3D First-Person Shooter (Singleplayer & Multiplayer ESP-NOW)
  | 'fps3d_init'
  | 'fps3d_singleplayer_step'
  | 'fps3d_multiplayer_step';

export interface BlockNode {
  id: string;
  type: BlockType;
  params: Record<string, string | number>;
  children?: BlockNode[]; // For container blocks (if_button_pressed, if_touch_pressed, repeat_times, etc.)
}

export interface BlockProgram {
  name: string;
  variables: string[];
  setupBlocks: BlockNode[];
  loopBlocks: BlockNode[];
}

export interface BlockPaletteItem {
  type: BlockType;
  category: BlockCategory;
  label: string;
  description: string;
  isContainer?: boolean;
  defaultParams: Record<string, string | number>;
}

export const BLOCK_COLORS: Record<BlockCategory, { bg: string; border: string; badge: string; text: string }> = {
  display: {
    bg: 'bg-sky-950/80',
    border: 'border-sky-500/60',
    badge: 'bg-sky-500 text-black',
    text: 'text-sky-200',
  },
  controls: {
    bg: 'bg-amber-950/80',
    border: 'border-amber-500/60',
    badge: 'bg-amber-400 text-black',
    text: 'text-amber-200',
  },
  leds: {
    bg: 'bg-fuchsia-950/80',
    border: 'border-fuchsia-500/60',
    badge: 'bg-fuchsia-400 text-black',
    text: 'text-fuchsia-200',
  },
  audio: {
    bg: 'bg-purple-950/80',
    border: 'border-purple-500/60',
    badge: 'bg-purple-400 text-black',
    text: 'text-purple-200',
  },
  sensors: {
    bg: 'bg-emerald-950/80',
    border: 'border-emerald-500/60',
    badge: 'bg-emerald-400 text-black',
    text: 'text-emerald-200',
  },
  variables: {
    bg: 'bg-orange-950/80',
    border: 'border-orange-500/60',
    badge: 'bg-orange-400 text-black',
    text: 'text-orange-200',
  },
  logic: {
    bg: 'bg-cyan-950/80',
    border: 'border-cyan-500/60',
    badge: 'bg-cyan-400 text-black',
    text: 'text-cyan-200',
  },
  comms: {
    bg: 'bg-rose-950/80',
    border: 'border-rose-500/60',
    badge: 'bg-rose-400 text-black',
    text: 'text-rose-200',
  },
};

export const BLOCK_PALETTE: BlockPaletteItem[] = [
  // DISPLAY
  {
    type: 'tft_clear',
    category: 'display',
    label: 'Clear Screen',
    description: 'Fills the 320x240 ILI9341 screen with a solid color',
    defaultParams: { color: 'ILI9341_BLACK' },
  },
  {
    type: 'tft_text',
    category: 'display',
    label: 'Draw Text String',
    description: 'Prints text at (X, Y) with size and color',
    defaultParams: { text: 'HELLO VIDI X', x: 20, y: 20, size: 2, color: 'ILI9341_CYAN' },
  },
  {
    type: 'tft_var',
    category: 'display',
    label: 'Draw Variable Value',
    description: 'Prints a labeled variable value at (X, Y)',
    defaultParams: { prefix: 'SCORE: ', varName: 'score', x: 16, y: 12, size: 1, color: 'ILI9341_YELLOW' },
  },
  {
    type: 'tft_rect',
    category: 'display',
    label: 'Draw Rectangle',
    description: 'Draws a filled or outlined rectangle on screen',
    defaultParams: { x: 'x', y: 'y', w: 24, h: 24, color: 'ILI9341_CYAN', filled: 'true' },
  },
  {
    type: 'tft_circle',
    category: 'display',
    label: 'Draw Circle',
    description: 'Draws a filled circle at (X, Y) with radius R',
    defaultParams: { x: 'x', y: 'y', r: 10, color: 'ILI9341_YELLOW' },
  },
  {
    type: 'tft_line',
    category: 'display',
    label: 'Draw Line',
    description: 'Draws a line between (X1, Y1) and (X2, Y2)',
    defaultParams: { x1: 0, y1: 28, x2: 320, y2: 28, color: 'ILI9341_BLUE' },
  },
  {
    type: 'maze3d_init',
    category: 'display',
    label: '3D Maze: Init Map & 5 Gold Coins',
    description: 'Initializes the 10x10 3D Raycast Maze, player position, and 5 collectible gold coins',
    defaultParams: { startX: 1.5, startY: 1.5 },
  },
  {
    type: 'maze3d_render_scene',
    category: 'display',
    label: '3D Maze: Render Raycast View + 3D Coins',
    description: 'Renders 80-column 3D perspective walls and depth-sorted spinning gold coins',
    defaultParams: { ceilingColor: '0x0843', floorColor: '0x18E3' },
  },
  {
    type: 'maze3d_draw_minimap',
    category: 'display',
    label: '3D Maze: Draw 2D Minimap & Coin HUD',
    description: 'Draws top-right 2D maze radar with live coin dots, player FOV vector, and coin score HUD',
    defaultParams: { mapX: 232, mapY: 8, cellSize: 8 },
  },
  {
    type: 'fps3d_init',
    category: 'display',
    label: '3D FPS: Init Arena, Drones & Gun',
    description: 'Initializes the 3D FPS arena, plasma blaster ammo, and cyber-drone targets',
    defaultParams: { ammo: 24, hp: 100 },
  },
  {
    type: 'fps3d_singleplayer_step',
    category: 'display',
    label: '3D FPS: Singleplayer Frame (Bots + Gun + Minimap)',
    description: 'Runs full 3D Singleplayer FPS loop: D-Pad aim/move, Tipka A plasma shot, 4 AI drones, and radar minimap',
    defaultParams: { moveSpeed: 0.09, turnSpeed: 0.08 },
  },
  {
    type: 'fps3d_multiplayer_step',
    category: 'comms',
    label: '3D FPS: Multiplayer ESP-NOW Frame (2-Board PvP)',
    description: 'Synchronizes 2+ VIDI X boards via ESP-NOW and renders opponent player in 3D perspective + minimap',
    defaultParams: { moveSpeed: 0.09, turnSpeed: 0.08 },
  },

  // CONTROLS & INPUTS
  {
    type: 'maze3d_step_controls',
    category: 'controls',
    label: '3D Maze: D-Pad Move, Turn & Coin Pickup',
    description: 'Moves/rotates 3D camera with D-Pad, checks wall collisions, and collects nearby gold coins',
    defaultParams: { moveSpeed: 0.085, turnSpeed: 0.075 },
  },
  {
    type: 'if_button_pressed',
    category: 'controls',
    label: 'If Button Pressed',
    description: 'Runs inner blocks when a VIDI X button (D-Pad, A, B, Start, Select) is held',
    isContainer: true,
    defaultParams: { button: 'LEFT' },
  },
  {
    type: 'if_touch_pressed',
    category: 'controls',
    label: 'If Screen Touched (X, Y Coords)',
    description:
      'Runs inner blocks when screen is touched inside (xMin..xMax, yMin..yMax) and sets touchX, touchY coordinates',
    isContainer: true,
    defaultParams: {
      xMin: 0,
      xMax: 320,
      yMin: 0,
      yMax: 240,
      xVar: 'touchX',
      yVar: 'touchY',
    },
  },
  {
    type: 'draw_at_touch',
    category: 'controls',
    label: 'Paint Brush at Touch Point',
    description: 'Draws a circle at the current stylus touch X, Y coordinate',
    defaultParams: { radius: 4, color: 'ILI9341_MAGENTA' },
  },

  // VARIABLES
  {
    type: 'var_set',
    category: 'variables',
    label: 'Set Variable',
    description: 'Sets a variable to a number or expression',
    defaultParams: { varName: 'x', value: 160 },
  },
  {
    type: 'var_change',
    category: 'variables',
    label: 'Change Variable By',
    description: 'Adds or subtracts delta from a variable',
    defaultParams: { varName: 'x', delta: 6 },
  },
  {
    type: 'var_constrain_screen',
    category: 'variables',
    label: 'Keep X/Y Inside Screen',
    description: 'Clamps variables x and y inside the 320x240 display bounds',
    defaultParams: { xVar: 'x', yVar: 'y', minY: 32 },
  },

  // LEDS
  {
    type: 'rgb_set_led',
    category: 'leds',
    label: 'Set WS2812B RGB LED',
    description: 'Sets one or all 5 onboard addressable RGB LEDs (GPIO 26)',
    defaultParams: { index: '0', color: 'CRGB::Cyan' },
  },
  {
    type: 'rgb_clear',
    category: 'leds',
    label: 'Turn Off All RGB LEDs',
    description: 'Clears all 5 WS2812B RGB LEDs',
    defaultParams: {},
  },
  {
    type: 'status_led_set',
    category: 'leds',
    label: 'Set Blue STAT LED (IO2)',
    description: 'Turns the onboard blue Status LED ON or OFF',
    defaultParams: { state: 'HIGH' },
  },

  // AUDIO
  {
    type: 'speaker_tone',
    category: 'audio',
    label: 'Play Frequency Tone',
    description: 'Plays a tone in Hz on the GPIO 25 piezo buzzer',
    defaultParams: { freq: 660, duration: 50 },
  },
  {
    type: 'speaker_note',
    category: 'audio',
    label: 'Play Musical Note',
    description: 'Plays a musical note on the piezo buzzer',
    defaultParams: { noteFreq: '523', duration: 120 },
  },
  {
    type: 'speaker_notone',
    category: 'audio',
    label: 'Silence Speaker',
    description: 'Stops any active tone on GPIO 25',
    defaultParams: {},
  },

  // SENSORS
  {
    type: 'tft_sensor_readout',
    category: 'sensors',
    label: 'Draw Sensor Telemetry',
    description: 'Reads Temp (°C), Light (%), Mic (ADC), or Gyro Roll/Pitch (°) and prints it on screen',
    defaultParams: { sensor: 'TEMP', x: 16, y: 200, color: 'ILI9341_ORANGE' },
  },
  {
    type: 'if_sensor_threshold',
    category: 'sensors',
    label: 'If Sensor Reading Compares',
    description: 'Runs inner blocks when Temp, Light, Mic, or Gyro Roll/Pitch crosses a threshold',
    isContainer: true,
    defaultParams: { sensor: 'LIGHT', op: '<', threshold: 30 },
  },
  {
    type: 'read_gyro_axis',
    category: 'sensors',
    label: 'Read Gyroscope Tilt (MPU-6050)',
    description: 'Reads Roll (-90..90°), Pitch (-90..90°), or Yaw (-180..180°) from VIDIIC I2C Gyro into a variable',
    defaultParams: { axis: 'ROLL', varName: 'x' },
  },

  // LOGIC & TIMING
  {
    type: 'if_var_compare',
    category: 'logic',
    label: 'If Variable Compares',
    description: 'Conditional branch comparing a variable to a value',
    isContainer: true,
    defaultParams: { varName: 'score', op: '>=', value: 10 },
  },
  {
    type: 'repeat_times',
    category: 'logic',
    label: 'Repeat N Times',
    description: 'Repeats the nested blocks N times',
    isContainer: true,
    defaultParams: { count: 4 },
  },
  {
    type: 'delay_ms',
    category: 'logic',
    label: 'Wait / Delay (ms)',
    description: 'Pauses execution for N milliseconds',
    defaultParams: { ms: 20 },
  },

  // COMMS
  {
    type: 'serial_println',
    category: 'comms',
    label: 'Serial Print Line',
    description: 'Sends a line of text to the USB-C UART0 Serial Monitor',
    defaultParams: { text: 'VIDI X Block Tick' },
  },
  {
    type: 'espnow_broadcast',
    category: 'comms',
    label: 'Broadcast ESP-NOW Packet',
    description: 'Sends a wireless packet to all other VIDI X units',
    defaultParams: { payload: 'PING_FROM_BLOCKS' },
  },
  {
    type: 'if_espnow_received',
    category: 'comms',
    label: 'When ESP-NOW Packet Received',
    description: 'Runs inner blocks when a wireless packet arrives from another board',
    isContainer: true,
    defaultParams: {},
  },
];

function uid(): string {
  return `blk-${Math.random().toString(36).slice(2, 9)}`;
}

export const BLOCK_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  program: BlockProgram;
}> = [
  {
    id: 'tpl-dpad-explorer',
    name: '01 // Interactive D-Pad Hero & Touch Painter',
    description: 'Steer a glowing player orb with the D-Pad, fire laser tones with Tipka A, clear with Tipka B, or paint with the touchscreen!',
    program: {
      name: 'Block_DPad_Explorer',
      variables: ['x', 'y', 'prevX', 'prevY', 'score'],
      setupBlocks: [
        { id: uid(), type: 'tft_clear', params: { color: 'ILI9341_BLACK' } },
        {
          id: uid(),
          type: 'tft_rect',
          params: { x: 0, y: 0, w: 320, h: 24, color: 'ILI9341_NAVY', filled: 'true' },
        },
        {
          id: uid(),
          type: 'tft_text',
          params: { text: 'VIDI X BLOCK STUDIO // D-PAD & TOUCH', x: 8, y: 8, size: 1, color: 'ILI9341_CYAN' },
        },
        { id: uid(), type: 'var_set', params: { varName: 'x', value: 160 } },
        { id: uid(), type: 'var_set', params: { varName: 'y', value: 120 } },
        { id: uid(), type: 'var_set', params: { varName: 'prevX', value: 160 } },
        { id: uid(), type: 'var_set', params: { varName: 'prevY', value: 120 } },
        { id: uid(), type: 'var_set', params: { varName: 'score', value: 0 } },
        { id: uid(), type: 'speaker_note', params: { noteFreq: '659', duration: 90 } },
      ],
      loopBlocks: [
        // Erase previous player circle
        { id: uid(), type: 'tft_circle', params: { x: 'prevX', y: 'prevY', r: 9, color: 'ILI9341_BLACK' } },
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'LEFT' },
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'x', delta: -6 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '0', color: 'CRGB::Cyan' } },
          ],
        },
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'RIGHT' },
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'x', delta: 6 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '1', color: 'CRGB::Blue' } },
          ],
        },
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'UP' },
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'y', delta: -6 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '2', color: 'CRGB::Yellow' } },
          ],
        },
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'DOWN' },
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'y', delta: 6 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '3', color: 'CRGB::Orange' } },
          ],
        },
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'A' },
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'score', delta: 10 } },
            { id: uid(), type: 'speaker_tone', params: { freq: 880, duration: 40 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '4', color: 'CRGB::Red' } },
            { id: uid(), type: 'status_led_set', params: { state: 'HIGH' } },
          ],
        },
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'B' },
          children: [
            { id: uid(), type: 'tft_rect', params: { x: 0, y: 25, w: 320, h: 190, color: 'ILI9341_BLACK', filled: 'true' } },
            { id: uid(), type: 'rgb_clear', params: {} },
            { id: uid(), type: 'status_led_set', params: { state: 'LOW' } },
          ],
        },
        { id: uid(), type: 'var_constrain_screen', params: { xVar: 'x', yVar: 'y', minY: 36 } },
        { id: uid(), type: 'tft_circle', params: { x: 'x', y: 'y', r: 9, color: 'ILI9341_YELLOW' } },
        { id: uid(), type: 'draw_at_touch', params: { radius: 4, color: 'ILI9341_MAGENTA' } },
        {
          id: uid(),
          type: 'tft_var',
          params: { prefix: 'SCORE: ', varName: 'score', x: 230, y: 8, size: 1, color: 'ILI9341_YELLOW' },
        },
        {
          id: uid(),
          type: 'tft_sensor_readout',
          params: { sensor: 'TEMP', x: 8, y: 224, color: 'ILI9341_ORANGE' },
        },
        {
          id: uid(),
          type: 'tft_sensor_readout',
          params: { sensor: 'LIGHT', x: 170, y: 224, color: 'ILI9341_GREEN' },
        },
        { id: uid(), type: 'var_set', params: { varName: 'prevX', value: 'x' } },
        { id: uid(), type: 'var_set', params: { varName: 'prevY', value: 'y' } },
      ],
    },
  },
  {
    id: 'tpl-smart-thermostat',
    name: '02 // Smart Environmental Monitor & RGB Alarm',
    description: 'Monitors onboard Temperature (GPIO 26) and Light (GPIO 39) sensors and triggers visual/audio alerts when thresholds are crossed.',
    program: {
      name: 'Block_Smart_Sensor_Alarm',
      variables: ['alerts'],
      setupBlocks: [
        { id: uid(), type: 'tft_clear', params: { color: 'ILI9341_BLACK' } },
        {
          id: uid(),
          type: 'tft_rect',
          params: { x: 0, y: 0, w: 320, h: 26, color: 'ILI9341_DARKGREEN', filled: 'true' },
        },
        {
          id: uid(),
          type: 'tft_text',
          params: { text: 'SMART SENSOR WATCHDOG (BLOCKS)', x: 10, y: 9, size: 1, color: 'ILI9341_WHITE' },
        },
      ],
      loopBlocks: [
        {
          id: uid(),
          type: 'tft_sensor_readout',
          params: { sensor: 'TEMP', x: 20, y: 60, color: 'ILI9341_ORANGE' },
        },
        {
          id: uid(),
          type: 'tft_sensor_readout',
          params: { sensor: 'LIGHT', x: 20, y: 95, color: 'ILI9341_YELLOW' },
        },
        {
          id: uid(),
          type: 'tft_sensor_readout',
          params: { sensor: 'MIC', x: 20, y: 130, color: 'ILI9341_CYAN' },
        },
        {
          id: uid(),
          type: 'if_sensor_threshold',
          params: { sensor: 'TEMP', op: '>', threshold: 32 },
          children: [
            {
              id: uid(),
              type: 'tft_text',
              params: { text: 'HIGH TEMP ALERT!   ', x: 20, y: 175, size: 2, color: 'ILI9341_RED' },
            },
            { id: uid(), type: 'rgb_set_led', params: { index: 'ALL', color: 'CRGB::Red' } },
            { id: uid(), type: 'speaker_tone', params: { freq: 960, duration: 40 } },
          ],
        },
        {
          id: uid(),
          type: 'if_sensor_threshold',
          params: { sensor: 'TEMP', op: '<=', threshold: 32 },
          children: [
            {
              id: uid(),
              type: 'tft_text',
              params: { text: 'SYSTEM NOMINAL     ', x: 20, y: 175, size: 2, color: 'ILI9341_GREEN' },
            },
            { id: uid(), type: 'rgb_set_led', params: { index: 'ALL', color: 'CRGB::Green' } },
          ],
        },
        { id: uid(), type: 'delay_ms', params: { ms: 60 } },
      ],
    },
  },
  {
    id: 'tpl-wireless-beacon',
    name: '03 // Multi-Board Wireless ESP-NOW Messenger',
    description: 'Press Tipka A to broadcast an ESP-NOW packet to all other VIDI X boards, and light up + chime when a packet arrives!',
    program: {
      name: 'Block_Wireless_Beacon',
      variables: ['txCount', 'rxCount'],
      setupBlocks: [
        { id: uid(), type: 'tft_clear', params: { color: 'ILI9341_BLACK' } },
        {
          id: uid(),
          type: 'tft_rect',
          params: { x: 0, y: 0, w: 320, h: 26, color: 'ILI9341_PURPLE', filled: 'true' },
        },
        {
          id: uid(),
          type: 'tft_text',
          params: { text: 'ESP-NOW BLOCK MESSENGER // [A]=SEND', x: 8, y: 9, size: 1, color: 'ILI9341_WHITE' },
        },
      ],
      loopBlocks: [
        {
          id: uid(),
          type: 'if_button_pressed',
          params: { button: 'A' },
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'txCount', delta: 1 } },
            { id: uid(), type: 'espnow_broadcast', params: { payload: 'HELLO_FROM_VIDI_X' } },
            { id: uid(), type: 'speaker_tone', params: { freq: 880, duration: 50 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '0', color: 'CRGB::Cyan' } },
            { id: uid(), type: 'delay_ms', params: { ms: 150 } },
          ],
        },
        {
          id: uid(),
          type: 'if_espnow_received',
          params: {},
          children: [
            { id: uid(), type: 'var_change', params: { varName: 'rxCount', delta: 1 } },
            { id: uid(), type: 'speaker_tone', params: { freq: 1174, duration: 60 } },
            { id: uid(), type: 'rgb_set_led', params: { index: '4', color: 'CRGB::Magenta' } },
          ],
        },
        {
          id: uid(),
          type: 'tft_var',
          params: { prefix: 'PACKETS SENT (PRESS A): ', varName: 'txCount', x: 16, y: 70, size: 1, color: 'ILI9341_CYAN' },
        },
        {
          id: uid(),
          type: 'tft_var',
          params: { prefix: 'PACKETS RECEIVED      : ', varName: 'rxCount', x: 16, y: 105, size: 1, color: 'ILI9341_YELLOW' },
        },
      ],
    },
  },
  {
    id: 'tpl-3d-maze-minimap-coins',
    name: '04 // 3D Raycast Maze Explorer + Minimap & Coins',
    description: 'First-person 3D raycasted maze with depth-shaded walls, 5 spinning 3D gold coins, live top-right 2D minimap with FOV ray, and FastLED coin progress bar!',
    program: {
      name: 'Block_3D_Maze_Minimap_Coins',
      variables: ['coins'],
      setupBlocks: [
        { id: uid(), type: 'maze3d_init', params: { startX: 1.5, startY: 1.5 } },
        { id: uid(), type: 'serial_println', params: { text: '[3D MAZE] Collect all 5 Gold Coins!' } },
      ],
      loopBlocks: [
        { id: uid(), type: 'maze3d_step_controls', params: { moveSpeed: 0.085, turnSpeed: 0.075 } },
        { id: uid(), type: 'maze3d_render_scene', params: { ceilingColor: '0x0843', floorColor: '0x18E3' } },
        { id: uid(), type: 'maze3d_draw_minimap', params: { mapX: 232, mapY: 8, cellSize: 8 } },
      ],
    },
  },
  {
    id: 'tpl-3d-fps-singleplayer',
    name: '05 // 3D Singleplayer FPS Arena (Bots + Minimap)',
    description: 'First-person 3D shooter with 4 autonomous cyber-drones, plasma rifle viewmodel with recoil & muzzle flash, hitscan targeting, and radar minimap.',
    program: {
      name: 'Block_3D_FPS_Singleplayer',
      variables: ['score'],
      setupBlocks: [
        { id: uid(), type: 'fps3d_init', params: { ammo: 24, hp: 100 } },
        { id: uid(), type: 'serial_println', params: { text: '[3D FPS] Singleplayer Arena Ready! [Tipka A] = Shoot' } },
      ],
      loopBlocks: [
        { id: uid(), type: 'fps3d_singleplayer_step', params: { moveSpeed: 0.09, turnSpeed: 0.08 } },
      ],
    },
  },
  {
    id: 'tpl-3d-fps-multiplayer',
    name: '06 // 3D Multiplayer FPS Deathmatch (ESP-NOW 2-Board)',
    description: '2-Board wireless ESP-NOW 3D First-Person Shooter! Spawn 2 VIDI X units to hunt each other in 3D perspective with live radar minimap.',
    program: {
      name: 'Block_3D_FPS_Multiplayer',
      variables: ['frags'],
      setupBlocks: [
        { id: uid(), type: 'fps3d_init', params: { ammo: 30, hp: 100 } },
        { id: uid(), type: 'serial_println', params: { text: '[ESP-NOW 3D FPS] Multiplayer Arena Ready!' } },
      ],
      loopBlocks: [
        { id: uid(), type: 'fps3d_multiplayer_step', params: { moveSpeed: 0.09, turnSpeed: 0.08 } },
      ],
    },
  },
];

function compileBlockNode(block: BlockNode, indent = '  '): string {
  const p = block.params;
  const childrenCode = (block.children || [])
    .map((c) => compileBlockNode(c, indent + '  '))
    .join('\n');

  switch (block.type) {
    case 'tft_clear':
      return `${indent}tft.fillScreen(${p.color || 'ILI9341_BLACK'});`;

    case 'tft_text':
      return [
        `${indent}tft.setCursor(${p.x ?? 10}, ${p.y ?? 10});`,
        `${indent}tft.setTextSize(${p.size ?? 1});`,
        `${indent}tft.setTextColor(${p.color || 'ILI9341_WHITE'}, ILI9341_BLACK);`,
        `${indent}tft.print("${String(p.text ?? '').replace(/"/g, '\\"')}");`,
      ].join('\n');

    case 'tft_var':
      return [
        `${indent}tft.setCursor(${p.x ?? 10}, ${p.y ?? 10});`,
        `${indent}tft.setTextSize(${p.size ?? 1});`,
        `${indent}tft.setTextColor(${p.color || 'ILI9341_YELLOW'}, ILI9341_BLACK);`,
        `${indent}tft.printf("${String(p.prefix ?? '')}%4d  ", ${p.varName || 'score'});`,
      ].join('\n');

    case 'tft_rect': {
      const fn = String(p.filled) === 'false' ? 'drawRect' : 'fillRect';
      return `${indent}tft.${fn}(${p.x ?? 0}, ${p.y ?? 0}, ${p.w ?? 20}, ${p.h ?? 20}, ${p.color || 'ILI9341_CYAN'});`;
    }

    case 'tft_circle':
      return `${indent}tft.fillCircle(${p.x ?? 160}, ${p.y ?? 120}, ${p.r ?? 8}, ${p.color || 'ILI9341_YELLOW'});`;

    case 'tft_line':
      return `${indent}tft.drawLine(${p.x1 ?? 0}, ${p.y1 ?? 0}, ${p.x2 ?? 100}, ${p.y2 ?? 100}, ${p.color || 'ILI9341_WHITE'});`;

    case 'tft_pixel':
      return `${indent}tft.drawPixel(${p.x ?? 160}, ${p.y ?? 120}, ${p.color || 'ILI9341_WHITE'});`;

    case 'if_button_pressed': {
      const btn = String(p.button || 'A');
      let cond = 'digitalRead(BTN_A) == LOW';
      if (btn === 'LEFT') cond = '(analogRead(BTN_LR) > 3800 || digitalRead(BTN_LEFT) == LOW)';
      else if (btn === 'RIGHT')
        cond = '((analogRead(BTN_LR) > 1500 && analogRead(BTN_LR) < 2600) || digitalRead(BTN_RIGHT) == LOW)';
      else if (btn === 'UP') cond = '(analogRead(BTN_UD) > 3800 || digitalRead(BTN_UP) == LOW)';
      else if (btn === 'DOWN')
        cond = '((analogRead(BTN_UD) > 1500 && analogRead(BTN_UD) < 2600) || digitalRead(BTN_DOWN) == LOW)';
      else if (btn === 'A') cond = 'digitalRead(BTN_A) == LOW';
      else if (btn === 'B') cond = 'digitalRead(BTN_B) == LOW';
      else if (btn === 'SELECT') cond = '(analogRead(BTN_SELECT_START) > 3800 || digitalRead(BTN_SELECT) == LOW)';
      else if (btn === 'START')
        cond = '((analogRead(BTN_SELECT_START) > 1500 && analogRead(BTN_SELECT_START) < 2600) || digitalRead(BTN_START) == LOW)';
      else if (btn === 'MENU') cond = 'analogRead(BTN_MENU) > 3000';

      return `${indent}if (${cond}) {\n${childrenCode || `${indent}  // do nothing`}\n${indent}}`;
    }

    case 'if_touch_pressed': {
      const xMin = p.xMin ?? 0;
      const xMax = p.xMax ?? 320;
      const yMin = p.yMin ?? 0;
      const yMax = p.yMax ?? 240;
      const xVar = String(p.xVar || 'touchX').trim();
      const yVar = String(p.yVar || 'touchY').trim();
      const customXAssign =
        xVar && xVar !== 'touchX' ? `\n${indent}    ${xVar} = touchX;` : '';
      const customYAssign =
        yVar && yVar !== 'touchY' ? `\n${indent}    ${yVar} = touchY;` : '';
      return [
        `${indent}if (ts.touched()) {`,
        `${indent}  TS_Point _pt = ts.getPoint();`,
        `${indent}  touchX = _pt.x;`,
        `${indent}  touchY = _pt.y;`,
        `${indent}  if (touchX >= ${xMin} && touchX <= ${xMax} && touchY >= ${yMin} && touchY <= ${yMax}) {${customXAssign}${customYAssign}`,
        childrenCode || `${indent}    // touched at (touchX, touchY)`,
        `${indent}  }`,
        `${indent}}`,
      ].join('\n');
    }

    case 'draw_at_touch':
      return [
        `${indent}if (ts.touched()) {`,
        `${indent}  TS_Point pt = ts.getPoint();`,
        `${indent}  touchX = pt.x;`,
        `${indent}  touchY = pt.y;`,
        `${indent}  tft.fillCircle(pt.x, pt.y, ${p.radius ?? 4}, ${p.color || 'ILI9341_MAGENTA'});`,
        `${indent}}`,
      ].join('\n');

    case 'rgb_set_led':
      if (String(p.index) === 'ALL') {
        return [
          `${indent}for (int _i = 0; _i < 5; _i++) { leds[_i] = ${p.color || 'CRGB::Cyan'}; }`,
          `${indent}FastLED.show();`,
        ].join('\n');
      }
      return [
        `${indent}leds[${p.index ?? 0}] = ${p.color || 'CRGB::Cyan'};`,
        `${indent}FastLED.show();`,
      ].join('\n');

    case 'rgb_clear':
      return `${indent}FastLED.clear();`;

    case 'status_led_set':
      return `${indent}digitalWrite(LED_BUILTIN, ${p.state || 'HIGH'});`;

    case 'speaker_tone':
      return `${indent}tone(SPEAKER_PIN, ${p.freq ?? 660}, ${p.duration ?? 50});`;

    case 'speaker_note':
      return `${indent}tone(SPEAKER_PIN, ${p.noteFreq ?? 523}, ${p.duration ?? 120});`;

    case 'speaker_notone':
      return `${indent}noTone(SPEAKER_PIN);`;

    case 'tft_sensor_readout': {
      const sensor = String(p.sensor || 'TEMP');
      if (sensor === 'TEMP') {
        return [
          `${indent}tft.setCursor(${p.x ?? 10}, ${p.y ?? 200});`,
          `${indent}tft.setTextSize(1);`,
          `${indent}tft.setTextColor(${p.color || 'ILI9341_ORANGE'}, ILI9341_BLACK);`,
          `${indent}tft.printf("TEMP: %4.1f C  ", (((analogRead(TEMP_PIN) / 4095.0) * 3300.0) - 500.0) / 10.0);`,
        ].join('\n');
      }
      if (sensor === 'LIGHT') {
        return [
          `${indent}tft.setCursor(${p.x ?? 10}, ${p.y ?? 200});`,
          `${indent}tft.setTextSize(1);`,
          `${indent}tft.setTextColor(${p.color || 'ILI9341_YELLOW'}, ILI9341_BLACK);`,
          `${indent}tft.printf("LIGHT: %3d %%  ", map(analogRead(LIGHT_PIN), 0, 4095, 0, 100));`,
        ].join('\n');
      }
      if (sensor === 'GYRO_ROLL' || sensor === 'GYRO_PITCH' || sensor === 'GYRO_YAW') {
        const method =
          sensor === 'GYRO_ROLL'
            ? 'mpu.getRoll()'
            : sensor === 'GYRO_PITCH'
            ? 'mpu.getPitch()'
            : 'mpu.getYaw()';
        const labelStr =
          sensor === 'GYRO_ROLL'
            ? 'ROLL'
            : sensor === 'GYRO_PITCH'
            ? 'PITCH'
            : 'YAW';
        return [
          `${indent}tft.setCursor(${p.x ?? 10}, ${p.y ?? 200});`,
          `${indent}tft.setTextSize(1);`,
          `${indent}tft.setTextColor(${p.color || 'ILI9341_CYAN'}, ILI9341_BLACK);`,
          `${indent}tft.printf("${labelStr}: %4d deg ", (int)${method});`,
        ].join('\n');
      }
      return [
        `${indent}tft.setCursor(${p.x ?? 10}, ${p.y ?? 200});`,
        `${indent}tft.setTextSize(1);`,
        `${indent}tft.setTextColor(${p.color || 'ILI9341_CYAN'}, ILI9341_BLACK);`,
        `${indent}tft.printf("MIC: %4d ADC ", analogRead(MIC_PIN));`,
      ].join('\n');
    }

    case 'if_sensor_threshold': {
      const sensor = String(p.sensor || 'LIGHT');
      let expr = 'map(analogRead(LIGHT_PIN), 0, 4095, 0, 100)';
      if (sensor === 'TEMP') expr = '((((analogRead(TEMP_PIN) / 4095.0) * 3300.0) - 500.0) / 10.0)';
      else if (sensor === 'MIC') expr = 'analogRead(MIC_PIN)';
      else if (sensor === 'GYRO_ROLL') expr = 'mpu.getRoll()';
      else if (sensor === 'GYRO_PITCH') expr = 'mpu.getPitch()';
      else if (sensor === 'GYRO_YAW') expr = 'mpu.getYaw()';
      return `${indent}if (${expr} ${p.op || '>'} ${p.threshold ?? 50}) {\n${childrenCode || `${indent}  // threshold met`}\n${indent}}`;
    }

    case 'read_gyro_axis': {
      const axis = String(p.axis || 'ROLL');
      const vName = String(p.varName || 'x');
      const method =
        axis === 'PITCH'
          ? 'mpu.getPitch()'
          : axis === 'YAW'
          ? 'mpu.getYaw()'
          : 'mpu.getRoll()';
      return `${indent}${vName} = (int)${method};`;
    }

    case 'var_set':
      return `${indent}${p.varName || 'x'} = ${p.value ?? 0};`;

    case 'var_change': {
      const d = Number(p.delta);
      const op = !isNaN(d) && d < 0 ? `-= ${Math.abs(d)}` : `+= ${p.delta ?? 1}`;
      return `${indent}${p.varName || 'x'} ${op};`;
    }

    case 'var_constrain_screen':
      return [
        `${indent}${p.xVar || 'x'} = constrain(${p.xVar || 'x'}, 12, 308);`,
        `${indent}${p.yVar || 'y'} = constrain(${p.yVar || 'y'}, ${p.minY ?? 32}, 212);`,
      ].join('\n');

    case 'if_var_compare':
      return `${indent}if (${p.varName || 'score'} ${p.op || '=='} ${p.value ?? 10}) {\n${childrenCode || `${indent}  // branch`}\n${indent}}`;

    case 'repeat_times':
      return `${indent}for (int _rep = 0; _rep < ${p.count ?? 3}; _rep++) {\n${childrenCode || `${indent}  // loop`}\n${indent}}`;

    case 'delay_ms':
      return `${indent}delay(${p.ms ?? 20});`;

    case 'serial_println':
      return `${indent}Serial.println("${String(p.text ?? '').replace(/"/g, '\\"')}");`;

    case 'espnow_broadcast':
      return `${indent}VidiNetwork.broadcast("${String(p.payload ?? 'PING').replace(/"/g, '\\"')}");`;

    case 'if_espnow_received':
      return [
        `${indent}if (VidiNetwork.available() > 0) {`,
        `${indent}  String _msg = VidiNetwork.readMessage();`,
        childrenCode || `${indent}  // packet received`,
        `${indent}}`,
      ].join('\n');

    case 'maze3d_init':
      return [
        `${indent}_px = ${p.startX ?? 1.5};`,
        `${indent}_py = ${p.startY ?? 1.5};`,
        `${indent}_pAngle = 0.0;`,
        `${indent}_coinsCollected = 0;`,
        `${indent}for (int _i = 0; _i < 5; _i++) { _coinTaken[_i] = 0; leds[_i] = CRGB::Black; }`,
        `${indent}FastLED.show();`,
      ].join('\n');

    case 'maze3d_step_controls':
      return [
        `${indent}_frameTick++;`,
        `${indent}int _lr = analogRead(BTN_LR);`,
        `${indent}int _ud = analogRead(BTN_UD);`,
        `${indent}if (_lr > 3800) _pAngle -= ${p.turnSpeed ?? 0.075};`,
        `${indent}else if (_lr > 1500 && _lr < 2600) _pAngle += ${p.turnSpeed ?? 0.075};`,
        `${indent}float _step = 0.0;`,
        `${indent}if (_ud > 3800) _step = ${p.moveSpeed ?? 0.085};`,
        `${indent}else if (_ud > 1500 && _ud < 2600) _step = -${p.moveSpeed ?? 0.085};`,
        `${indent}if (_step != 0.0) {`,
        `${indent}  float _nx = _px + cos(_pAngle) * _step;`,
        `${indent}  float _ny = _py + sin(_pAngle) * _step;`,
        `${indent}  if (_maze[(int)_py * 10 + (int)_nx] == 0) _px = _nx;`,
        `${indent}  if (_maze[(int)_ny * 10 + (int)_px] == 0) _py = _ny;`,
        `${indent}}`,
        `${indent}for (int _c = 0; _c < 5; _c++) {`,
        `${indent}  if (_coinTaken[_c] == 0) {`,
        `${indent}    float _dx = _coinX[_c] - _px;`,
        `${indent}    float _dy = _coinY[_c] - _py;`,
        `${indent}    if (_dx * _dx + _dy * _dy < 0.30) {`,
        `${indent}      _coinTaken[_c] = 1;`,
        `${indent}      _coinsCollected++;`,
        `${indent}      leds[_coinsCollected - 1] = CRGB::Gold;`,
        `${indent}      FastLED.show();`,
        `${indent}      tone(SPEAKER_PIN, 880 + _coinsCollected * 160, 80);`,
        `${indent}    }`,
        `${indent}  }`,
        `${indent}}`,
        `${indent}if (digitalRead(BTN_B) == LOW && _coinsCollected >= 5) {`,
        `${indent}  _px = 1.5; _py = 1.5; _pAngle = 0.0; _coinsCollected = 0;`,
        `${indent}  for (int _k = 0; _k < 5; _k++) { _coinTaken[_k] = 0; leds[_k] = CRGB::Black; }`,
        `${indent}  FastLED.show();`,
        `${indent}}`,
      ].join('\n');

    case 'maze3d_render_scene':
      return [
        `${indent}tft.fillRect(0, 0, 320, 120, ${p.ceilingColor ?? '0x0843'});`,
        `${indent}tft.fillRect(0, 120, 320, 120, ${p.floorColor ?? '0x18E3'});`,
        `${indent}for (int _col = 0; _col < 80; _col++) {`,
        `${indent}  float _ra = (_pAngle - 0.5236) + ((float)_col / 80.0) * 1.0472;`,
        `${indent}  float _rc = cos(_ra); float _rs = sin(_ra);`,
        `${indent}  if (fabs(_rc) < 0.0001) _rc = 0.0001; if (fabs(_rs) < 0.0001) _rs = 0.0001;`,
        `${indent}  int _mx = (int)_px; int _my = (int)_py;`,
        `${indent}  float _ddx = fabs(1.0 / _rc); float _ddy = fabs(1.0 / _rs);`,
        `${indent}  int _sx = (_rc < 0) ? -1 : 1; int _sy = (_rs < 0) ? -1 : 1;`,
        `${indent}  float _sdx = (_rc < 0) ? (_px - _mx) * _ddx : (_mx + 1.0 - _px) * _ddx;`,
        `${indent}  float _sdy = (_rs < 0) ? (_py - _my) * _ddy : (_my + 1.0 - _py) * _ddy;`,
        `${indent}  int _hit = 0; int _side = 0;`,
        `${indent}  for (int _st = 0; _st < 16; _st++) {`,
        `${indent}    if (_sdx < _sdy) { _sdx += _ddx; _mx += _sx; _side = 0; } else { _sdy += _ddy; _my += _sy; _side = 1; }`,
        `${indent}    if (_mx < 0 || _mx >= 10 || _my < 0 || _my >= 10) { _hit = 1; break; }`,
        `${indent}    int _cell = _maze[_my * 10 + _mx]; if (_cell > 0) { _hit = _cell; break; }`,
        `${indent}  }`,
        `${indent}  float _perp = ((_side == 0) ? (_sdx - _ddx) : (_sdy - _ddy)) * cos(_ra - _pAngle);`,
        `${indent}  if (_perp < 0.12) _perp = 0.12;`,
        `${indent}  _zBuf[_col] = _perp;`,
        `${indent}  int _lh = (int)(205.0 / _perp); if (_lh > 220) _lh = 220;`,
        `${indent}  uint16_t _wc = (_hit == 2) ? (_side ? 0x07FF : 0x04B3) : (_hit == 3 ? 0xFD20 : (_side ? 0x1BDF : 0x0A54));`,
        `${indent}  if (_perp > 5.0) _wc = 0x10A4;`,
        `${indent}  tft.fillRect(_col * 4, 120 - (int)(_lh / 2), 4, _lh, _wc);`,
        `${indent}}`,
        `${indent}int _spinRx = 3 + (int)(fabs(sin(_frameTick * 0.16)) * 7.0);`,
        `${indent}for (int _i = 0; _i < 5; _i++) {`,
        `${indent}  if (_coinTaken[_i] != 0) continue;`,
        `${indent}  float _dx = _coinX[_i] - _px; float _dy = _coinY[_i] - _py;`,
        `${indent}  float _cd = sqrt(_dx * _dx + _dy * _dy);`,
        `${indent}  if (_cd < 0.20 || _cd > 10.5) continue;`,
        `${indent}  float _sa = atan2(_dy, _dx) - _pAngle;`,
        `${indent}  while (_sa > PI) { _sa -= TWO_PI; }`,
        `${indent}  while (_sa < -PI) { _sa += TWO_PI; }`,
        `${indent}  if (fabs(_sa) < 0.72) {`,
        `${indent}    int _sx = (int)(160.0 + (_sa / 0.5236) * 160.0);`,
        `${indent}    int _ci = constrain((int)(_sx / 4), 0, 79);`,
        `${indent}    int _cL = constrain(_ci - 1, 0, 79); int _cR = constrain(_ci + 1, 0, 79);`,
        `${indent}    if (_cd < _zBuf[_ci] + 0.35 || _cd < _zBuf[_cL] + 0.25 || _cd < _zBuf[_cR] + 0.25) {`,
        `${indent}      int _cr = constrain((int)(34.0 / _cd), 4, 24);`,
        `${indent}      int _sy = 120 + (int)(16.0 / _cd);`,
        `${indent}      int _rx = constrain((int)((_spinRx * _cr) / 9), 2, _cr);`,
        `${indent}      tft.fillEllipse(_sx, _sy, _rx, _cr, 0xFFE0);`,
        `${indent}      tft.drawEllipse(_sx, _sy, _rx, _cr, 0xFD20);`,
        `${indent}    }`,
        `${indent}  }`,
        `${indent}}`,
      ].join('\n');

    case 'maze3d_draw_minimap':
      return [
        `${indent}tft.fillRect(0, 0, 218, 20, 0x0000);`,
        `${indent}tft.setCursor(6, 6); tft.setTextSize(1); tft.setTextColor(0xFFE0, 0x0000);`,
        `${indent}tft.printf("COINS: %d/5", _coinsCollected);`,
        `${indent}for (int _i = 0; _i < 5; _i++) { tft.fillCircle(82 + _i * 12, 9, 4, (_i < _coinsCollected) ? 0xFFE0 : 0x39E7); }`,
        `${indent}int _mx0 = ${p.mapX ?? 232}; int _my0 = ${p.mapY ?? 8}; int _cs = ${p.cellSize ?? 8};`,
        `${indent}tft.fillRect(_mx0 - 2, _my0 - 2, 10 * _cs + 4, 10 * _cs + 4, 0x0000);`,
        `${indent}tft.drawRect(_mx0 - 2, _my0 - 2, 10 * _cs + 4, 10 * _cs + 4, 0x07FF);`,
        `${indent}for (int _y = 0; _y < 10; _y++) {`,
        `${indent}  for (int _x = 0; _x < 10; _x++) {`,
        `${indent}    int _cell = _maze[_y * 10 + _x];`,
        `${indent}    if (_cell > 0) tft.fillRect(_mx0 + _x * _cs, _my0 + _y * _cs, _cs - 1, _cs - 1, (_cell == 2) ? 0x07FF : 0x39E7);`,
        `${indent}  }`,
        `${indent}}`,
        `${indent}for (int _i = 0; _i < 5; _i++) {`,
        `${indent}  if (_coinTaken[_i] == 0) tft.fillCircle(_mx0 + (int)(_coinX[_i] * _cs), _my0 + (int)(_coinY[_i] * _cs), 2, 0xFFE0);`,
        `${indent}}`,
        `${indent}int _pmx = _mx0 + (int)(_px * _cs); int _pmy = _my0 + (int)(_py * _cs);`,
        `${indent}tft.drawLine(_pmx, _pmy, _pmx + (int)(cos(_pAngle) * 8.0), _pmy + (int)(sin(_pAngle) * 8.0), 0x07E0);`,
        `${indent}tft.fillCircle(_pmx, _pmy, 2, 0xF800);`,
        `${indent}if (_coinsCollected >= 5) {`,
        `${indent}  tft.fillRect(52, 92, 216, 52, 0x0000); tft.drawRect(52, 92, 216, 52, 0xFFE0);`,
        `${indent}  tft.setCursor(70, 102); tft.setTextSize(2); tft.setTextColor(0x07E0, 0x0000); tft.print("MAZE CLEARED!");`,
        `${indent}  tft.setCursor(66, 126); tft.setTextSize(1); tft.setTextColor(0xFFFF, 0x0000); tft.print("Press [Tipka B] to Restart");`,
        `${indent}}`,
      ].join('\n');

    case 'fps3d_init':
      return [
        `${indent}_myId = VidiNetwork.boardIndex();`,
        `${indent}_px = (_myId % 2 == 0) ? 1.8 : 8.2;`,
        `${indent}_py = 4.5;`,
        `${indent}_pAngle = (_myId % 2 == 0) ? 0.0 : 3.14159;`,
        `${indent}_peerX = (_myId % 2 == 0) ? 8.2 : 1.8; _peerY = 4.5;`,
        `${indent}_fpsHp = ${p.hp ?? 100}; _fpsAmmo = ${p.ammo ?? 24}; _fpsKills = 0;`,
        `${indent}for (int _i = 0; _i < 4; _i++) { _droneHp[_i] = 100; }`,
      ].join('\n');

    case 'fps3d_singleplayer_step':
      return [
        `${indent}_frameTick++;`,
        `${indent}if (_gunCd > 0) _gunCd--; if (_muzzle > 0) _muzzle--;`,
        `${indent}int _lr = analogRead(BTN_LR); int _ud = analogRead(BTN_UD);`,
        `${indent}if (_lr > 3800) _pAngle -= ${p.turnSpeed ?? 0.08}; else if (_lr > 1500 && _lr < 2600) _pAngle += ${p.turnSpeed ?? 0.08};`,
        `${indent}float _st = 0.0; if (_ud > 3800) _st = ${p.moveSpeed ?? 0.09}; else if (_ud > 1500 && _ud < 2600) _st = -0.075;`,
        `${indent}if (_st != 0.0) {`,
        `${indent}  float _nx = _px + cos(_pAngle) * _st; float _ny = _py + sin(_pAngle) * _st;`,
        `${indent}  if (_maze[(int)_py * 10 + (int)_nx] == 0) _px = _nx;`,
        `${indent}  if (_maze[(int)_ny * 10 + (int)_px] == 0) _py = _ny;`,
        `${indent}}`,
        `${indent}int _nowA = digitalRead(BTN_A);`,
        `${indent}if (_prevA == HIGH && _nowA == LOW && _gunCd == 0 && _fpsAmmo > 0) {`,
        `${indent}  _fpsAmmo--; _gunCd = 5; _muzzle = 3; tone(SPEAKER_PIN, 940, 45);`,
        `${indent}  for (int _i = 0; _i < 4; _i++) {`,
        `${indent}    if (_droneHp[_i] <= 0) continue;`,
        `${indent}    float _dx = _droneX[_i] - _px; float _dy = _droneY[_i] - _py; float _d = sqrt(_dx*_dx + _dy*_dy);`,
        `${indent}    float _a = atan2(_dy, _dx) - _pAngle; while (_a > PI) { _a -= TWO_PI; } while (_a < -PI) { _a += TWO_PI; }`,
        `${indent}    if (fabs(_a) < 0.20 && _d < _zBuf[40] + 0.35) { _droneHp[_i] -= 50; if (_droneHp[_i] <= 0) { _fpsKills++; tone(SPEAKER_PIN, 1320, 80); } break; }`,
        `${indent}  }`,
        `${indent}}`,
        `${indent}_prevA = _nowA;`,
        `${indent}if (digitalRead(BTN_B) == LOW) { _fpsAmmo = 24; if (_fpsKills >= 4) { _fpsKills = 0; for (int _i=0;_i<4;_i++) _droneHp[_i]=100; } }`,
        `${indent}tft.fillRect(0, 0, 320, 120, 0x0822); tft.fillRect(0, 120, 320, 120, 0x1083);`,
        `${indent}for (int _c = 0; _c < 80; _c++) {`,
        `${indent}  float _ra = (_pAngle - 0.5236) + ((float)_c / 80.0) * 1.0472; float _rc = cos(_ra); float _rs = sin(_ra);`,
        `${indent}  if (fabs(_rc) < 0.0001) _rc = 0.0001; if (fabs(_rs) < 0.0001) _rs = 0.0001;`,
        `${indent}  int _mx = (int)_px; int _my = (int)_py; float _ddx = fabs(1.0/_rc); float _ddy = fabs(1.0/_rs);`,
        `${indent}  int _sx = (_rc<0)?-1:1; int _sy = (_rs<0)?-1:1; float _sdx = (_rc<0)?(_px-_mx)*_ddx:(_mx+1.0-_px)*_ddx; float _sdy = (_rs<0)?(_py-_my)*_ddy:(_my+1.0-_py)*_ddy;`,
        `${indent}  int _hit = 0; int _side = 0;`,
        `${indent}  for (int _s = 0; _s < 16; _s++) { if (_sdx < _sdy) { _sdx += _ddx; _mx += _sx; _side = 0; } else { _sdy += _ddy; _my += _sy; _side = 1; } if (_mx<0||_mx>=10||_my<0||_my>=10) {_hit=1;break;} if (_maze[_my*10+_mx]>0) {_hit=_maze[_my*10+_mx];break;} }`,
        `${indent}  float _perp = ((_side==0)?(_sdx-_ddx):(_sdy-_ddy)) * cos(_ra - _pAngle); if (_perp < 0.12) _perp = 0.12; _zBuf[_c] = _perp;`,
        `${indent}  int _lh = constrain((int)(205.0 / _perp), 4, 220);`,
        `${indent}  tft.fillRect(_c * 4, 120 - (int)(_lh / 2), 4, _lh, _side ? 0x1BDF : 0x0A54);`,
        `${indent}}`,
        `${indent}for (int _i = 0; _i < 4; _i++) {`,
        `${indent}  if (_droneHp[_i] <= 0) continue;`,
        `${indent}  float _dx = _droneX[_i] - _px; float _dy = _droneY[_i] - _py; float _d = sqrt(_dx*_dx + _dy*_dy);`,
        `${indent}  float _sa = atan2(_dy, _dx) - _pAngle; while (_sa > PI) { _sa -= TWO_PI; } while (_sa < -PI) { _sa += TWO_PI; }`,
        `${indent}  if (fabs(_sa) < 0.72) { int _sx = (int)(160.0 + (_sa/0.5236)*160.0); int _ci = constrain((int)(_sx/4), 0, 79); if (_d < _zBuf[_ci] + 0.35) { int _r = constrain((int)(40.0/_d), 5, 30); tft.fillCircle(_sx, 120, _r, 0xF800); tft.fillEllipse(_sx, 118, max(2,(int)(_r/2)), max(2,(int)(_r/4)), 0x07FF); } }`,
        `${indent}}`,
        `${indent}tft.drawFastHLine(154, 120, 13, 0x07E0); tft.drawFastVLine(160, 114, 13, 0x07E0);`,
        `${indent}if (_muzzle > 0) { tft.drawLine(160, 185, 160, 120, 0x07FF); tft.fillCircle(160, 178, 12, 0xFFE0); }`,
        `${indent}tft.fillRect(144, 188, 32, 52, 0x4228); tft.fillRect(156, 176, 8, 20, 0x07FF);`,
        `${indent}tft.fillRect(0, 0, 224, 18, 0x0000); tft.setCursor(6, 5); tft.setTextColor(0x07E0, 0x0000); tft.printf("HP:%d AMMO:%d KILLS:%d/4", _fpsHp, _fpsAmmo, _fpsKills);`,
        `${indent}tft.fillRect(232, 6, 82, 82, 0x0000); tft.drawRect(232, 6, 82, 82, 0x07FF);`,
        `${indent}for (int _i = 0; _i < 4; _i++) { if (_droneHp[_i] > 0) tft.fillCircle(234 + (int)(_droneX[_i]*8), 8 + (int)(_droneY[_i]*8), 2, 0xF800); }`,
        `${indent}tft.fillCircle(234 + (int)(_px*8), 8 + (int)(_py*8), 2, 0xFFE0);`,
      ].join('\n');

    case 'fps3d_multiplayer_step':
      return [
        `${indent}_frameTick++;`,
        `${indent}if (_gunCd > 0) _gunCd--; if (_muzzle > 0) _muzzle--;`,
        `${indent}char _pkt[64]; snprintf(_pkt, sizeof(_pkt), "P,%.2f,%.2f,%.2f,%d", _px, _py, _pAngle, _fpsHp); VidiNetwork.broadcast(_pkt);`,
        `${indent}while (VidiNetwork.available() > 0) {`,
        `${indent}  String _m = VidiNetwork.readMessage();`,
        `${indent}  if (_m.startsWith("P,")) { _peerConn = true; int c1 = _m.indexOf(","); int c2 = _m.indexOf(",", c1+1); int c3 = _m.indexOf(",", c2+1); int c4 = _m.indexOf(",", c3+1); if (c1>0 && c2>0 && c3>0 && c4>0) { _peerX = _m.substring(c1+1, c2).toFloat(); _peerY = _m.substring(c2+1, c3).toFloat(); _peerHp = _m.substring(c4+1).toInt(); } }`,
        `${indent}  else if (_m.startsWith("HIT,")) { _fpsHp = max(0, _fpsHp - 34); tone(SPEAKER_PIN, 220, 60); if (_fpsHp <= 0) { VidiNetwork.broadcast("FRAG"); _fpsHp = 100; _px = (_myId%2==0)?1.8:8.2; _py = 4.5; } }`,
        `${indent}  else if (_m == "FRAG") { _fpsKills++; tone(SPEAKER_PIN, 1320, 100); }`,
        `${indent}}`,
        `${indent}if (!_peerConn) { _peerX = 5.5 + cos(_frameTick * 0.04) * 2.0; _peerY = 4.5 + sin(_frameTick * 0.03) * 1.0; }`,
        `${indent}int _lr = analogRead(BTN_LR); int _ud = analogRead(BTN_UD);`,
        `${indent}if (_lr > 3800) _pAngle -= ${p.turnSpeed ?? 0.08}; else if (_lr > 1500 && _lr < 2600) _pAngle += ${p.turnSpeed ?? 0.08};`,
        `${indent}float _st = 0.0; if (_ud > 3800) _st = ${p.moveSpeed ?? 0.09}; else if (_ud > 1500 && _ud < 2600) _st = -0.075;`,
        `${indent}if (_st != 0.0) { float _nx = _px + cos(_pAngle)*_st; float _ny = _py + sin(_pAngle)*_st; if (_maze[(int)_py*10+(int)_nx]==0) _px=_nx; if (_maze[(int)_ny*10+(int)_px]==0) _py=_ny; }`,
        `${indent}int _nowA = digitalRead(BTN_A);`,
        `${indent}if (_prevA == HIGH && _nowA == LOW && _gunCd == 0) { _gunCd = 5; _muzzle = 3; tone(SPEAKER_PIN, 980, 45); float _dx = _peerX - _px; float _dy = _peerY - _py; float _d = sqrt(_dx*_dx+_dy*_dy); float _a = atan2(_dy,_dx)-_pAngle; while(_a>PI){_a-=TWO_PI;} while(_a<-PI){_a+=TWO_PI;} if (fabs(_a)<0.20 && _d<_zBuf[40]+0.35) { VidiNetwork.broadcast("HIT,34"); if (!_peerConn) _fpsKills++; } }`,
        `${indent}_prevA = _nowA;`,
        `${indent}tft.fillRect(0, 0, 320, 120, 0x0823); tft.fillRect(0, 120, 320, 120, 0x18C3);`,
        `${indent}for (int _c = 0; _c < 80; _c++) {`,
        `${indent}  float _ra = (_pAngle - 0.5236) + ((float)_c / 80.0) * 1.0472; float _rc = cos(_ra); float _rs = sin(_ra);`,
        `${indent}  if (fabs(_rc) < 0.0001) _rc = 0.0001; if (fabs(_rs) < 0.0001) _rs = 0.0001;`,
        `${indent}  int _mx = (int)_px; int _my = (int)_py; float _ddx = fabs(1.0/_rc); float _ddy = fabs(1.0/_rs);`,
        `${indent}  int _sx = (_rc<0)?-1:1; int _sy = (_rs<0)?-1:1; float _sdx = (_rc<0)?(_px-_mx)*_ddx:(_mx+1.0-_px)*_ddx; float _sdy = (_rs<0)?(_py-_my)*_ddy:(_my+1.0-_py)*_ddy;`,
        `${indent}  int _hit = 0; int _side = 0;`,
        `${indent}  for (int _s = 0; _s < 16; _s++) { if (_sdx < _sdy) { _sdx += _ddx; _mx += _sx; _side = 0; } else { _sdy += _ddy; _my += _sy; _side = 1; } if (_mx<0||_mx>=10||_my<0||_my>=10) {_hit=1;break;} if (_maze[_my*10+_mx]>0) {_hit=_maze[_my*10+_mx];break;} }`,
        `${indent}  float _perp = ((_side==0)?(_sdx-_ddx):(_sdy-_ddy)) * cos(_ra - _pAngle); if (_perp < 0.12) _perp = 0.12; _zBuf[_c] = _perp;`,
        `${indent}  int _lh = constrain((int)(205.0 / _perp), 4, 220);`,
        `${indent}  tft.fillRect(_c * 4, 120 - (int)(_lh / 2), 4, _lh, _side ? 0x231F : 0x11B3);`,
        `${indent}}`,
        `${indent}float _dx = _peerX - _px; float _dy = _peerY - _py; float _d = sqrt(_dx*_dx + _dy*_dy);`,
        `${indent}float _sa = atan2(_dy, _dx) - _pAngle; while (_sa > PI) { _sa -= TWO_PI; } while (_sa < -PI) { _sa += TWO_PI; }`,
        `${indent}if (fabs(_sa) < 0.72 && _d > 0.18) { int _sx = (int)(160.0 + (_sa/0.5236)*160.0); int _ci = constrain((int)(_sx/4), 0, 79); if (_d < _zBuf[_ci] + 0.35) { int _h = constrain((int)(92.0/_d), 12, 80); int _w = max(8, (int)(_h/2)); tft.fillRect(_sx - (int)(_w/2), 120 - (int)(_h/2), _w, _h, 0xF81F); tft.fillRect(_sx - (int)(_w/3), 120 - (int)(_h/3), (int)((_w*2)/3), max(3,(int)(_h/6)), 0xFFE0); } }`,
        `${indent}tft.drawFastHLine(154, 120, 13, 0xFFE0); tft.drawFastVLine(160, 114, 13, 0xFFE0);`,
        `${indent}if (_muzzle > 0) { tft.drawLine(160, 185, 160, 120, 0xFFE0); tft.fillCircle(160, 178, 12, 0xF81F); }`,
        `${indent}tft.fillRect(144, 188, 32, 52, 0x135F); tft.fillRect(156, 176, 8, 20, 0xFFE0);`,
        `${indent}tft.fillRect(0, 0, 224, 18, 0x0000); tft.setCursor(6, 5); tft.setTextColor(0x07FF, 0x0000); tft.printf("P%d HP:%d FRAGS:%d %s", _myId+1, _fpsHp, _fpsKills, _peerConn ? "RF:LIVE" : "RF:BOT");`,
        `${indent}tft.fillRect(232, 6, 82, 82, 0x0000); tft.drawRect(232, 6, 82, 82, 0x07FF);`,
        `${indent}tft.fillCircle(234 + (int)(_peerX*8), 8 + (int)(_peerY*8), 2, 0xF800);`,
        `${indent}tft.fillCircle(234 + (int)(_px*8), 8 + (int)(_py*8), 2, 0x07FF);`,
      ].join('\n');

    default:
      return `${indent}// block ${block.type}`;
  }
}

function has3DMazeBlock(list: BlockNode[]): boolean {
  for (const b of list) {
    if (b.type.startsWith('maze3d_') || b.type.startsWith('fps3d_')) return true;
    if (b.children && has3DMazeBlock(b.children)) return true;
  }
  return false;
}

export function compileBlocksToArduino(program: BlockProgram): string {
  const allVars = Array.from(
    new Set([...program.variables, 'touchX', 'touchY'])
  );
  const varDecls = allVars
    .map((v) => `int ${v} = 0;`)
    .join('\n');

  const uses3DMaze =
    has3DMazeBlock(program.setupBlocks) || has3DMazeBlock(program.loopBlocks);

  const mazeGlobals = uses3DMaze
    ? `
int _maze[100] = {
  1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,2,0,0,0,0,1,
  1,0,2,0,2,0,3,3,0,1,
  1,0,2,0,0,0,0,3,0,1,
  1,0,2,2,1,1,0,0,0,1,
  1,0,0,0,0,1,0,2,0,1,
  1,3,3,0,0,0,0,2,0,1,
  1,0,0,0,1,0,0,2,0,1,
  1,0,2,0,1,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1
};
float _px = 1.5;
float _py = 1.5;
float _pAngle = 0.0;
float _coinX[5] = { 3.5, 8.5, 1.5, 6.5, 8.5 };
float _coinY[5] = { 1.5, 1.5, 7.5, 5.5, 8.5 };
int _coinTaken[5] = { 0, 0, 0, 0, 0 };
int _coinsCollected = 0;
float _zBuf[80];
int _frameTick = 0;
int _myId = 0;
int _fpsHp = 100;
int _fpsAmmo = 24;
int _fpsKills = 0;
int _gunCd = 0;
int _muzzle = 0;
int _prevA = 1;
float _droneX[4] = { 8.2, 8.2, 2.5, 6.5 };
float _droneY[4] = { 1.8, 8.2, 7.5, 3.5 };
int _droneHp[4] = { 100, 100, 100, 100 };
float _peerX = 8.5;
float _peerY = 8.5;
int _peerHp = 100;
bool _peerConn = false;
`
    : '';

  const setupBody = program.setupBlocks
    .map((b) => compileBlockNode(b, '  '))
    .join('\n');

  const loopBody = program.loopBlocks
    .map((b) => compileBlockNode(b, '  '))
    .join('\n');

  return `// ============================================================================
// GENERATED BY VIDI X BLOCK STUDIO — ${program.name}
// ============================================================================
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>
#include <FastLED.h>

Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);
XPT2046_Touchscreen ts(TOUCH_CS, TOUCH_IRQ);
CRGB leds[5];

${varDecls}${mazeGlobals}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_LR, INPUT);
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(SPEAKER_PIN, OUTPUT);

  FastLED.addLeds<WS2812B, 26, GRB>(leds, 5);
  VidiNetwork.begin();

  tft.begin();
  tft.setRotation(3);
  ts.begin();

${setupBody}
}

void loop() {
${loopBody}
}
`;
}
