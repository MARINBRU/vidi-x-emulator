import { BLOCK_TEMPLATES, BlockProgram, compileBlocksToArduino } from './blocklyEngine';
import { EXAMPLE_SKETCHES } from './exampleSketches';
import { addVidiXHardwareSupport } from './hardwareExporter';
import starterPython from '../../examples/CircuitPythonStarter/code.py?raw';
import legacyStarterPythonV2 from './legacy/python-starter-v2.py?raw';

export interface UserProject {
  id: string;
  name: string;
  description: string;
  mode: 'cpp' | 'blocks' | 'python';
  sketchCode: string;
  blockProgram?: BlockProgram;
  boardCount: 1 | 2;
  updatedAt: number;
}

export interface PreMadeProject {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: '3d-preview' | 'multiplayer' | 'hardware-demo' | 'block-preview';
  badge: string;
  mode: 'cpp' | 'blocks' | 'python';
  boardCount: 1 | 2;
  sketchCode: string;
  blockProgram?: BlockProgram;
}

export interface CookieStorageStats {
  projectCount: number;
  cookieChunkCount: number;
  totalCookieBytes: number;
  lastSavedAt: number | null;
}

const COOKIE_META_KEY = 'vidix_proj_meta';
const COOKIE_CHUNK_PREFIX = 'vidix_proj_c';
const COOKIE_ACTIVE_ID_KEY = 'vidix_active_id';
const COOKIE_CONSENT_KEY = 'vidix_cookie_consent';
const CHUNK_SIZE = 3200; // Safe margin below browser 4096-byte per-cookie limit
const MAX_COOKIE_CHUNKS = 32;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const OVERFLOW_STORAGE_KEY = 'vidix_cookie_overflow_backup';

// Keep the original template for identifying untouched projects during migration.
// Customized projects are never replaced by the new starter.
const LEGACY_STARTER_CPP = `// ============================================================================
// MY VIDI X PROJECT (.INO) — Saved in Browser Cookies
// Board: VIDI X v1.1 (ESP32-WROVER + ILI9341 320x240 TFT + FastLED)
// ============================================================================
#include <LovyanGFX.hpp>
#include <FastLED.h>

#define BTN_LR      34
#define BTN_UD      35
#define BTN_A       32
#define BTN_B       27
#define SPEAKER_PIN 25
#define LED_PIN     26
#define NUM_LEDS    5

LGFX lcd;
LGFX_Sprite canvas(&lcd);
CRGB leds[NUM_LEDS];

int playerX = 160;
int playerY = 120;
int score = 0;

void setup() {
  Serial.begin(115200);
  pinMode(BTN_LR, INPUT);
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(SPEAKER_PIN, OUTPUT);

  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(90);

  lcd.init();
  lcd.setRotation(1);
  canvas.createSprite(320, 240);

  Serial.println("[VIDI X] Custom User Project booted!");
}

void loop() {
  int lr = analogRead(BTN_LR);
  int ud = analogRead(BTN_UD);

  if (lr > 3800) playerX -= 4;
  else if (lr > 1500 && lr < 2600) playerX += 4;

  if (ud > 3800) playerY -= 4;
  else if (ud > 1500 && ud < 2600) playerY += 4;

  playerX = constrain(playerX, 16, 304);
  playerY = constrain(playerY, 28, 224);

  if (digitalRead(BTN_A) == LOW) {
    score++;
    tone(SPEAKER_PIN, 660 + (score % 8) * 110, 45);
    leds[score % NUM_LEDS] = CRGB::Cyan;
    FastLED.show();
  }

  canvas.fillScreen(0x0842);
  canvas.fillRect(0, 0, 320, 20, 0x10A4);
  canvas.setCursor(8, 6);
  canvas.setTextColor(0x07FF, 0x10A4);
  canvas.printf("MY VIDI X PROJECT   SCORE: %d", score);

  canvas.drawCircle(playerX, playerY, 12, 0xFFE0);
  canvas.fillCircle(playerX, playerY, 6, 0x07E0);
  canvas.pushSprite(0, 0);

  delay(16);
}
`;

// Self-contained for both the simulator and an Arduino ESP32 compiler. The
// explicit PSRAM allocation is needed for a full-screen 16-bit sprite.
export const DEFAULT_STARTER_CPP = addVidiXHardwareSupport(
  LEGACY_STARTER_CPP
    .replace('#define BTN_B       27', '#define BTN_B       33')
    .replace(
      '  canvas.createSprite(320, 240);',
      `  canvas.setPsram(true);
  if (!canvas.createSprite(320, 240)) {
    canvas.setColorDepth(8);
    canvas.createSprite(320, 240);
  }`
    )
);

