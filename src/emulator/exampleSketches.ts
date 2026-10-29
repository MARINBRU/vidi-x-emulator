export interface ExampleSketch {
  id: string;
  name: string;
  category: 'Hardware' | 'Multi-Board' | 'Arcade' | 'Sensors';
  description: string;
  recommendedBoards: number;
  code: string;
}

export const EXAMPLE_SKETCHES: ExampleSketch[] = [
  {
    id: 'vidi-x-os-diag',
    name: '01 // VIDI X Hardware OS & Diagnostics',
    category: 'Hardware',
    description:
      'Complete interactive hardware self-test: D-Pad (GPIO 34/35 ladders), Tipka A/B (GPIO 32/33), XPT2046 Touch Paint, 5x WS2812B RGB LEDs, Piezo Synth, and Temp/Light/Mic sensors.',
    recommendedBoards: 1,
    code: `#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>
#include <FastLED.h>

Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);
XPT2046_Touchscreen ts(TOUCH_CS, TOUCH_IRQ);
CRGB leds[5];

int mode = 0; // 0 = Telemetry Bench, 1 = Touch Canvas
int lastMenuState = 0;
int tick = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("VIDI X v1.1 HARDWARE DIAGNOSTICS INITIALIZED");

  pinMode(BTN_LR, INPUT);
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(BTN_RESTART, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(SPEAKER_PIN, OUTPUT);

  FastLED.addLeds<WS2812B, 26, GRB>(leds, 5);

  tft.begin();
  tft.setRotation(3);
  ts.begin();

  // Boot chime
  tone(SPEAKER_PIN, 523, 60);
  delay(70);
  tone(SPEAKER_PIN, 659, 60);
  delay(70);
  tone(SPEAKER_PIN, 784, 100);

  drawFrame();
}

void drawFrame() {
  tft.fillScreen(ILI9341_BLACK);
  tft.fillRect(0, 0, 320, 22, 0x0864);
  tft.drawFastHLine(0, 22, 320, ILI9341_CYAN);
  tft.setTextColor(ILI9341_CYAN, 0x0864);
  tft.setTextSize(1);
  tft.setCursor(6, 7);
  tft.print("VIDI X ESP32-WROVER // DIAGNOSTIC BENCH");
  tft.setTextColor(ILI9341_YELLOW, 0x0864);
  tft.setCursor(238, 7);
  tft.print("[MENU] PAINT");
}

void loop() {
  int analogLR = analogRead(BTN_LR); // GPIO 34
  int analogUD = analogRead(BTN_UD); // GPIO 35
  int selStart = analogRead(BTN_SELECT_START); // GPIO 27
  int menuAdc = analogRead(BTN_MENU); // GPIO 13

  bool left = (analogLR > 3800) || (digitalRead(BTN_LEFT) == LOW);
  bool right = (analogLR > 1500 && analogLR < 2600) || (digitalRead(BTN_RIGHT) == LOW);
  bool up = (analogUD > 3800) || (digitalRead(BTN_UP) == LOW);
  bool down = (analogUD > 1500 && analogUD < 2600) || (digitalRead(BTN_DOWN) == LOW);
  bool selectBtn = (selStart > 3800) || (digitalRead(BTN_SELECT) == LOW);
  bool startBtn = (selStart > 1500 && selStart < 2600) || (digitalRead(BTN_START) == LOW);
  bool btnA = (digitalRead(BTN_A) == LOW);
  bool btnB = (digitalRead(BTN_B) == LOW);
  bool menuBtn = (menuAdc > 3000);

  // Animate 5x WS2812B RGB LEDs based on active inputs
  leds[0] = up ? CRGB::Yellow : (down ? CRGB::Orange : CRGB(0, 24, 48));
  leds[1] = left ? CRGB::Cyan : (right ? CRGB::Blue : CRGB(0, 24, 48));
  leds[2] = (selectBtn || startBtn) ? CRGB::Magenta : CRGB(0, 32, 24);
  leds[3] = btnA ? CRGB::Red : CRGB(32, 0, 16);
  leds[4] = btnB ? CRGB::Green : CRGB(0, 32, 16);
  FastLED.show();

  if (menuBtn && lastMenuState == 0) {
    mode = (mode + 1) % 2;
    tone(SPEAKER_PIN, 987, 50);
    drawFrame();
    if (mode == 1) {
      tft.setCursor(8, 28);
      tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
      tft.print("XPT2046 TOUCH CANVAS // DRAG ON SCREEN | [B]=CLEAR");
    }
  }
  lastMenuState = menuBtn ? 1 : 0;

  digitalWrite(LED_BUILTIN, (btnA || btnB) ? HIGH : LOW);

  if (btnA) tone(SPEAKER_PIN, 660, 35);
  if (btnB && mode == 0) tone(SPEAKER_PIN, 440, 35);
  if (up) tone(SPEAKER_PIN, 587, 25);
  if (down) tone(SPEAKER_PIN, 392, 25);

  if (mode == 1) {
    if (btnB) {
      tft.fillRect(0, 40, 320, 200, ILI9341_BLACK);
      tone(SPEAKER_PIN, 330, 50);
    }
    if (ts.touched()) {
      TS_Point p = ts.getPoint();
      if (p.y > 40) {
        tft.fillCircle(p.x, p.y, 4, ILI9341_CYAN);
      }
    }
    return;
  }

  // Panel 1: Controls & Button Matrix
  tft.drawRect(6, 28, 150, 112, 0x39E7);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(12, 33);
  tft.print("CONTROLS & LADDERS");

  // D-Pad Cross
  tft.fillRect(42, 50, 18, 18, up ? ILI9341_YELLOW : 0x18E3);
  tft.fillRect(42, 86, 18, 18, down ? ILI9341_YELLOW : 0x18E3);
  tft.fillRect(24, 68, 18, 18, left ? ILI9341_YELLOW : 0x18E3);
  tft.fillRect(60, 68, 18, 18, right ? ILI9341_YELLOW : 0x18E3);
  tft.fillRect(42, 68, 18, 18, 0x2945);

  // Tipka A & Tipka B
  tft.fillCircle(106, 86, 11, btnA ? ILI9341_RED : 0x3800);
  tft.setCursor(103, 83);
  tft.setTextColor(ILI9341_WHITE);
  tft.print("A");

  tft.fillCircle(132, 68, 11, btnB ? ILI9341_GREEN : 0x0200);
  tft.setCursor(129, 65);
  tft.print("B");

  // Select & Start
  tft.fillRect(18, 118, 52, 13, selectBtn ? ILI9341_CYAN : 0x2104);
  tft.setCursor(26, 121);
  tft.setTextColor(selectBtn ? ILI9341_BLACK : ILI9341_WHITE);
  tft.print("SELECT");

  tft.fillRect(82, 118, 52, 13, startBtn ? ILI9341_ORANGE : 0x2104);
  tft.setCursor(93, 121);
  tft.setTextColor(startBtn ? ILI9341_BLACK : ILI9341_WHITE);
  tft.print("START");

  // Panel 2: Onboard Sensors
  tft.drawRect(162, 28, 152, 112, 0x39E7);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(168, 33);
  tft.print("ONBOARD SENSORS");

  int tempAdc = analogRead(TEMP_PIN);
  float tempMv = (tempAdc / 4095.0) * 3300.0;
  float tempC = (tempMv - 500.0) / 10.0;

  int lightAdc = analogRead(LIGHT_PIN);
  int lightPct = map(lightAdc, 0, 4095, 0, 100);
  int micAdc = analogRead(MIC_PIN);

  tft.setCursor(168, 52);
  tft.setTextColor(ILI9341_ORANGE, ILI9341_BLACK);
  tft.printf("TEMP(26): %5.1f C ", tempC);

  tft.setCursor(168, 70);
  tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  tft.printf("LDR (39): %3d %%   ", lightPct);
  tft.fillRect(168, 82, 134, 6, 0x18E3);
  tft.fillRect(168, 82, map(lightPct, 0, 100, 0, 134), 6, ILI9341_YELLOW);

  tft.setCursor(168, 96);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.printf("MIC (14): %4d ADC", micAdc);
  tft.fillRect(168, 108, 134, 6, 0x18E3);
  tft.fillRect(168, 108, map(micAdc, 0, 4095, 0, 134), 6, ILI9341_CYAN);

  // Panel 3: Raw 12-Bit ADC & Touch Readout
  tft.drawRect(6, 145, 308, 89, 0x39E7);
  tft.setCursor(14, 153);
  tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
  tft.printf("IO34(L/R): %4d  |  IO35(U/D): %4d", analogLR, analogUD);

  tft.setCursor(14, 171);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.printf("IO27(S/S): %4d  |  IO32(A): %d  IO33(B): %d", selStart, !btnA, !btnB);

  if (ts.touched()) {
    TS_Point pt = ts.getPoint();
    tft.setCursor(14, 191);
    tft.setTextColor(ILI9341_MAGENTA, ILI9341_BLACK);
    tft.printf("XPT2046 TOUCH: X=%3d Y=%3d Z=%4d   ", pt.x, pt.y, pt.z);
    tft.fillCircle(pt.x, pt.y, 3, ILI9341_MAGENTA);
  } else {
    tft.setCursor(14, 191);
    tft.setTextColor(0x7BEF, ILI9341_BLACK);
    tft.print("XPT2046 TOUCH: [Drag Stylus/Cursor on TFT] ");
  }

  tft.setCursor(14, 211);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.printf("UNIT #%d | MAC %s | UP %ds", VidiNetwork.getBoardNumber(), VidiNetwork.getMac(), millis() / 1000);

  tick++;
}
`,
  },
  {
    id: 'vidilab-official-meteors',
    name: '02 // VidiLAB Official Asteroid Interceptor (LovyanGFX)',
    category: 'Arcade',
    description:
      'Authentic VidiLAB LovyanGFX + FastLED + LEDC game from VidiLAB-com/VIDI-X-AI-prompt! Steer with D-Pad (GPIO 34/35), fire dual cannons with Tipka A (GPIO 32), restart with BOOT (GPIO 0).',
    recommendedBoards: 1,
    code: `#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <FastLED.h>

static LGFX lcd;
static LGFX_Sprite canvas(&lcd);

#define LED_PIN 26
#define NUM_LEDS 5
CRGB leds[NUM_LEDS];

#define SPEAKER_PIN 25
#define LEDC_CHANNEL 0
#define LEDC_RESOLUTION 8
#define LEDC_BASE_FREQ 2000

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 240
#define UI_HEIGHT 28
#define PLAYER_SIZE 22
#define MAX_METEORS 7
#define MAX_CELLS 3

#define BTN_LR   34
#define BTN_UD   35
#define BTN_A    32
#define BTN_RESTART 0

#define MOVE_STEP 8
#define BULLET_SPEED 14
#define BULLET_MAX 8

#define COLOR_UI_BG 0x18E3
#define COLOR_TEXT  0xFFFF

struct Meteor {
  float x, y;
  float dx, dy;
  float speed;
  int size;
  bool active;
  float angle;
  float rotationSpeed;
  uint8_t points;
  float offsets[16];
  uint16_t color;
  bool isSmall;
  int impact;
};

struct Bullet {
  float x, y, dx, dy;
  bool active;
};

struct EnergyCell {
  float x, y;
  bool collected;
};

struct Player {
  float x, y;
  int health;
  int energy;
  int score;
};

Player player;
Meteor meteors[MAX_METEORS];
EnergyCell cells[MAX_CELLS];
Bullet bullets[BULLET_MAX];

unsigned long lastSpawn = 0;
bool gameOver = false;
bool cannonFired = false;
unsigned long lastCannonFlash = 0;
#define CANNON_FLASH_MS 70

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.setRotation(0);
  lcd.fillScreen(0x0000);
  canvas.setPsram(true);
  canvas.createSprite(SCREEN_WIDTH, SCREEN_HEIGHT);

  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  ledcSetup(LEDC_CHANNEL, LEDC_BASE_FREQ, LEDC_RESOLUTION);
  ledcAttachPin(SPEAKER_PIN, LEDC_CHANNEL);

  pinMode(BTN_LR, INPUT);
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_RESTART, INPUT_PULLUP);

  initGame();
}

void initGame() {
  player.x = SCREEN_WIDTH / 2;
  player.y = SCREEN_HEIGHT - 42;
  player.health = 100;
  player.energy = 0;
  player.score = 0;
  for (int i = 0; i < MAX_METEORS; i++) meteors[i].active = false;
  for (int i = 0; i < MAX_CELLS; i++) cells[i].collected = true;
  for (int i = 0; i < BULLET_MAX; i++) bullets[i].active = false;
  gameOver = false;
}

void playCollectSound() {
  ledcWriteTone(LEDC_CHANNEL, 1040);
  delay(25);
  ledcWriteTone(LEDC_CHANNEL, 0);
}

void playCollisionSound() {
  ledcWriteTone(LEDC_CHANNEL, 180);
  delay(35);
  ledcWriteTone(LEDC_CHANNEL, 0);
}

void generateMeteor() {
  for (int i = 0; i < MAX_METEORS; i++) {
    if (!meteors[i].active) {
      meteors[i].x = random(36, SCREEN_WIDTH - 36);
      meteors[i].y = 32;
      meteors[i].speed = random(2, 5);
      meteors[i].size = random(26, 38);
      meteors[i].active = true;
      meteors[i].angle = random(0, 360) * 0.01745;
      meteors[i].rotationSpeed = random(-8, 9) * 0.01;
      meteors[i].points = 8;
      for (int j = 0; j < 8; j++) {
        meteors[i].offsets[j] = (meteors[i].size / 2) * (0.75 + random(0, 25) * 0.01);
      }
      meteors[i].color = 0xFEA0;
      meteors[i].dx = random(-1, 2);
      meteors[i].dy = meteors[i].speed;
      meteors[i].isSmall = false;
      meteors[i].impact = 8;
      break;
    }
  }
}

void generateEnergyCell() {
  for (int i = 0; i < MAX_CELLS; i++) {
    if (cells[i].collected) {
      cells[i].x = random(40, SCREEN_WIDTH - 40);
      cells[i].y = random(60, SCREEN_HEIGHT - 60);
      cells[i].collected = false;
      break;
    }
  }
}

void updatePlayerMovement() {
  int analogLR = analogRead(BTN_LR);
  int analogUD = analogRead(BTN_UD);

  if (analogLR > 4000) player.x -= MOVE_STEP;
  if (analogLR > 1800 && analogLR < 2200) player.x += MOVE_STEP;
  if (analogUD > 4000) player.y -= MOVE_STEP;
  if (analogUD > 1800 && analogUD < 2200) player.y += MOVE_STEP;

  player.x = constrain(player.x, 16, SCREEN_WIDTH - 16);
  player.y = constrain(player.y, UI_HEIGHT + 16, SCREEN_HEIGHT - 16);
}

void fireCannon() {
  for (int i = 0; i < BULLET_MAX; i++) {
    if (!bullets[i].active) {
      bullets[i].x = player.x;
      bullets[i].y = player.y - 14;
      bullets[i].dx = 0;
      bullets[i].dy = -BULLET_SPEED;
      bullets[i].active = true;
      cannonFired = true;
      lastCannonFlash = millis();
      ledcWriteTone(LEDC_CHANNEL, 880);
      delay(12);
      ledcWriteTone(LEDC_CHANNEL, 0);
      break;
    }
  }
}

void splitMeteor(Meteor &m) {
  m.active = false;
  for (int s = 0; s < 2; s++) {
    for (int i = 0; i < MAX_METEORS; i++) {
      if (!meteors[i].active) {
        meteors[i] = m;
        meteors[i].active = true;
        meteors[i].size = 16;
        meteors[i].isSmall = true;
        meteors[i].dx = (s == 0) ? -3 : 3;
        meteors[i].dy = 3;
        meteors[i].color = 0x07FF;
        break;
      }
    }
  }
}

void updateGame() {
  updatePlayerMovement();

  if (millis() - lastSpawn > 950) {
    generateMeteor();
    if (random(100) < 35) generateEnergyCell();
    lastSpawn = millis();
  }

  for (int i = 0; i < BULLET_MAX; i++) {
    if (bullets[i].active) {
      bullets[i].x += bullets[i].dx;
      bullets[i].y += bullets[i].dy;
      if (bullets[i].y < UI_HEIGHT) bullets[i].active = false;
    }
  }

  for (int i = 0; i < MAX_METEORS; i++) {
    if (meteors[i].active) {
      meteors[i].x += meteors[i].dx;
      meteors[i].y += meteors[i].dy;
      meteors[i].angle += meteors[i].rotationSpeed;

      if (meteors[i].x < 14 || meteors[i].x > SCREEN_WIDTH - 14) {
        meteors[i].dx = -meteors[i].dx;
      }
      if (meteors[i].y > SCREEN_HEIGHT + 20) {
        meteors[i].active = false;
      }

      float dx = player.x - meteors[i].x;
      float dy = player.y - meteors[i].y;
      if (sqrt(dx * dx + dy * dy) < 12 + meteors[i].size / 2) {
        player.health -= meteors[i].isSmall ? 10 : 20;
        meteors[i].active = false;
        playCollisionSound();
      }
    }
  }

  for (int i = 0; i < MAX_CELLS; i++) {
    if (!cells[i].collected) {
      float dx = player.x - cells[i].x;
      float dy = player.y - cells[i].y;
      if (sqrt(dx * dx + dy * dy) < 22) {
        player.energy += 25;
        player.score += 100;
        cells[i].collected = true;
        playCollectSound();
      }
    }
  }

  for (int b = 0; b < BULLET_MAX; b++) {
    if (bullets[b].active) {
      for (int m = 0; m < MAX_METEORS; m++) {
        if (meteors[m].active) {
          float dx = bullets[b].x - meteors[m].x;
          float dy = bullets[b].y - meteors[m].y;
          if (sqrt(dx * dx + dy * dy) < meteors[m].size / 2 + 4) {
            bullets[b].active = false;
            if (!meteors[m].isSmall) {
              splitMeteor(meteors[m]);
            } else {
              meteors[m].active = false;
            }
            player.score += 50;
            break;
          }
        }
      }
    }
  }

  // Update FastLED health bar on GPIO 26
  int litLeds = map(constrain(player.health, 0, 100), 0, 100, 0, 5);
  for (int i = 0; i < 5; i++) {
    leds[i] = (i < litLeds) ? (player.health > 40 ? CRGB::Green : CRGB::Red) : CRGB::Black;
  }
  FastLED.show();

  if (player.health <= 0) gameOver = true;
}

void drawGame() {
  canvas.fillScreen(0x0000);
  canvas.fillRect(0, 0, SCREEN_WIDTH, UI_HEIGHT, COLOR_UI_BG);

  for (int i = 0; i < MAX_METEORS; i++) {
    if (meteors[i].active) {
      canvas.fillCircle(meteors[i].x, meteors[i].y, meteors[i].size / 2, meteors[i].color);
      canvas.drawCircle(meteors[i].x, meteors[i].y, meteors[i].size / 2, 0xFFFF);
    }
  }

  for (int i = 0; i < MAX_CELLS; i++) {
    if (!cells[i].collected) {
      canvas.fillCircle(cells[i].x, cells[i].y, 8, 0x07E0);
      canvas.drawCircle(cells[i].x, cells[i].y, 11, 0xFFFF);
    }
  }

  // Draw Ship
  canvas.fillTriangle(player.x - 12, player.y + 12, player.x + 12, player.y + 12, player.x, player.y - 14, 0xC618);
  canvas.fillEllipse(player.x, player.y - 2, 4, 6, 0x07FF);
  canvas.drawLine(player.x - 6, player.y + 12, player.x - 6, player.y + 18 + random(4), 0xF800);
  canvas.drawLine(player.x + 6, player.y + 12, player.x + 6, player.y + 18 + random(4), 0xFFE0);

  for (int i = 0; i < BULLET_MAX; i++) {
    if (bullets[i].active) {
      canvas.fillCircle(bullets[i].x, bullets[i].y, 3, 0xFFE0);
    }
  }

  canvas.setTextColor(COLOR_TEXT, COLOR_UI_BG);
  canvas.setTextSize(1);
  canvas.setCursor(8, 10);
  canvas.printf("HP:%3d%%   SCORE:%04d   NRG:%3d", player.health, player.score, player.energy);

  canvas.pushSprite(0, 0);
}

void loop() {
  static int lastFire = HIGH;
  int nowFire = digitalRead(BTN_A);
  if (lastFire == HIGH && nowFire == LOW) {
    fireCannon();
  }
  lastFire = nowFire;

  if (!gameOver) {
    updateGame();
    drawGame();
  } else {
    canvas.fillScreen(0x0000);
    canvas.setTextSize(2);
    canvas.setTextColor(0xF800, 0x0000);
    canvas.setCursor(88, 90);
    canvas.print("GAME OVER");
    canvas.setTextSize(1);
    canvas.setTextColor(0xFFFF, 0x0000);
    canvas.setCursor(92, 130);
    canvas.printf("FINAL SCORE: %d", player.score);
    canvas.setCursor(66, 160);
    canvas.print("Press [BOOT IO0] or [A] to Restart");
    canvas.pushSprite(0, 0);
    if (digitalRead(BTN_RESTART) == LOW || digitalRead(BTN_A) == LOW) {
      initGame();
      delay(250);
    }
  }
}
`,
  },
  {
    id: 'multiplayer-espnow-pong',
    name: '03 // Multiplayer Wireless Pong (2-Board ESP-NOW)',
    category: 'Multi-Board',
    description:
      'Simulates 2 VIDI X units simultaneously over virtual ESP-NOW wireless radio! Unit #1 and Unit #2 pair automatically.',
    recommendedBoards: 2,
    code: `#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);

int boardNum = 1;
int myY = 95;
int oppY = 95;
int prevMyY = 95;
int prevOppY = 95;

int ballX = 160;
int ballY = 120;
int prevBallX = 160;
int prevBallY = 120;
int vx = 5;
int vy = 3;

int scoreP1 = 0;
int scoreP2 = 0;

void setup() {
  Serial.begin(115200);
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);

  tft.begin();
  tft.setRotation(3);
  tft.fillScreen(ILI9341_BLACK);

  WiFi.mode(WIFI_STA);
  VidiNetwork.begin();
  boardNum = VidiNetwork.getBoardNumber();

  tft.fillRect(0, 0, 320, 22, 0x0864);
  tft.setTextColor(ILI9341_CYAN, 0x0864);
  tft.setTextSize(1);
  tft.setCursor(8, 7);
  tft.printf("ESP-NOW MESH PONG // UNIT #%d (%s)", boardNum, VidiNetwork.getMac());
}

void loop() {
  int ud = analogRead(BTN_UD);
  bool moveUp = (ud > 3800) || (digitalRead(BTN_UP) == LOW) || (digitalRead(BTN_A) == LOW);
  bool moveDown = (ud > 1500 && ud < 2600) || (digitalRead(BTN_DOWN) == LOW) || (digitalRead(BTN_B) == LOW);

  if (moveUp) myY = constrain(myY - 7, 28, 192);
  if (moveDown) myY = constrain(myY + 7, 28, 192);

  if (boardNum == 1) {
    while (VidiNetwork.available()) {
      String msg = VidiNetwork.readMessage();
      if (msg.startsWith("P2:")) {
        oppY = atoi(msg.substring(3));
      }
    }

    ballX += vx;
    ballY += vy;

    if (ballY <= 28 || ballY >= 232) {
      vy = -vy;
      tone(SPEAKER_PIN, 520, 20);
    }

    if (ballX <= 22 && ballY >= myY - 4 && ballY <= myY + 44) {
      vx = abs(vx);
      ballX = 23;
      tone(SPEAKER_PIN, 780, 30);
    }

    if (ballX >= 298 && ballY >= oppY - 4 && ballY <= oppY + 44) {
      vx = -abs(vx);
      ballX = 297;
      tone(SPEAKER_PIN, 660, 30);
    }

    if (ballX < 4) {
      scoreP2++;
      ballX = 160;
      ballY = 120;
      vx = 5;
      tone(SPEAKER_PIN, 220, 100);
    } else if (ballX > 316) {
      scoreP1++;
      ballX = 160;
      ballY = 120;
      vx = -5;
      tone(SPEAKER_PIN, 880, 100);
    }

    String pkt = String("STATE:") + String(myY) + "," + String(ballX) + "," + String(ballY) + "," + String(scoreP1) + "," + String(scoreP2);
    VidiNetwork.broadcast(pkt);
  } else {
    VidiNetwork.broadcast(String("P2:") + String(myY));
    while (VidiNetwork.available()) {
      String msg = VidiNetwork.readMessage();
      if (msg.startsWith("STATE:")) {
        String body = msg.substring(6);
        int c1 = body.indexOf(",");
        int c2 = body.indexOf(",", c1 + 1);
        int c3 = body.indexOf(",", c2 + 1);
        int c4 = body.indexOf(",", c3 + 1);
        if (c1 > 0 && c4 > 0) {
          oppY = atoi(body.substring(0, c1));
          ballX = atoi(body.substring(c1 + 1, c2));
          ballY = atoi(body.substring(c2 + 1, c3));
          scoreP1 = atoi(body.substring(c3 + 1, c4));
          scoreP2 = atoi(body.substring(c4 + 1));
        }
      }
    }
  }

  int leftPaddleY = (boardNum == 1) ? myY : oppY;
  int rightPaddleY = (boardNum == 1) ? oppY : myY;

  tft.fillRect(12, prevMyY, 8, 42, ILI9341_BLACK);
  tft.fillRect(300, prevOppY, 8, 42, ILI9341_BLACK);
  tft.fillCircle(prevBallX, prevBallY, 5, ILI9341_BLACK);

  for (int y = 28; y < 236; y += 14) {
    tft.drawFastVLine(160, y, 7, 0x39E7);
  }

  tft.fillRect(12, leftPaddleY, 8, 42, ILI9341_CYAN);
  tft.fillRect(300, rightPaddleY, 8, 42, ILI9341_ORANGE);
  tft.fillCircle(ballX, ballY, 5, ILI9341_YELLOW);

  tft.setTextSize(2);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setCursor(110, 30);
  tft.print(scoreP1);

  tft.setTextColor(ILI9341_ORANGE, ILI9341_BLACK);
  tft.setCursor(196, 30);
  tft.print(scoreP2);

  prevMyY = leftPaddleY;
  prevOppY = rightPaddleY;
  prevBallX = ballX;
  prevBallY = ballY;
}
`,
  },
  {
    id: 'wired-gpio-uart-bridge',
    name: '04 // Wired 60-Pin Expansion UART2 & GPIO Bridge',
    category: 'Multi-Board',
    description:
      'Connects two VIDI X units via physical 60-Pin Expansion Header jumper cables (GPIO 17 TX2 -> GPIO 16 RX2 and GPIO 26 -> GPIO 14).',
    recommendedBoards: 2,
    code: `#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);

int txCount = 0;
int rxCount = 0;
String lastRxMsg = "Awaiting UART2 frame...";
int pulseOut = 0;

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200);

  pinMode(26, OUTPUT);
  pinMode(14, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);

  tft.begin();
  tft.setRotation(3);
  tft.fillScreen(ILI9341_BLACK);

  tft.fillRect(0, 0, 320, 22, 0x03E0);
  tft.setTextColor(ILI9341_BLACK, 0x03E0);
  tft.setCursor(8, 7);
  tft.printf("60-PIN WIRED INTERCONNECT // UNIT #%d", VidiNetwork.getBoardNumber());
}

void loop() {
  bool btnA = (digitalRead(BTN_A) == LOW);
  bool btnB = (digitalRead(BTN_B) == LOW);

  if (btnA) {
    pulseOut = 1;
    digitalWrite(26, HIGH);
  } else {
    pulseOut = 0;
    digitalWrite(26, LOW);
  }

  if (btnB) {
    txCount++;
    String frame = String("FRAME#") + String(txCount) + String(" [UNIT ") + String(VidiNetwork.getBoardNumber()) + String("]");
    Serial2.println(frame);
    Serial.println("UART2 TX -> " + frame);
    tone(SPEAKER_PIN, 880, 35);
    delay(110);
  }

  if (Serial2.available() > 0) {
    lastRxMsg = Serial2.readString();
    rxCount++;
    tone(SPEAKER_PIN, 1174, 45);
  }

  int wireIn = digitalRead(14);

  tft.setTextSize(1);
  tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  tft.setCursor(10, 34);
  tft.print("JUMPER TOPOLOGY: IO17(TX2)->IO16(RX2) | IO26->IO14");

  tft.drawRect(10, 54, 300, 74, 0x39E7);
  tft.setCursor(18, 66);
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.printf("GPIO 26 OUT (Hold [A]): %s", pulseOut ? "3.3V HIGH" : "0.0V LOW ");

  tft.setCursor(18, 94);
  tft.setTextColor(wireIn ? ILI9341_GREEN : ILI9341_ORANGE, ILI9341_BLACK);
  tft.printf("GPIO 14 IN  (Remote)  : %s", wireIn ? "3.3V HIGH" : "0.0V LOW ");

  tft.drawRect(10, 140, 300, 86, 0x39E7);
  tft.setCursor(18, 152);
  tft.setTextColor(ILI9341_MAGENTA, ILI9341_BLACK);
  tft.printf("UART2 TX (Press [B]): %03d  |  RX: %03d", txCount, rxCount);

  tft.setCursor(18, 182);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.printf("RX2 BUFFER: %-32s", lastRxMsg);
}
`,
  },
  {
    id: 'vidi-316-oscilloscope',
    name: '05 // VIDI 316 Microphone Oscilloscope & IR Lab',
    category: 'Sensors',
    description:
      'Based on the VIDI #316 Magazine Oscilloscope project! Plots GPIO 14/36 Microphone preamp & GPIO 39 Light waveforms + NEC IR transceiver.',
    recommendedBoards: 1,
    code: `#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <IRremote.h>

Adafruit_ILI9341 TFT = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);

const int analogInPin = 14; // VIDI X Microphone Preamp pin
int traceX = 10;
int prevMicY = 104;
int prevLightY = 104;
int lastIrCmd = 0;

void setup() {
  Serial.begin(115200);
  pinMode(analogInPin, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  IrReceiver.begin(IR_PIN);
  IrSender.begin(IR_TX_PIN);

  TFT.begin();
  TFT.setRotation(3);
  TFT.fillScreen(ILI9341_BLACK);

  TFT.fillRect(0, 0, 320, 22, 0x03EF);
  TFT.setTextColor(ILI9341_BLACK, 0x03EF);
  TFT.setCursor(8, 7);
  TFT.print("VIDI 316 // DUAL-TRACE OSCILLOSCOPE & IR LAB");

  TFT.drawRect(8, 28, 304, 152, 0x39E7);
}

void loop() {
  int mic = analogRead(analogInPin);
  int light = analogRead(LIGHT_PIN);
  int tempAdc = analogRead(TEMP_PIN);
  float tempC = (((tempAdc / 4095.0) * 3300.0) - 500.0) / 10.0;

  if (digitalRead(BTN_A) == LOW) {
    IrSender.sendNEC(0x01, 0x45, 0);
    tone(SPEAKER_PIN, 980, 35);
  }

  if (IrReceiver.decode()) {
    lastIrCmd = IrReceiver.decodedIRData.command;
    tone(SPEAKER_PIN, 1320, 45);
    IrReceiver.resume();
  }

  int micY = map(mic, 0, 4095, 176, 32);
  int lightY = map(light, 0, 4095, 176, 32);

  int clearX = traceX + 1;
  if (clearX < 310) {
    TFT.drawFastVLine(clearX, 30, 148, ILI9341_BLACK);
    if (clearX % 20 == 0) {
      for (int gy = 36; gy < 176; gy += 16) {
        TFT.drawPixel(clearX, gy, 0x2104);
      }
    }
    TFT.drawPixel(clearX, 104, 0x39E7);
  }

  TFT.drawLine(traceX - 1, prevMicY, traceX, micY, ILI9341_CYAN);
  TFT.drawLine(traceX - 1, prevLightY, traceX, lightY, ILI9341_YELLOW);

  prevMicY = micY;
  prevLightY = lightY;
  traceX++;
  if (traceX >= 310) traceX = 10;

  TFT.setCursor(10, 190);
  TFT.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  TFT.printf("CH1 MIC(14):%4d  ", mic);
  TFT.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  TFT.printf("CH2 LDR(39):%4d  ", light);
  TFT.setTextColor(ILI9341_ORANGE, ILI9341_BLACK);
  TFT.printf("T:%4.1fC", tempC);

  TFT.setCursor(10, 210);
  TFT.setTextColor(ILI9341_MAGENTA, ILI9341_BLACK);
  TFT.printf("IR NEC RX: 0x%02X  |  [Tipka A] Transmit IR 0x45", lastIrCmd);
}
`,
  },
  {
    id: 'vidi-3d-maze-minimap-coins',
    name: '06 // 3D Raycast Maze + Minimap & Coins (LovyanGFX)',
    description:
      'First-person 3D raycasted maze with depth-shaded walls, 3D spinning gold coins, live top-right 2D minimap with FOV cone, and FastLED coin progress bar.',
    category: 'Arcade',
    recommendedBoards: 1,
    code: `// ============================================================================
// VIDI X - 3D Raycast Maze Explorer with Minimap & Gold Coins
// Controls: D-Pad UP/DOWN = Move, LEFT/RIGHT = Turn, Tipka A = Radar Ping,
//           Tipka B = Toggle Minimap / Restart when all 5 coins collected
// ============================================================================
#include <LovyanGFX.hpp>
#include <FastLED.h>

#define BTN_LR      34
#define BTN_UD      35
#define BTN_A       32
#define BTN_B       33
#define SPEAKER_PIN 25
#define LED_PIN     26
#define NUM_LEDS    5

LGFX lcd;
LGFX_Sprite canvas(&lcd);
CRGB leds[NUM_LEDS];

// 10x10 Maze Grid (1 = Blue Wall, 2 = Cyan Tech Wall, 3 = Amber Pillar)
const int MAP_W = 10;
const int MAP_H = 10;
int maze[100] = {
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

float playerX = 1.5;
float playerY = 1.5;
float playerAngle = 0.0;

// 5 Gold Coins placed inside the 3D Maze
const int NUM_COINS = 5;
float coinX[5] = { 3.5, 8.5, 1.5, 6.5, 8.5 };
float coinY[5] = { 1.5, 1.5, 7.5, 5.5, 8.5 };
int coinTaken[5] = { 0, 0, 0, 0, 0 };
int coinsCollected = 0;

float zBuf[80];
bool showMinimap = true;
int prevBtnB = HIGH;
int frameTick = 0;

void resetCoins() {
  for (int i = 0; i < NUM_COINS; i++) {
    coinTaken[i] = 0;
    leds[i] = CRGB::Black;
  }
  coinsCollected = 0;
  playerX = 1.5;
  playerY = 1.5;
  playerAngle = 0.0;
  FastLED.show();
  tone(SPEAKER_PIN, 660, 80);
}

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

  resetCoins();
  Serial.println("[3D MAZE] Ready! Collect all 5 Gold Coins using D-Pad.");
}

void updateControls() {
  int lr = analogRead(BTN_LR);
  int ud = analogRead(BTN_UD);

  // Rotate camera Left / Right
  if (lr > 3800) {
    playerAngle -= 0.075;
  } else if (lr > 1500 && lr < 2600) {
    playerAngle += 0.075;
  }

  // Move Forward / Backward with collision margin
  float moveStep = 0.0;
  if (ud > 3800) {
    moveStep = 0.085;
  } else if (ud > 1500 && ud < 2600) {
    moveStep = -0.07;
  }

  if (moveStep != 0.0) {
    float nx = playerX + cos(playerAngle) * moveStep;
    float ny = playerY + sin(playerAngle) * moveStep;
    if (maze[(int)playerY * MAP_W + (int)nx] == 0) {
      playerX = nx;
    }
    if (maze[(int)ny * MAP_W + (int)playerX] == 0) {
      playerY = ny;
    }
  }

  // Check Coin Collection
  for (int i = 0; i < NUM_COINS; i++) {
    if (coinTaken[i] == 0) {
      float dx = coinX[i] - playerX;
      float dy = coinY[i] - playerY;
      if (dx * dx + dy * dy < 0.30) {
        coinTaken[i] = 1;
        coinsCollected++;
        leds[coinsCollected - 1] = CRGB::Gold;
        FastLED.show();
        tone(SPEAKER_PIN, 880 + coinsCollected * 160, 90);
        Serial.printf("[COIN] Collected %d / %d!\\n", coinsCollected, NUM_COINS);
      }
    }
  }

  // Tipka B toggles minimap or restarts after victory
  int nowB = digitalRead(BTN_B);
  if (prevBtnB == HIGH && nowB == LOW) {
    if (coinsCollected >= NUM_COINS) {
      resetCoins();
    } else {
      showMinimap = !showMinimap;
      tone(SPEAKER_PIN, 520, 35);
    }
  }
  prevBtnB = nowB;
}

void render3DScene() {
  // Ceiling & Floor Horizon
  canvas.fillRect(0, 0, 320, 120, 0x0843);
  canvas.fillRect(0, 120, 320, 120, 0x18E3);

  float fov = 1.0472; // 60 deg FOV
  float halfFov = 0.5236;

  // Cast 80 vertical strips (4px wide each = 320px) using fast DDA grid traversal
  for (int col = 0; col < 80; col++) {
    float rayAngle = (playerAngle - halfFov) + ((float)col / 80.0) * fov;
    float rayCos = cos(rayAngle);
    float raySin = sin(rayAngle);
    if (fabs(rayCos) < 0.0001) rayCos = 0.0001;
    if (fabs(raySin) < 0.0001) raySin = 0.0001;

    int mapX = (int)playerX;
    int mapY = (int)playerY;
    float deltaDistX = fabs(1.0 / rayCos);
    float deltaDistY = fabs(1.0 / raySin);

    int stepX = (rayCos < 0) ? -1 : 1;
    int stepY = (raySin < 0) ? -1 : 1;
    float sideDistX = (rayCos < 0) ? (playerX - mapX) * deltaDistX : (mapX + 1.0 - playerX) * deltaDistX;
    float sideDistY = (raySin < 0) ? (playerY - mapY) * deltaDistY : (mapY + 1.0 - playerY) * deltaDistY;

    int hitWall = 0;
    int hitSide = 0;
    for (int step = 0; step < 16; step++) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        hitSide = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        hitSide = 1;
      }
      if (mapX < 0 || mapX >= MAP_W || mapY < 0 || mapY >= MAP_H) {
        hitWall = 1;
        break;
      }
      int cell = maze[mapY * MAP_W + mapX];
      if (cell > 0) {
        hitWall = cell;
        break;
      }
    }

    float perpDist = (hitSide == 0) ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
    perpDist = perpDist * cos(rayAngle - playerAngle);
    if (perpDist < 0.12) perpDist = 0.12;
    zBuf[col] = perpDist;

    int lineH = (int)(210.0 / perpDist);
    if (lineH > 220) lineH = 220;
    int drawStart = 120 - (int)(lineH / 2);

    uint16_t wallColor = 0x135F;
    if (hitWall == 1) {
      wallColor = hitSide ? 0x1BDF : 0x0A54;
    } else if (hitWall == 2) {
      wallColor = hitSide ? 0x07FF : 0x04B3;
    } else if (hitWall == 3) {
      wallColor = hitSide ? 0xFD20 : 0xB380;
    }
    if (perpDist > 5.0) {
      wallColor = 0x10A4;
    }

    canvas.fillRect(col * 4, drawStart, 4, lineH, wallColor);
  }

  // Project & Draw 3D Spinning Gold Coins (sorted & integer-indexed into zBuf)
  int spinRx = 3 + (int)(fabs(sin(frameTick * 0.16)) * 7.0);
  for (int i = 0; i < NUM_COINS; i++) {
    if (coinTaken[i] != 0) continue;

    float dx = coinX[i] - playerX;
    float dy = coinY[i] - playerY;
    float dist = sqrt(dx * dx + dy * dy);
    if (dist < 0.20 || dist > 10.5) continue;

    float spriteAngle = atan2(dy, dx) - playerAngle;
    while (spriteAngle > PI) { spriteAngle -= TWO_PI; }
    while (spriteAngle < -PI) { spriteAngle += TWO_PI; }

    if (fabs(spriteAngle) < 0.72) {
      int screenX = (int)(160.0 + (spriteAngle / halfFov) * 160.0);
      int colIdx = constrain((int)(screenX / 4), 0, 79);
      int colL = constrain(colIdx - 1, 0, 79);
      int colR = constrain(colIdx + 1, 0, 79);

      if (dist < zBuf[colIdx] + 0.35 || dist < zBuf[colL] + 0.25 || dist < zBuf[colR] + 0.25) {
        int coinRadius = constrain((int)(36.0 / dist), 4, 24);
        int bobY = (int)(sin(frameTick * 0.15 + i) * 4.0);
        int screenY = 120 + (int)(16.0 / dist) + bobY;

        int rx = constrain((int)((spinRx * coinRadius) / 9), 2, coinRadius);
        canvas.fillEllipse(screenX, screenY, rx, coinRadius, 0xFFE0);
        canvas.drawEllipse(screenX, screenY, rx, coinRadius, 0xFD20);
        canvas.drawFastVLine(screenX, screenY - (int)(coinRadius / 2), coinRadius, 0xFFFF);
      }
    }
  }
}

void drawMinimapAndHud() {
  // Top HUD Bar
  canvas.fillRect(0, 0, 218, 20, 0x0000);
  canvas.setTextSize(1);
  canvas.setTextColor(0xFFE0, 0x0000);
  canvas.setCursor(6, 6);
  canvas.printf("COINS: %d/%d", coinsCollected, NUM_COINS);

  // Draw mini coin icons on HUD
  for (int i = 0; i < NUM_COINS; i++) {
    uint16_t c = (i < coinsCollected) ? 0xFFE0 : 0x39E7;
    canvas.fillCircle(82 + i * 12, 9, 4, c);
  }

  canvas.setTextColor(0x07FF, 0x0000);
  canvas.setCursor(148, 6);
  canvas.printf("X:%.1f Y:%.1f", playerX, playerY);

  // Top-Right 2D Minimap Overlay (80x80px)
  if (showMinimap) {
    int mapX0 = 232;
    int mapY0 = 8;
    int cellSz = 8;
    canvas.fillRect(mapX0 - 2, mapY0 - 2, MAP_W * cellSz + 4, MAP_H * cellSz + 4, 0x0000);
    canvas.drawRect(mapX0 - 2, mapY0 - 2, MAP_W * cellSz + 4, MAP_H * cellSz + 4, 0x07FF);

    for (int my = 0; my < MAP_H; my++) {
      for (int mx = 0; mx < MAP_W; mx++) {
        int cell = maze[my * MAP_W + mx];
        if (cell > 0) {
          uint16_t mc = (cell == 2) ? 0x07FF : (cell == 3 ? 0xFD20 : 0x39E7);
          canvas.fillRect(mapX0 + mx * cellSz, mapY0 + my * cellSz, cellSz - 1, cellSz - 1, mc);
        }
      }
    }

    // Draw remaining Coins on Minimap
    for (int i = 0; i < NUM_COINS; i++) {
      if (coinTaken[i] == 0) {
        int cx = mapX0 + (int)(coinX[i] * cellSz);
        int cy = mapY0 + (int)(coinY[i] * cellSz);
        canvas.fillCircle(cx, cy, 2, 0xFFE0);
      }
    }

    // Draw Player + FOV Heading Ray on Minimap
    int px = mapX0 + (int)(playerX * cellSz);
    int py = mapY0 + (int)(playerY * cellSz);
    int lx = px + (int)(cos(playerAngle) * 9.0);
    int ly = py + (int)(sin(playerAngle) * 9.0);
    canvas.drawLine(px, py, lx, ly, 0x07E0);
    canvas.fillCircle(px, py, 2, 0xF800);
  }

  // Victory Banner when all 5 Coins Collected
  if (coinsCollected >= NUM_COINS) {
    canvas.fillRoundRect(46, 86, 228, 66, 6, 0x0000);
    canvas.drawRoundRect(46, 86, 228, 66, 6, 0xFFE0);
    canvas.setTextSize(2);
    canvas.setTextColor(0x07E0, 0x0000);
    canvas.setCursor(66, 98);
    canvas.print("MAZE CLEARED!");
    canvas.setTextSize(1);
    canvas.setTextColor(0xFFFF, 0x0000);
    canvas.setCursor(62, 128);
    canvas.print("Press [Tipka B] to Play Again");
  }
}

void loop() {
  frameTick++;
  updateControls();
  render3DScene();
  drawMinimapAndHud();
  canvas.pushSprite(0, 0);
}
`,
  },
  {
    id: 'vidi-3d-fps-singleplayer',
    name: '07 // 3D Cyber-DOOM Singleplayer FPS (LovyanGFX)',
    description:
      'First-person 3D raycaster shooter with 4 autonomous cyber-drones, plasma blaster viewmodel with recoil & muzzle flash, hitscan targeting, minimap radar, and FastLED health bar.',
    category: 'Arcade',
    recommendedBoards: 1,
    code: `// ============================================================================
// VIDI X - 3D Cyber-DOOM Singleplayer First-Person Shooter (FPS)
// Controls: D-Pad UP/DOWN = Move, LEFT/RIGHT = Aim, Tipka A = Fire Plasma Gun,
//           Tipka B = Reload / Restart Wave
// ============================================================================
#include <LovyanGFX.hpp>
#include <FastLED.h>

#define BTN_LR      34
#define BTN_UD      35
#define BTN_A       32
#define BTN_B       33
#define SPEAKER_PIN 25
#define LED_PIN     26
#define NUM_LEDS    5

LGFX lcd;
LGFX_Sprite canvas(&lcd);
CRGB leds[NUM_LEDS];

const int MAP_W = 10;
const int MAP_H = 10;
int arena[100] = {
  1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,2,0,0,0,1,
  1,0,3,0,0,2,0,3,0,1,
  1,0,0,0,0,0,0,0,0,1,
  1,2,0,0,1,1,0,0,2,1,
  1,2,0,0,1,1,0,0,2,1,
  1,0,0,0,0,0,0,0,0,1,
  1,0,3,0,0,2,0,3,0,1,
  1,0,0,0,0,2,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1
};

float px = 1.5;
float py = 1.5;
float pAngle = 0.4;
int playerHp = 100;
int playerAmmo = 24;
int score = 0;
int kills = 0;

// 4 Cyber-Drone Enemies in the 3D Arena
const int NUM_DRONES = 4;
float droneX[4] = { 8.2, 8.2, 2.5, 6.5 };
float droneY[4] = { 1.8, 8.2, 7.5, 3.5 };
int droneHp[4] = { 100, 100, 100, 100 };
int droneHitFlash[4] = { 0, 0, 0, 0 };

float zBuf[80];
int gunCooldown = 0;
int muzzleTicks = 0;
int damageFlash = 0;
int prevBtnA = HIGH;
int prevBtnB = HIGH;
int frameTick = 0;

void resetWave() {
  px = 1.5;
  py = 1.5;
  pAngle = 0.4;
  playerHp = 100;
  playerAmmo = 24;
  kills = 0;
  droneX[0] = 8.2; droneY[0] = 1.8;
  droneX[1] = 8.2; droneY[1] = 8.2;
  droneX[2] = 2.5; droneY[2] = 7.5;
  droneX[3] = 6.5; droneY[3] = 3.5;
  for (int i = 0; i < NUM_DRONES; i++) {
    droneHp[i] = 100;
    droneHitFlash[i] = 0;
  }
  tone(SPEAKER_PIN, 587, 70);
}

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

  resetWave();
  Serial.println("[3D FPS] Singleplayer Cyber-DOOM Ready! [Tipka A] = Shoot.");
}

void fireWeapon() {
  if (playerAmmo <= 0 || gunCooldown > 0 || playerHp <= 0) return;
  playerAmmo--;
  gunCooldown = 5;
  muzzleTicks = 3;
  tone(SPEAKER_PIN, 940, 45);

  // Hitscan check against all living drones near center crosshair
  int bestIdx = -1;
  float bestDist = 99.0;
  for (int i = 0; i < NUM_DRONES; i++) {
    if (droneHp[i] <= 0) continue;
    float dx = droneX[i] - px;
    float dy = droneY[i] - py;
    float dist = sqrt(dx * dx + dy * dy);
    float ang = atan2(dy, dx) - pAngle;
    while (ang > PI) ang -= TWO_PI;
    while (ang < -PI) ang += TWO_PI;

    // Within crosshair cone and not blocked by a wall
    if (fabs(ang) < 0.17 && dist < zBuf[40] && dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) {
    droneHp[bestIdx] -= 35;
    droneHitFlash[bestIdx] = 4;
    score += 25;
    tone(SPEAKER_PIN, 1380, 60);
    if (droneHp[bestIdx] <= 0) {
      droneHp[bestIdx] = 0;
      kills++;
      score += 100;
      tone(SPEAKER_PIN, 440, 110);
      Serial.printf("[FPS] Drone #%d eliminated! Kills: %d/4\\n", bestIdx + 1, kills);
    }
  }
}

void updateFpsGame() {
  if (gunCooldown > 0) gunCooldown--;
  if (muzzleTicks > 0) muzzleTicks--;
  if (damageFlash > 0) damageFlash--;

  int lr = analogRead(BTN_LR);
  int ud = analogRead(BTN_UD);

  if (playerHp > 0 && kills < NUM_DRONES) {
    if (lr > 3800) pAngle -= 0.08;
    else if (lr > 1500 && lr < 2600) pAngle += 0.08;

    float step = 0.0;
    if (ud > 3800) step = 0.09;
    else if (ud > 1500 && ud < 2600) step = -0.075;

    if (step != 0.0) {
      float nx = px + cos(pAngle) * step;
      float ny = py + sin(pAngle) * step;
      if (arena[(int)py * MAP_W + (int)nx] == 0) px = nx;
      if (arena[(int)ny * MAP_W + (int)px] == 0) py = ny;
    }

    // AI Drones patrol & pursue player
    for (int i = 0; i < NUM_DRONES; i++) {
      if (droneHp[i] <= 0) continue;
      if (droneHitFlash[i] > 0) droneHitFlash[i]--;

      float dx = px - droneX[i];
      float dy = py - droneY[i];
      float dist = sqrt(dx * dx + dy * dy);
      if (dist > 0.65) {
        float vx = (dx / dist) * 0.022;
        float vy = (dy / dist) * 0.022;
        float nDx = droneX[i] + vx;
        float nDy = droneY[i] + vy;
        if (arena[(int)droneY[i] * MAP_W + (int)nDx] == 0) droneX[i] = nDx;
        if (arena[(int)nDy * MAP_W + (int)droneX[i]] == 0) droneY[i] = nDy;
      } else if (frameTick % 18 == 0) {
        // Drone attacks player at close range
        playerHp = max(0, playerHp - 8);
        damageFlash = 3;
        tone(SPEAKER_PIN, 190, 55);
      }
    }
  }

  int nowA = digitalRead(BTN_A);
  if (prevBtnA == HIGH && nowA == LOW) {
    fireWeapon();
  }
  prevBtnA = nowA;

  int nowB = digitalRead(BTN_B);
  if (prevBtnB == HIGH && nowB == LOW) {
    if (playerHp <= 0 || kills >= NUM_DRONES) {
      resetWave();
    } else {
      playerAmmo = 24;
      tone(SPEAKER_PIN, 740, 45);
    }
  }
  prevBtnB = nowB;

  // Update FastLED WS2812B bar on GPIO 26
  int lit = map(playerHp, 0, 100, 0, 5);
  for (int i = 0; i < 5; i++) {
    if (muzzleTicks > 0) leds[i] = CRGB::Cyan;
    else if (damageFlash > 0) leds[i] = CRGB::Red;
    else leds[i] = (i < lit) ? CRGB::Green : CRGB::Black;
  }
  FastLED.show();
}

void renderFpsView() {
  // Ceiling & Floor
  uint16_t ceilCol = damageFlash > 0 ? 0x6000 : 0x0822;
  canvas.fillRect(0, 0, 320, 120, ceilCol);
  canvas.fillRect(0, 120, 320, 120, 0x1083);

  float fov = 1.0472;
  float halfFov = 0.5236;

  // 80-Column Fast DDA 3D Raycast Walls
  for (int col = 0; col < 80; col++) {
    float ra = (pAngle - halfFov) + ((float)col / 80.0) * fov;
    float rc = cos(ra);
    float rs = sin(ra);
    if (fabs(rc) < 0.0001) rc = 0.0001;
    if (fabs(rs) < 0.0001) rs = 0.0001;

    int mapX = (int)px;
    int mapY = (int)py;
    float ddx = fabs(1.0 / rc);
    float ddy = fabs(1.0 / rs);
    int stepX = (rc < 0) ? -1 : 1;
    int stepY = (rs < 0) ? -1 : 1;
    float sdx = (rc < 0) ? (px - mapX) * ddx : (mapX + 1.0 - px) * ddx;
    float sdy = (rs < 0) ? (py - mapY) * ddy : (mapY + 1.0 - py) * ddy;

    int hit = 0;
    int side = 0;
    for (int step = 0; step < 16; step++) {
      if (sdx < sdy) {
        sdx += ddx;
        mapX += stepX;
        side = 0;
      } else {
        sdy += ddy;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapX >= MAP_W || mapY < 0 || mapY >= MAP_H) {
        hit = 1;
        break;
      }
      int cell = arena[mapY * MAP_W + mapX];
      if (cell > 0) {
        hit = cell;
        break;
      }
    }

    float perp = (side == 0) ? (sdx - ddx) : (sdy - ddy);
    perp = perp * cos(ra - pAngle);
    if (perp < 0.12) perp = 0.12;
    zBuf[col] = perp;

    int lh = (int)(205.0 / perp);
    if (lh > 220) lh = 220;

    uint16_t wc = 0x1A7F;
    if (hit == 1) wc = side ? 0x231F : 0x11B3;
    else if (hit == 2) wc = side ? 0x07FF : 0x0451;
    else if (hit == 3) wc = side ? 0xF800 : 0x9000;
    if (perp > 5.5) wc = 0x10A4;

    canvas.fillRect(col * 4, 120 - (int)(lh / 2), 4, lh, wc);
  }

  // Render 3D Cyber-Drone Enemies
  for (int i = 0; i < NUM_DRONES; i++) {
    if (droneHp[i] <= 0) continue;
    float dx = droneX[i] - px;
    float dy = droneY[i] - py;
    float dist = sqrt(dx * dx + dy * dy);
    if (dist < 0.20 || dist > 10.5) continue;

    float sa = atan2(dy, dx) - pAngle;
    while (sa > PI) { sa -= TWO_PI; }
    while (sa < -PI) { sa += TWO_PI; }

    if (fabs(sa) < 0.72) {
      int sx = (int)(160.0 + (sa / halfFov) * 160.0);
      int ci = constrain((int)(sx / 4), 0, 79);
      int cL = constrain(ci - 1, 0, 79);
      int cR = constrain(ci + 1, 0, 79);

      if (dist < zBuf[ci] + 0.35 || dist < zBuf[cL] + 0.25 || dist < zBuf[cR] + 0.25) {
        int rad = constrain((int)(42.0 / dist), 5, 34);
        int hover = (int)(sin(frameTick * 0.16 + i) * 4.0);
        int sy = 120 + hover;

        uint16_t bodyCol = (droneHitFlash[i] > 0) ? 0xFFFF : 0xF800;
        canvas.fillCircle(sx, sy, rad, bodyCol);
        canvas.drawCircle(sx, sy, rad, 0xFFE0);
        // Glowing Cyber Visor Eye
        canvas.fillEllipse(sx, sy - 2, max(2, (int)(rad / 2)), max(2, (int)(rad / 4)), 0x07FF);

        // Overhead Enemy HP Bar
        int bw = rad * 2;
        int filledW = (int)((bw * droneHp[i]) / 100);
        canvas.fillRect(sx - rad, sy - rad - 6, bw, 3, 0x39E7);
        canvas.fillRect(sx - rad, sy - rad - 6, filledW, 3, 0x07E0);
      }
    }
  }

  // Center Crosshair
  canvas.drawFastHLine(154, 120, 13, 0x07E0);
  canvas.drawFastVLine(160, 114, 13, 0x07E0);

  // First-Person Plasma Weapon Viewmodel + Muzzle Flash
  int recoilY = (gunCooldown > 0) ? gunCooldown * 3 : 0;
  if (muzzleTicks > 0) {
    canvas.drawLine(160, 185, 160, 120, 0x07FF);
    canvas.fillCircle(160, 178 + recoilY, 16, 0xFFE0);
    canvas.fillCircle(160, 178 + recoilY, 9, 0x07FF);
  }
  // Gun barrel & chassis
  canvas.fillRoundRect(142, 188 + recoilY, 36, 52, 5, 0x4228);
  canvas.drawRoundRect(142, 188 + recoilY, 36, 52, 5, 0x07FF);
  canvas.fillRect(154, 174 + recoilY, 12, 22, 0x2104);
  canvas.fillRect(156, 195 + recoilY, 8, 28, 0x07FF);

  // Top HUD Bar
  canvas.fillRect(0, 0, 226, 20, 0x0000);
  canvas.setTextSize(1);
  canvas.setTextColor(playerHp > 35 ? 0x07E0 : 0xF800, 0x0000);
  canvas.setCursor(6, 6);
  canvas.printf("HP:%3d%%", playerHp);

  canvas.setTextColor(0x07FF, 0x0000);
  canvas.setCursor(64, 6);
  canvas.printf("AMMO:%2d", playerAmmo);

  canvas.setTextColor(0xFFE0, 0x0000);
  canvas.setCursor(124, 6);
  canvas.printf("KILLS:%d/4  PTS:%d", kills, score);

  // Top-Right 2D Tactical Minimap
  int mx0 = 234;
  int my0 = 6;
  int cs = 8;
  canvas.fillRect(mx0 - 2, my0 - 2, 84, 84, 0x0000);
  canvas.drawRect(mx0 - 2, my0 - 2, 84, 84, 0x07FF);
  for (int y = 0; y < MAP_H; y++) {
    for (int x = 0; x < MAP_W; x++) {
      int c = arena[y * MAP_W + x];
      if (c > 0) {
        canvas.fillRect(mx0 + x * cs, my0 + y * cs, cs - 1, cs - 1, c == 2 ? 0x07FF : 0x39E7);
      }
    }
  }
  for (int i = 0; i < NUM_DRONES; i++) {
    if (droneHp[i] > 0) {
      canvas.fillCircle(mx0 + (int)(droneX[i] * cs), my0 + (int)(droneY[i] * cs), 2, 0xF800);
    }
  }
  int pmx = mx0 + (int)(px * cs);
  int pmy = my0 + (int)(py * cs);
  canvas.drawLine(pmx, pmy, pmx + (int)(cos(pAngle) * 8.0), pmy + (int)(sin(pAngle) * 8.0), 0x07E0);
  canvas.fillCircle(pmx, pmy, 2, 0xFFE0);

  if (kills >= NUM_DRONES || playerHp <= 0) {
    canvas.fillRoundRect(46, 82, 228, 66, 6, 0x0000);
    canvas.drawRoundRect(46, 82, 228, 66, 6, kills >= NUM_DRONES ? 0x07E0 : 0xF800);
    canvas.setTextSize(2);
    canvas.setTextColor(kills >= NUM_DRONES ? 0x07E0 : 0xF800, 0x0000);
    canvas.setCursor(62, 94);
    canvas.print(kills >= NUM_DRONES ? "SECTOR CLEARED!" : "YOU DIED!");
    canvas.setTextSize(1);
    canvas.setTextColor(0xFFFF, 0x0000);
    canvas.setCursor(64, 124);
    canvas.print("Press [Tipka B] to Respawn");
  }
}

void loop() {
  frameTick++;
  updateFpsGame();
  renderFpsView();
  canvas.pushSprite(0, 0);
}
`,
  },
  {
    id: 'vidi-3d-fps-multiplayer',
    name: '08 // 3D Arena Multiplayer FPS Deathmatch (ESP-NOW)',
    description:
      '2-Board wireless ESP-NOW 3D First-Person Shooter! Spawn 2 VIDI X units to hunt each other in 3D perspective with live radar minimap, laser cannon, and frag scoreboard.',
    category: 'Multi-Board',
    recommendedBoards: 2,
    code: `// ============================================================================
// VIDI X - 2-Board Wireless ESP-NOW 3D Multiplayer FPS Deathmatch
// Click "+UNIT" (or "2P FPS (MULTI)" in the top bar) to run two VIDI X boards
// side-by-side! Each board renders the opponent in 3D + on the 2D minimap.
// ============================================================================
#include <LovyanGFX.hpp>
#include <FastLED.h>

#define BTN_LR      34
#define BTN_UD      35
#define BTN_A       32
#define BTN_B       33
#define SPEAKER_PIN 25
#define LED_PIN     26
#define NUM_LEDS    5

LGFX lcd;
LGFX_Sprite canvas(&lcd);
CRGB leds[NUM_LEDS];

const int MAP_W = 10;
const int MAP_H = 10;
int arena[100] = {
  1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,0,0,1,
  1,0,2,2,0,0,3,3,0,1,
  1,0,2,0,0,0,0,3,0,1,
  1,0,0,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,0,0,1,
  1,0,3,0,0,0,0,2,0,1,
  1,0,3,3,0,0,2,2,0,1,
  1,0,0,0,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1
};

int myId = -1;
float myX = 1.8;
float myY = 4.5;
float myAngle = 0.0;
int myHp = 100;
int myFrags = 0;

// Remote Peer State (synchronized over ESP-NOW wireless packets)
float peerX = 8.2;
float peerY = 4.5;
float peerAngle = 3.14159;
int peerHp = 100;
bool peerConnected = false;

float zBuf[80];
int gunCooldown = 0;
int muzzleTicks = 0;
int hitFlash = 0;
int prevBtnA = HIGH;
int frameTick = 0;

void respawnMe() {
  myId = VidiNetwork.boardIndex();
  if (myId % 2 == 0) {
    myX = 1.8; myY = 4.5; myAngle = 0.0;
    peerX = 8.2; peerY = 4.5;
  } else {
    myX = 8.2; myY = 4.5; myAngle = 3.14159;
    peerX = 1.8; peerY = 4.5;
  }
  myHp = 100;
  tone(SPEAKER_PIN, 660, 75);
}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_LR, INPUT);
  pinMode(BTN_UD, INPUT);
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(SPEAKER_PIN, OUTPUT);

  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(90);

  VidiNetwork.begin();
  respawnMe();

  lcd.init();
  lcd.setRotation(1);
  canvas.createSprite(320, 240);

  Serial.printf("[ESP-NOW 3D FPS] Player #%d spawned at (%.1f, %.1f)\\n", myId + 1, myX, myY);
}

void syncEspNow() {
  int curIdx = VidiNetwork.boardIndex();
  if (curIdx != myId) {
    respawnMe();
  }

  // Broadcast our live 3D coordinates & HP to all peer VIDI X units
  char pkt[64];
  snprintf(pkt, sizeof(pkt), "P,%.2f,%.2f,%.2f,%d", myX, myY, myAngle, myHp);
  VidiNetwork.broadcast(pkt);

  // Process incoming packets from opponent VIDI X unit
  while (VidiNetwork.available() > 0) {
    String msg = VidiNetwork.readMessage();
    if (msg.startsWith("P,")) {
      peerConnected = true;
      int c1 = msg.indexOf(",");
      int c2 = msg.indexOf(",", c1 + 1);
      int c3 = msg.indexOf(",", c2 + 1);
      int c4 = msg.indexOf(",", c3 + 1);
      if (c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) {
        peerX = msg.substring(c1 + 1, c2).toFloat();
        peerY = msg.substring(c2 + 1, c3).toFloat();
        peerAngle = msg.substring(c3 + 1, c4).toFloat();
        peerHp = msg.substring(c4 + 1).toInt();
      }
    } else if (msg.startsWith("HIT,")) {
      int dmg = msg.substring(4).toInt();
      myHp = max(0, myHp - dmg);
      hitFlash = 4;
      tone(SPEAKER_PIN, 220, 70);
      if (myHp <= 0) {
        VidiNetwork.broadcast("FRAG");
        respawnMe();
      }
    } else if (msg == "FRAG") {
      myFrags++;
      tone(SPEAKER_PIN, 1320, 120);
      Serial.printf("[ESP-NOW FPS] FRAG SCORED! Total Frags: %d\\n", myFrags);
    }
  }

  // If no 2nd VIDI X unit is transmitting yet, animate peer as a sparring bot
  if (!peerConnected) {
    peerX = 5.5 + cos(frameTick * 0.04) * 2.2;
    peerY = 4.5 + sin(frameTick * 0.03) * 1.2;
  }
}

void updateMpControls() {
  if (gunCooldown > 0) gunCooldown--;
  if (muzzleTicks > 0) muzzleTicks--;
  if (hitFlash > 0) hitFlash--;

  int lr = analogRead(BTN_LR);
  int ud = analogRead(BTN_UD);

  if (lr > 3800) myAngle -= 0.08;
  else if (lr > 1500 && lr < 2600) myAngle += 0.08;

  float step = 0.0;
  if (ud > 3800) step = 0.095;
  else if (ud > 1500 && ud < 2600) step = -0.08;

  if (step != 0.0) {
    float nx = myX + cos(myAngle) * step;
    float ny = myY + sin(myAngle) * step;
    if (arena[(int)myY * MAP_W + (int)nx] == 0) myX = nx;
    if (arena[(int)ny * MAP_W + (int)myX] == 0) myY = ny;
  }

  // Fire Plasma Cannon on Tipka A
  int nowA = digitalRead(BTN_A);
  if (prevBtnA == HIGH && nowA == LOW && gunCooldown == 0) {
    gunCooldown = 5;
    muzzleTicks = 3;
    tone(SPEAKER_PIN, 980, 45);

    float dx = peerX - myX;
    float dy = peerY - myY;
    float dist = sqrt(dx * dx + dy * dy);
    float ang = atan2(dy, dx) - myAngle;
    while (ang > PI) { ang -= TWO_PI; }
    while (ang < -PI) { ang += TWO_PI; }

    if (fabs(ang) < 0.20 && dist < zBuf[40] + 0.35) {
      VidiNetwork.broadcast("HIT,34");
      tone(SPEAKER_PIN, 1480, 65);
      if (!peerConnected) {
        peerHp -= 34;
        if (peerHp <= 0) {
          peerHp = 100;
          myFrags++;
        }
      }
    }
  }
  prevBtnA = nowA;

  // Update FastLED WS2812B LEDs
  int lit = map(myHp, 0, 100, 0, 5);
  for (int i = 0; i < 5; i++) {
    if (hitFlash > 0) leds[i] = CRGB::Red;
    else if (muzzleTicks > 0) leds[i] = CRGB::Yellow;
    else leds[i] = (i < lit) ? (myId == 0 ? CRGB::Cyan : CRGB::Magenta) : CRGB::Black;
  }
  FastLED.show();
}

void renderMpScene() {
  canvas.fillRect(0, 0, 320, 120, hitFlash > 0 ? 0x6000 : 0x0823);
  canvas.fillRect(0, 120, 320, 120, 0x18C3);

  float fov = 1.0472;
  float halfFov = 0.5236;

  // 80-Column Fast DDA Raycasting
  for (int col = 0; col < 80; col++) {
    float ra = (myAngle - halfFov) + ((float)col / 80.0) * fov;
    float rc = cos(ra);
    float rs = sin(ra);
    if (fabs(rc) < 0.0001) rc = 0.0001;
    if (fabs(rs) < 0.0001) rs = 0.0001;

    int mapX = (int)myX;
    int mapY = (int)myY;
    float ddx = fabs(1.0 / rc);
    float ddy = fabs(1.0 / rs);
    int stepX = (rc < 0) ? -1 : 1;
    int stepY = (rs < 0) ? -1 : 1;
    float sdx = (rc < 0) ? (myX - mapX) * ddx : (mapX + 1.0 - myX) * ddx;
    float sdy = (rs < 0) ? (myY - mapY) * ddy : (mapY + 1.0 - myY) * ddy;

    int hit = 0;
    int side = 0;
    for (int step = 0; step < 16; step++) {
      if (sdx < sdy) {
        sdx += ddx;
        mapX += stepX;
        side = 0;
      } else {
        sdy += ddy;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapX >= MAP_W || mapY < 0 || mapY >= MAP_H) {
        hit = 1;
        break;
      }
      int cell = arena[mapY * MAP_W + mapX];
      if (cell > 0) {
        hit = cell;
        break;
      }
    }

    float perp = (side == 0) ? (sdx - ddx) : (sdy - ddy);
    perp = perp * cos(ra - myAngle);
    if (perp < 0.12) perp = 0.12;
    zBuf[col] = perp;

    int lh = (int)(205.0 / perp);
    if (lh > 220) lh = 220;

    uint16_t wc = (hit == 2) ? (side ? 0x07FF : 0x0451) : (hit == 3 ? (side ? 0xF81F : 0x780F) : (side ? 0x231F : 0x11B3));
    if (perp > 5.5) wc = 0x10A4;
    canvas.fillRect(col * 4, 120 - (int)(lh / 2), 4, lh, wc);
  }

  // Render Opponent Player in 3D Perspective
  float dx = peerX - myX;
  float dy = peerY - myY;
  float dist = sqrt(dx * dx + dy * dy);
  if (dist > 0.18 && dist < 11.0) {
    float sa = atan2(dy, dx) - myAngle;
    while (sa > PI) { sa -= TWO_PI; }
    while (sa < -PI) { sa += TWO_PI; }

    if (fabs(sa) < 0.72) {
      int sx = (int)(160.0 + (sa / halfFov) * 160.0);
      int ci = constrain((int)(sx / 4), 0, 79);
      int cL = constrain(ci - 1, 0, 79);
      int cR = constrain(ci + 1, 0, 79);

      if (dist < zBuf[ci] + 0.35 || dist < zBuf[cL] + 0.25 || dist < zBuf[cR] + 0.25) {
        int h = constrain((int)(96.0 / dist), 12, 84);
        int w = max(8, (int)(h / 2));
        int sy = 120;
        uint16_t suitCol = (myId == 0) ? 0xF81F : 0x07FF;
        // Opponent Mech Torso & Head
        canvas.fillRoundRect(sx - (int)(w / 2), sy - (int)(h / 2), w, h, 3, suitCol);
        canvas.drawRoundRect(sx - (int)(w / 2), sy - (int)(h / 2), w, h, 3, 0xFFFF);
        canvas.fillRect(sx - (int)(w / 3), sy - (int)(h / 3), (int)((w * 2) / 3), max(3, (int)(h / 6)), 0xFFE0);
        // Opponent Overhead Health Bar
        int hpW = (int)((w * peerHp) / 100);
        canvas.fillRect(sx - (int)(w / 2), sy - (int)(h / 2) - 6, w, 3, 0x39E7);
        canvas.fillRect(sx - (int)(w / 2), sy - (int)(h / 2) - 6, hpW, 3, 0x07E0);
      }
    }
  }

  // Crosshair & Weapon Viewmodel
  canvas.drawFastHLine(154, 120, 13, 0xFFE0);
  canvas.drawFastVLine(160, 114, 13, 0xFFE0);

  int recoilY = (gunCooldown > 0) ? gunCooldown * 3 : 0;
  if (muzzleTicks > 0) {
    canvas.drawLine(160, 185, 160, 120, 0xFFE0);
    canvas.fillCircle(160, 178 + recoilY, 15, 0xF81F);
    canvas.fillCircle(160, 178 + recoilY, 8, 0xFFFF);
  }
  canvas.fillRoundRect(142, 188 + recoilY, 36, 52, 5, myId == 0 ? 0x135F : 0x780F);
  canvas.drawRoundRect(142, 188 + recoilY, 36, 52, 5, 0xFFFF);
  canvas.fillRect(155, 174 + recoilY, 10, 22, 0xFFE0);

  // Top Multiplayer HUD
  canvas.fillRect(0, 0, 228, 20, 0x0000);
  canvas.setTextSize(1);
  canvas.setTextColor(myId == 0 ? 0x07FF : 0xF81F, 0x0000);
  canvas.setCursor(4, 6);
  canvas.printf("P%d HP:%3d%%  FRAGS:%d  %s", myId + 1, myHp, myFrags, peerConnected ? "RF:LIVE" : "RF:BOT");

  // Top-Right 2D Minimap Radar
  int mx0 = 234;
  int my0 = 6;
  int cs = 8;
  canvas.fillRect(mx0 - 2, my0 - 2, 84, 84, 0x0000);
  canvas.drawRect(mx0 - 2, my0 - 2, 84, 84, 0x07FF);
  for (int y = 0; y < MAP_H; y++) {
    for (int x = 0; x < MAP_W; x++) {
      int c = arena[y * MAP_W + x];
      if (c > 0) canvas.fillRect(mx0 + x * cs, my0 + y * cs, cs - 1, cs - 1, 0x39E7);
    }
  }
  // Opponent dot on minimap
  canvas.fillCircle(mx0 + (int)(peerX * cs), my0 + (int)(peerY * cs), 2, 0xF800);
  // Local player dot + FOV line on minimap
  int pmx = mx0 + (int)(myX * cs);
  int pmy = my0 + (int)(myY * cs);
  canvas.drawLine(pmx, pmy, pmx + (int)(cos(myAngle) * 8.0), pmy + (int)(sin(myAngle) * 8.0), 0x07E0);
  canvas.fillCircle(pmx, pmy, 2, 0x07FF);
}

void loop() {
  frameTick++;
  syncEspNow();
  updateMpControls();
  renderMpScene();
  canvas.pushSprite(0, 0);
}
`,
  },
];