// Retain the old starter only to identify untouched projects during migration.
const LEGACY_STARTER_PYTHON = `# VIDI X CircuitPython (.py) — Saved in Browser Cookies
# Board: VIDI X V1.1 + VIDIIC I2C MPU-6050 6-DoF Gyroscope (0x68 on SCL=32, SDA=33)
import time
import board
import digitalio
import analogio
import simpleio
import neopixel
import xpt2046_circuitpython
import adafruit_mpu6050

display = board.DISPLAY
touch = xpt2046_circuitpython.Touch(board.SPI(), cs=digitalio.DigitalInOut(board.TOUCH_CS))
pixels = neopixel.NeoPixel(board.RGB_LED, 5, auto_write=True)
led = digitalio.DigitalInOut(board.STATUS)
led.direction = digitalio.Direction.OUTPUT

btn_a = digitalio.DigitalInOut(board.BTN_A)
btn_a.switch_to_input(digitalio.Pull.UP)
btn_lr = analogio.AnalogIn(board.BTN_L_R)
btn_ud = analogio.AnalogIn(board.BTN_UP_DOWN)

# Initialize MPU-6050 6-DoF Gyroscope + Accelerometer on VIDIIC I2C bus
i2c = board.VIDIIC()
mpu = adafruit_mpu6050.MPU6050(i2c)

ball_x = 160
ball_y = 128
score = 0

print("[VIDI X CircuitPython] Ready! Tilt board via SENSORS / GYRO or use D-Pad.")

while True:
    ax, ay, az = mpu.acceleration
    gx, gy, gz = mpu.gyro
    roll = int(mpu.roll)
    pitch = int(mpu.pitch)

    # Move ball with Gyroscope tilt OR D-Pad buttons
    ball_x = ball_x + int(roll / 6)
    ball_y = ball_y + int(pitch / 6)

    if btn_lr.value > 60000:
        ball_x = ball_x - 5
    elif btn_lr.value > 25000 and btn_lr.value < 45000:
        ball_x = ball_x + 5

    if btn_ud.value > 60000:
        ball_y = ball_y - 5
    elif btn_ud.value > 25000 and btn_ud.value < 45000:
        ball_y = ball_y + 5

    tx, ty = touch.get_coordinates()
    if tx is not None and ty is not None:
        ball_x = tx
        ball_y = ty

    ball_x = max(20, min(300, ball_x))
    ball_y = max(40, min(215, ball_y))

    if not btn_a.value:
        score = score + 1
        led.value = True
        pixels.fill(0x00E5FF)
        simpleio.tone(board.GPIO25, 660, duration=0.05)
    else:
        led.value = False

    display.fill(0x0A1220)
    display.fill_rectangle(0, 0, 320, 22, 0x162238)
    display.text("VIDI X CIRCUITPYTHON + GYRO", 8, 7, 0x00E5FF, 1)
    display.text("SCORE:" + str(score), 245, 7, 0xFFEE00, 1)

    # Artificial horizon reference crosshairs
    display.line(20, 128, 300, 128, 0x243450)
    display.line(160, 36, 160, 220, 0x243450)
    display.rect(12, 28, 296, 198, 0x334868)

    # Draw tilt-controlled ball
    display.circle(ball_x, ball_y, 12, 0xFFEE00, False)
    display.circle(ball_x, ball_y, 6, 0x22EE55, True)

    # Gyro & Accelerometer telemetry footer
    display.text(f"Roll:{roll}d Pitch:{pitch}d AccX:{ax:.1f} AccY:{ay:.1f}", 16, 214, 0xCCCCCC, 1)

    time.sleep(0.025)
`;

// Keep the standalone hardware file and the editor starter identical.
export const DEFAULT_STARTER_PYTHON = starterPython;
const PREMADE_PYTHON_GYRO = starterPython.replace('USE_MPU6050 = False', 'USE_MPU6050 = True');
const LEGACY_PYTHON_GYRO_V2 = legacyStarterPythonV2.replace('USE_MPU6050 = False', 'USE_MPU6050 = True');

const PREMADE_VIDILAB_QUIZ_PY = `# Official VidiLAB CircuitPython Quiz (8080.py from VidiLAB-com/VIDI-X-Primjeri)
import board
import displayio
import analogio
import time
import terminalio
import digitalio
import simpleio
import xpt2046_circuitpython
from adafruit_ili9341 import ILI9341
from adafruit_display_text import label
from adafruit_display_shapes.rect import Rect
from adafruit_display_shapes.roundrect import RoundRect

score = 0
level = 1
questionText = ""
a = ""
b = ""
c = ""
d = ""

displayio.release_displays()
PIEZO_PIN = board.GPIO25

led = digitalio.DigitalInOut(board.STATUS)
led.direction = digitalio.Direction.OUTPUT

touch = xpt2046_circuitpython.Touch(board.SPI(), cs=digitalio.DigitalInOut(board.TOUCH_CS))
spi = board.SPI()
display_bus = displayio.FourWire(spi, command=board.LCD_DC, chip_select=board.LCD_CS, reset=None)
display = ILI9341(display_bus, width=320, height=240, rotation=180)

splash = displayio.Group()
display.root_group = splash
color_bitmap = displayio.Bitmap(320, 240, 1)
color_palette = displayio.Palette(1)
color_palette[0] = 0x000000
bg_sprite = displayio.TileGrid(color_bitmap, pixel_shader=color_palette, x=0, y=0)
splash.append(bg_sprite)

rect = Rect(0, 0, 320, 20, outline=0x0000FF)
splash.append(rect)

text_groupL = displayio.Group(scale=1, x=8, y=10)
text_areaL = label.Label(terminalio.FONT, text="Razina: 1", color=0xFFFFFF)
text_groupL.append(text_areaL)
splash.append(text_groupL)

text_groupS = displayio.Group(scale=1, x=210, y=10)
text_areaS = label.Label(terminalio.FONT, text="Rezultat: 0", color=0xFFFFFF)
text_groupS.append(text_areaS)
splash.append(text_groupS)

text_groupQ = displayio.Group(scale=1, x=10, y=34)
text_areaQ = label.Label(terminalio.FONT, text="", color=0xFFEE00)
text_groupQ.append(text_areaQ)
splash.append(text_groupQ)

roundrectA = RoundRect(80, 52, 160, 44, 5, outline=0x0088FF)
splash.append(roundrectA)
text_groupA = displayio.Group(scale=1, x=92, y=74)
text_areaA = label.Label(terminalio.FONT, text="A:", color=0xFFFFFF)
text_groupA.append(text_areaA)
splash.append(text_groupA)

roundrectB = RoundRect(5, 114, 150, 44, 5, outline=0x0088FF)
splash.append(roundrectB)
text_groupB = displayio.Group(scale=1, x=15, y=136)
text_areaB = label.Label(terminalio.FONT, text="B:", color=0xFFFFFF)
text_groupB.append(text_areaB)
splash.append(text_groupB)

roundrectC = RoundRect(165, 114, 150, 44, 5, outline=0x0088FF)
splash.append(roundrectC)
text_groupC = displayio.Group(scale=1, x=175, y=136)
text_areaC = label.Label(terminalio.FONT, text="C:", color=0xFFFFFF)
text_groupC.append(text_areaC)
splash.append(text_groupC)

roundrectD = RoundRect(80, 176, 160, 44, 5, outline=0x0088FF)
splash.append(roundrectD)
text_groupD = displayio.Group(scale=1, x=92, y=198)
text_areaD = label.Label(terminalio.FONT, text="D:", color=0xFFFFFF)
text_groupD.append(text_areaD)
splash.append(text_groupD)

def correct():
    global score
    global level
    score = score + 1
    led.value = True
    simpleio.tone(PIEZO_PIN, 523, duration=0.15)
    simpleio.tone(PIEZO_PIN, 784, duration=0.2)
    led.value = False
    level = level + 1

def wrong():
    global level
    simpleio.tone(PIEZO_PIN, 300, duration=0.15)
    simpleio.tone(PIEZO_PIN, 200, duration=0.25)
    level = level + 1

def checkButtonInput(correctAnswer):
    with analogio.AnalogIn(board.BTN_L_R) as analog_pin:
        analog_value = analog_pin.value
        if analog_value > 30000 and analog_value < 60000:
            if correctAnswer == "C":
                roundrectC.outline = 0x00FF00
                correct()
            else:
                roundrectC.outline = 0xFF0000
                wrong()
        elif analog_value > 60000:
            if correctAnswer == "B":
                roundrectB.outline = 0x00FF00
                correct()
            else:
                roundrectB.outline = 0xFF0000
                wrong()
    with analogio.AnalogIn(board.BTN_UP_DOWN) as analog_pin:
        analog_value = analog_pin.value
        if analog_value > 30000 and analog_value < 60000:
            if correctAnswer == "D":
                roundrectD.outline = 0x00FF00
                correct()
            else:
                roundrectD.outline = 0xFF0000
                wrong()
        elif analog_value > 60000:
            if correctAnswer == "A":
                roundrectA.outline = 0x00FF00
                correct()
            else:
                roundrectA.outline = 0xFF0000
                wrong()

def checkTouchInput(correctAnswer):
    x, y = touch.get_coordinates()
    if x is not None and y is not None:
        if x >= 80 and x <= 240 and y >= 52 and y <= 96:
            if correctAnswer == "A":
                roundrectA.outline = 0x00FF00
                correct()
            else:
                roundrectA.outline = 0xFF0000
                wrong()
        elif x >= 5 and x <= 155 and y >= 114 and y <= 158:
            if correctAnswer == "B":
                roundrectB.outline = 0x00FF00
                correct()
            else:
                roundrectB.outline = 0xFF0000
                wrong()
        elif x >= 165 and x <= 315 and y >= 114 and y <= 158:
            if correctAnswer == "C":
                roundrectC.outline = 0x00FF00
                correct()
            else:
                roundrectC.outline = 0xFF0000
                wrong()
        elif x >= 80 and x <= 240 and y >= 176 and y <= 220:
            if correctAnswer == "D":
                roundrectD.outline = 0x00FF00
                correct()
            else:
                roundrectD.outline = 0xFF0000
                wrong()

def menu(qText, optA, optB, optC, optD, correctAnswer):
    roundrectA.outline = 0x0088FF
    roundrectB.outline = 0x0088FF
    roundrectC.outline = 0x0088FF
    roundrectD.outline = 0x0088FF
    text_areaL.text = "Razina: " + str(level)
    text_areaS.text = "Rezultat: " + str(score)
    text_areaQ.text = str(level) + ". " + str(qText)
    text_areaA.text = "A(UP): " + str(optA)
    text_areaB.text = "B(LEFT): " + str(optB)
    text_areaC.text = "C(RIGHT): " + str(optC)
    text_areaD.text = "D(DOWN): " + str(optD)
    checkTouchInput(correctAnswer)
    checkButtonInput(correctAnswer)

while True:
    if level == 1:
        menu("Koliko je 2 + 2?", "2", "3", "4", "5", "C")
    elif level == 2:
        menu("U formuli F=ma sto oznacava m?", "Masu", "Akceleraciju", "Silu", "Brzinu", "A")
    elif level == 3:
        menu("Voda se sastoji od kisika i?", "Zlata", "Vodika", "Ugljika", "Bakra", "B")
    elif level == 4:
        menu("Sto je mozak racunala?", "GPU", "Memorija", "Disk", "CPU", "D")
    else:
        level = 1
        score = 0
    time.sleep(0.05)
`;

export function createStarterBlockProgram(name = 'My Visual Block Project'): BlockProgram {
  return {
    name,
    variables: ['x', 'y', 'score'],
    setupBlocks: [
      { id: 'st-1', type: 'tft_clear', params: { color: '0x0000' } },
      { id: 'st-2', type: 'var_set', params: { varName: 'x', value: 160 } },
      { id: 'st-3', type: 'var_set', params: { varName: 'y', value: 120 } },
      { id: 'st-4', type: 'var_set', params: { varName: 'score', value: 0 } },
    ],
    loopBlocks: [
      { id: 'lp-1', type: 'tft_clear', params: { color: '0x0842' } },
      {
        id: 'lp-2',
        type: 'tft_text',
        params: { text: 'MY BLOCK PROJECT', x: 10, y: 8, size: 2, color: '0x07FF' },
      },
      {
        id: 'lp-3',
        type: 'if_button_pressed',
        params: { button: 'LEFT' },
        children: [{ id: 'lp-3a', type: 'var_change', params: { varName: 'x', delta: -5 } }],
      },
      {
        id: 'lp-4',
        type: 'if_button_pressed',
        params: { button: 'RIGHT' },
        children: [{ id: 'lp-4a', type: 'var_change', params: { varName: 'x', delta: 5 } }],
      },
      {
        id: 'lp-5',
        type: 'if_button_pressed',
        params: { button: 'UP' },
        children: [{ id: 'lp-5a', type: 'var_change', params: { varName: 'y', delta: -5 } }],
      },
      {
        id: 'lp-6',
        type: 'if_button_pressed',
        params: { button: 'DOWN' },
        children: [{ id: 'lp-6a', type: 'var_change', params: { varName: 'y', delta: 5 } }],
      },
      {
        id: 'lp-7',
        type: 'var_constrain_screen',
        params: { xVar: 'x', yVar: 'y', margin: 14 },
      },
      {
        id: 'lp-8',
        type: 'tft_circle',
        params: { x: 'x', y: 'y', r: 10, color: '0xFFE0', filled: 'true' },
      },
      { id: 'lp-9', type: 'delay_ms', params: { ms: 20 } },
    ],
  };
}

// ============================================================================
// Pre-Made Playable Projects Catalog (Displayed on Home Screen)
// ============================================================================
export const PREMADE_PLAYABLE_PROJECTS: PreMadeProject[] = [
  {
    id: 'premade-3d-maze',
    name: '3D Raycast Maze + Minimap & Coins',
    subtitle: 'First-Person 3D Dungeon + Spinning Gold Coins + Top-Right Radar',
    description:
      'Explore a 10x10 3D raycast maze at 60 FPS with a live minimap overlay, spinning gold coins, piezo sound effects, and WS2812B RGB LED progress.',
    category: '3d-preview',
    badge: '3D ENGINE + MINIMAP',
    mode: 'cpp',
    boardCount: 1,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'vidi-3d-maze-minimap-coins')?.code ||
      EXAMPLE_SKETCHES[0].code,
  },
  {
    id: 'premade-3d-fps-1p',
    name: '3D Cyber-DOOM Singleplayer FPS',
    subtitle: '1-Player 3D First-Person Shooter vs AI Cyber-Drones',
    description:
      'Battle 4 autonomous AI patrol drones in a 3D facility with hitscan plasma rifle, muzzle flash, radar minimap, health/ammo HUD, and RGB status.',
    category: '3d-preview',
    badge: '1P 3D SHOOTER',
    mode: 'cpp',
    boardCount: 1,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'vidi-3d-fps-singleplayer')?.code ||
      EXAMPLE_SKETCHES[0].code,
  },
  {
    id: 'premade-3d-fps-2p',
    name: '2-Player 3D Arena Deathmatch (ESP-NOW)',
    subtitle: 'Dual-Board Split-Bench 3D Multiplayer FPS over Wireless ESP-NOW',
    description:
      'Launches 2 synchronized VIDI X boards side-by-side! Player 1 (WASD + Space) and Player 2 (Arrows + Enter) battle in real-time 3D over ESP-NOW.',
    category: 'multiplayer',
    badge: '2-PLAYER ESP-NOW 3D',
    mode: 'cpp',
    boardCount: 2,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'vidi-3d-fps-multiplayer')?.code ||
      EXAMPLE_SKETCHES[0].code,
  },
  {
    id: 'premade-espnow-pong',
    name: '2-Player Wireless ESP-NOW Pong & Telemetry',
    subtitle: 'Dual-Board Wireless Arcade Pong + Live RF Packet Sync',
    description:
      'Two VIDI X boards synchronize paddle positions and ball physics over IEEE 802.11 ESP-NOW broadcast frames.',
    category: 'multiplayer',
    badge: '2-PLAYER WIRELESS',
    mode: 'cpp',
    boardCount: 2,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'multiplayer-espnow-pong')?.code ||
      EXAMPLE_SKETCHES[2].code,
  },
  {
    id: 'premade-space-defender',
    name: 'Podmornice / Cyber-Submarine Arcade',
    subtitle: 'LovyanGFX Sprite Double-Buffered Arcade + FastLED + PWM Audio',
    description:
      'Action arcade game using official VidiLAB LovyanGFX double-buffered sprites, analog resistor-ladder D-Pad, and 5x WS2812B RGB LEDs.',
    category: 'hardware-demo',
    badge: 'LOVYANGFX ARCADE',
    mode: 'cpp',
    boardCount: 1,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'vidilab-official-meteors')?.code ||
      EXAMPLE_SKETCHES[1].code,
  },
  {
    id: 'premade-diagnostics',
    name: 'VIDI X Hardware Diagnostics & Touch OS',
    subtitle: 'Interactive Test Suite for Buttons, Sensors, Touch, RGB & Audio',
    description:
      'Full onboard hardware verification suite testing ILI9341 TFT, XPT2046 touch drawing, GPIO 34/35 analog ladders, temperature, light, and mic.',
    category: 'hardware-demo',
    badge: 'HARDWARE SUITE',
    mode: 'cpp',
    boardCount: 1,
    sketchCode: EXAMPLE_SKETCHES[0].code,
  },
  {
    id: 'premade-synth-scope',
    name: 'Microphone Oscilloscope & Acoustic Synth',
    subtitle: 'Real-Time GPIO 14/36 Mic Waveform Plotter + Piezo Synthesizer',
    description:
      'Samples the onboard microphone preamp and plots a live time-domain oscilloscope trace on the 320x240 TFT with playable synth notes.',
    category: 'hardware-demo',
    badge: 'AUDIO & SCOPE',
    mode: 'cpp',
    boardCount: 1,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'vidi-316-oscilloscope')?.code ||
      EXAMPLE_SKETCHES[4].code,
  },
  {
    id: 'premade-sd-logger',
    name: 'MicroSD Telemetry Blackbox & UART2 Bridge',
    subtitle: 'SPI MicroSD File Logger + 60-Pin Expansion Bus Serial2 Comms',
    description:
      'Logs onboard temperature, ambient light, and battery telemetry to MicroSD (/telemetry.csv) and transmits frames on Expansion UART2.',
    category: 'hardware-demo',
    badge: 'SD & EXPANSION',
    mode: 'cpp',
    boardCount: 1,
    sketchCode:
      EXAMPLE_SKETCHES.find((s) => s.id === 'wired-gpio-uart-bridge')?.code ||
      EXAMPLE_SKETCHES[3].code,
  },
  {
    id: 'premade-python-gyro',
    name: 'Gyroscope Horizon & Tilt Ball (CircuitPython + MPU-6050)',
    subtitle: 'External MPU-6050 via VIDIIC (SCL=32 / SDA=33)',
    description:
      'Tilt using SENSORS / GYRO or the D-pad. A real board requires an external MPU-6050 but no sensor library; use MENU, not A/B, while VIDIIC is active.',
    category: 'hardware-demo',
    badge: 'PYTHON + GYRO',
    mode: 'python',
    boardCount: 1,
    sketchCode: PREMADE_PYTHON_GYRO,
  },
  {
    id: 'premade-python-quiz',
    name: 'VidiLAB CircuitPython Touch & D-Pad Quiz (8080.py)',
    subtitle: 'Official VidiLAB-com/VIDI-X-Primjeri CircuitPython DisplayIO & Touch Quiz',
    description:
      'Official VidiLAB CircuitPython curriculum example using displayio groups, RoundRect, label.Label, xpt2046_circuitpython touch coordinates, and analogio resistor-ladder buttons.',
    category: 'hardware-demo',
    badge: 'CIRCUITPYTHON',
    mode: 'python',
    boardCount: 1,
    sketchCode: PREMADE_VIDILAB_QUIZ_PY,
  },
  ...BLOCK_TEMPLATES.map((tpl, i) => ({
    id: `premade-block-${i}`,
    name: `${tpl.name} (Visual Blocks)`,
    subtitle: 'Pre-Made Visual Block Project — Play or Clone to Customize',
    description: tpl.description,
    category: 'block-preview' as const,
    badge: 'VISUAL BLOCKS',
    mode: 'blocks' as const,
    boardCount: (tpl.name.toLowerCase().includes('multiplayer') ? 2 : 1) as 1 | 2,
    sketchCode: compileBlocksToArduino(tpl.program),
    blockProgram: JSON.parse(JSON.stringify(tpl.program)) as BlockProgram,
  })),
];

// ============================================================================
// Cookie Read / Write Helpers (Chunked Browser Cookies)
// ============================================================================
const fallbackCookieJar: Record<string, string> = {};

function setRawCookie(name: string, value: string, maxAge = COOKIE_MAX_AGE): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } else {
    fallbackCookieJar[name] = value;
  }
}

function deleteRawCookie(name: string): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${name}=; path=/vidix-emulator; max-age=0; SameSite=Lax`;
    document.cookie = `${name}=; path=/vidix-emulator/; max-age=0; SameSite=Lax`;
  } else {
    delete fallbackCookieJar[name];
  }
}

function purgeLegacyLargeCookies(): void {
  if (typeof document === 'undefined') return;
  for (let i = 0; i < MAX_COOKIE_CHUNKS + 8; i++) {
    deleteRawCookie(`${COOKIE_CHUNK_PREFIX}${i}`);
  }
}

function getRawCookieMap(): Record<string, string> {
  if (typeof document === 'undefined') {
    return { ...fallbackCookieJar };
  }
  if (!document.cookie) return {};
  const map: Record<string, string> = {};
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) map[k] = v;
  }
  return map;
}

// Compact dictionary token compression before URI/Base64 encoding so more projects fit in 4KB cookies
const DICT_TOKENS: Array<[string, string]> = [
  ['#include <LovyanGFX.hpp>', '~L~'],
  ['#include <FastLED.h>', '~F~'],
  ['LGFX_Sprite canvas(&lcd);', '~S~'],
  ['canvas.fillRect(', '~fr('],
  ['canvas.drawRect(', '~dr('],
  ['canvas.fillCircle(', '~fc('],
  ['canvas.setCursor(', '~sc('],
  ['canvas.setTextColor(', '~tc('],
  ['canvas.pushSprite(0, 0);', '~ps~'],
  ['analogRead(BTN_LR)', '~alr~'],
  ['analogRead(BTN_UD)', '~aud~'],
  ['digitalRead(BTN_A)', '~da~'],
  ['digitalRead(BTN_B)', '~db~'],
  ['FastLED.show();', '~fs~'],
];

function encodePayloadForCookie(jsonStr: string): string {
  let compressed = jsonStr;
  for (const [full, short] of DICT_TOKENS) {
    compressed = compressed.split(full).join(short);
  }
  return encodeURIComponent(compressed);
}

function decodePayloadFromCookie(encoded: string): string {
  let decompressed = decodeURIComponent(encoded);
  for (const [full, short] of DICT_TOKENS) {
    decompressed = decompressed.split(short).join(full);
  }
  return decompressed;
}

let lastCookieSaveTimestamp: number | null = null;

export function createDefaultUserProjects(): UserProject[] {
  const starterBlocks = createStarterBlockProgram('My Block Game');
  return [
    {
      id: 'proj-starter-cpp',
      name: 'My VIDI X Sketch',
      description: 'Custom Arduino C++ (.ino) project saved in browser cookies',
      mode: 'cpp',
      sketchCode: DEFAULT_STARTER_CPP,
      boardCount: 1,
      updatedAt: Date.now(),
    },
    {
      id: 'proj-starter-blocks',
      name: 'My Block Game',
      description: 'Custom Visual Block project saved in browser cookies',
      mode: 'blocks',
      sketchCode: compileBlocksToArduino(starterBlocks),
      blockProgram: starterBlocks,
      boardCount: 1,
      updatedAt: Date.now() - 1000,
    },
    {
      id: 'proj-starter-python',
      name: 'My Python App',
      description: 'Custom CircuitPython (.py) project saved in browser cookies',
      mode: 'python',
      sketchCode: DEFAULT_STARTER_PYTHON,
      boardCount: 1,
      updatedAt: Date.now() - 2000,
    },
  ];
}

export function hasAcceptedCookies(): boolean {
  const cookies = getRawCookieMap();
  return cookies[COOKIE_CONSENT_KEY] === 'accepted';
}

export function acceptCookiesAndSave(
  projects: UserProject[],
  activeProjectId?: string
): CookieStorageStats {
  setRawCookie(COOKIE_CONSENT_KEY, 'accepted');
  return saveProjectsToCookies(projects, activeProjectId);
}

export function saveProjectsToCookies(
  projects: UserProject[],
  activeProjectId?: string
): CookieStorageStats {
  const json = JSON.stringify(projects);

  // Always save full project code in localStorage when in a browser so HTTP Cookie headers stay < 120 bytes
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OVERFLOW_STORAGE_KEY, json);
    }
  } catch {
    // Ignore quota errors
  }

  // Purge any old multi-KB cookie chunks so Nginx never sees a large Cookie header
  purgeLegacyLargeCookies();

  if (typeof document !== 'undefined' && !hasAcceptedCookies()) {
    return getCookieStorageStats(projects.length);
  }

  const now = Date.now();
  lastCookieSaveTimestamp = now;

  if (typeof document === 'undefined') {
    // In Node/SSR test environment without localStorage, keep in-memory fallback chunked jar
    const encoded = encodePayloadForCookie(json);
    const chunks: string[] = [];
    for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
      chunks.push(encoded.slice(i, i + CHUNK_SIZE));
    }
    const storedChunkCount = Math.min(chunks.length, MAX_COOKIE_CHUNKS);
    for (let i = 0; i < storedChunkCount; i++) {
      setRawCookie(`${COOKIE_CHUNK_PREFIX}${i}`, chunks[i]);
    }
    setRawCookie(
      COOKIE_META_KEY,
      encodeURIComponent(
        JSON.stringify({
          v: 2,
          chunks: storedChunkCount,
          totalLen: json.length,
          savedAt: now,
        })
      )
    );
  } else {
    // In browser: store only a tiny metadata cookie (< 80 bytes) so HTTP headers stay tiny
    setRawCookie(
      COOKIE_META_KEY,
      encodeURIComponent(
        JSON.stringify({
          v: 2,
          count: projects.length,
          totalLen: json.length,
          savedAt: now,
        })
      )
    );
  }

  if (activeProjectId) {
    setRawCookie(COOKIE_ACTIVE_ID_KEY, encodeURIComponent(activeProjectId));
  }

  return getCookieStorageStats(projects.length);
}

function sanitizeLoadedProjects(projects: UserProject[]): {
  cleaned: UserProject[];
  changed: boolean;
} {
  let changed = false;
  const cleaned = projects.map((p) => {
    const next = { ...p };

    // Only replace a byte-for-byte untouched old starter. Any user edits,
    // including changes to the original starter, remain exactly as saved.
    if (next.mode === 'cpp' && next.sketchCode === LEGACY_STARTER_CPP) {
      changed = true;
      next.sketchCode = DEFAULT_STARTER_CPP;
    }

    if (next.mode === 'python' && next.sketchCode === LEGACY_STARTER_PYTHON) {
      changed = true;
      next.sketchCode = next.name.startsWith('Gyroscope Horizon & Tilt Ball (CircuitPython + MPU-6050)')
        ? PREMADE_PYTHON_GYRO : DEFAULT_STARTER_PYTHON;
    }

    // The previous CircuitPython 9 starter shipped in two unedited variants;
    // update each exactly, without touching edited copies or their project IDs.
    if (next.mode === 'python' && next.sketchCode === legacyStarterPythonV2) {
      changed = true;
      next.sketchCode = DEFAULT_STARTER_PYTHON;
    } else if (next.mode === 'python' && next.sketchCode === LEGACY_PYTHON_GYRO_V2) {
      changed = true;
      next.sketchCode = PREMADE_PYTHON_GYRO;
    }

    // Restore built-in starter projects if they were previously converted to another mode
    if (next.id === 'proj-starter-cpp' && next.mode !== 'cpp') {
      changed = true;
      return {
        ...next,
        mode: 'cpp' as const,
        sketchCode: DEFAULT_STARTER_CPP,
        blockProgram: undefined,
      };
    }
    if (next.id === 'proj-starter-python' && next.mode !== 'python') {
      changed = true;
      return {
        ...next,
        mode: 'python' as const,
        sketchCode: DEFAULT_STARTER_PYTHON,
        blockProgram: undefined,
      };
    }
    if (next.id === 'proj-starter-blocks' && next.mode !== 'blocks') {
      changed = true;
      const starterBlocks = createStarterBlockProgram(next.name || 'My First Block Game');
      return {
        ...next,
        mode: 'blocks' as const,
        blockProgram: starterBlocks,
        sketchCode: compileBlocksToArduino(starterBlocks),
      };
    }

    // Remove any leaked unconditional top-level speaker_tone in loopBlocks from earlier conversions
    if (next.blockProgram && Array.isArray(next.blockProgram.loopBlocks)) {
      const filteredLoop = next.blockProgram.loopBlocks.filter(
        (b) => b.type !== 'speaker_tone'
      );
      if (filteredLoop.length !== next.blockProgram.loopBlocks.length) {
        changed = true;
        const fixedProg: BlockProgram = {
          ...next.blockProgram,
          loopBlocks: filteredLoop,
        };
        next.blockProgram = fixedProg;
        if (next.mode === 'blocks') {
          next.sketchCode = compileBlocksToArduino(fixedProg);
        }
      }
    }

    // Remove leaked unconditional top-level tone() in previously converted C++/Python code
    if (
      next.mode === 'cpp' &&
      next.sketchCode.startsWith('// Generated by VIDI X Visual Block Studio') &&
      /^\s{2}tone\(SPEAKER_PIN,\s*\d+,\s*\d+\);$/m.test(next.sketchCode)
    ) {
      changed = true;
      next.sketchCode = next.sketchCode.replace(
        /^\s{2}tone\(SPEAKER_PIN,\s*\d+,\s*\d+\);\r?\n?/gm,
        ''
      );
    }
    if (
      next.mode === 'python' &&
      next.sketchCode.startsWith('# VIDI X CircuitPython Program:') &&
      /^\s{4}simpleio\.tone\(/m.test(next.sketchCode)
    ) {
      changed = true;
      next.sketchCode = next.sketchCode.replace(
        /^\s{4}simpleio\.tone\([^\n]+\r?\n?/gm,
        ''
      );
    }

    return next;
  });

  return { cleaned, changed };
}

export function loadProjectsFromCookies(): UserProject[] {
  const cookies = getRawCookieMap();
  const rawMeta = cookies[COOKIE_META_KEY];

  // 1. Prefer localStorage payload in browser environments, then immediately purge legacy large cookie chunks
  try {
    if (typeof localStorage !== 'undefined') {
      const backup = localStorage.getItem(OVERFLOW_STORAGE_KEY);
      if (backup) {
        purgeLegacyLargeCookies();
        const parsed = JSON.parse(backup) as UserProject[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const { cleaned, changed } = sanitizeLoadedProjects(parsed);
          if (changed) saveProjectsToCookies(cleaned, getActiveProjectIdFromCookie() || cleaned[0].id);
          return cleaned;
        }
      }
    }
  } catch {
    // Fall through
  }

  // 2. Migrate any legacy chunked cookies into localStorage and delete the chunks
  if (rawMeta) {
    try {
      const meta = JSON.parse(decodeURIComponent(rawMeta)) as {
        chunks?: number;
        savedAt?: number;
      };
      if (meta.savedAt) {
        lastCookieSaveTimestamp = meta.savedAt;
      }

      if (meta.chunks && meta.chunks > 0) {
        let combined = '';
        for (let i = 0; i < meta.chunks; i++) {
          const part = cookies[`${COOKIE_CHUNK_PREFIX}${i}`];
          if (part === undefined) {
            throw new Error(`Missing cookie chunk ${i}`);
          }
          combined += part;
        }

        if (combined) {
          const json = decodePayloadFromCookie(combined);
          const parsed = JSON.parse(json) as UserProject[];
          purgeLegacyLargeCookies();
          if (Array.isArray(parsed) && parsed.length > 0) {
            const { cleaned } = sanitizeLoadedProjects(parsed);
            saveProjectsToCookies(cleaned, getActiveProjectIdFromCookie() || cleaned[0].id);
            return cleaned;
          }
        }
      }
    } catch {
      purgeLegacyLargeCookies();
    }
  }

  purgeLegacyLargeCookies();
  const defaults = createDefaultUserProjects();
  saveProjectsToCookies(defaults, defaults[0].id);
  return defaults;
}

export function getActiveProjectIdFromCookie(): string | null {
  const cookies = getRawCookieMap();
  const val = cookies[COOKIE_ACTIVE_ID_KEY];
  return val ? decodeURIComponent(val) : null;
}

export function setActiveProjectIdCookie(projectId: string): void {
  setRawCookie(COOKIE_ACTIVE_ID_KEY, encodeURIComponent(projectId));
}

export function getCookieStorageStats(knownProjectCount?: number): CookieStorageStats {
  const cookies = getRawCookieMap();
  let chunkCount = 0;
  let totalBytes = 0;

  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(OVERFLOW_STORAGE_KEY);
      if (stored) {
        totalBytes = stored.length;
        chunkCount = 1;
      }
    }
  } catch {
    // Ignore
  }

  for (const [k, v] of Object.entries(cookies)) {
    if (
      k === COOKIE_META_KEY ||
      k === COOKIE_ACTIVE_ID_KEY ||
      k.startsWith(COOKIE_CHUNK_PREFIX)
    ) {
      totalBytes += k.length + v.length + 1;
      if (k.startsWith(COOKIE_CHUNK_PREFIX)) {
        chunkCount++;
      }
    }
  }

  return {
    projectCount: knownProjectCount ?? 0,
    cookieChunkCount: chunkCount,
    totalCookieBytes: totalBytes,
    lastSavedAt: lastCookieSaveTimestamp,
  };
}
