// ============================================================================
// VIDI X v1.1 (ESP32-WROVER) Real Hardware Export — 3D Raycast Maze
// Target Board in Arduino IDE: "ESP32 Wrover Module" (PSRAM: Enabled)
// Required libraries are listed in the #include lines below
// ============================================================================
// ============================================================================
// VIDI X - 3D Raycast Maze Explorer with Minimap & Gold Coins
// Controls: D-Pad UP/DOWN = Move, LEFT/RIGHT = Turn, Tipka A = Radar Ping,
//           Tipka B = Toggle Minimap / Restart when all 5 coins collected
// ============================================================================
#define LGFX_USE_V1
#include <LovyanGFX.hpp>

// VIDI X v1.1 ILI9341 display on the ESP32 VSPI bus
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9341 _panel_instance;
  lgfx::Bus_SPI _bus_instance;
public:
  LGFX(void) {
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host = VSPI_HOST;
      cfg.spi_mode = 0;
      cfg.freq_write = 40000000;
      cfg.freq_read = 16000000;
      cfg.spi_3wire = true;
      cfg.use_lock = true;
      cfg.dma_channel = 1;
      cfg.pin_sclk = 18;
      cfg.pin_mosi = 23;
      cfg.pin_miso = 19;
      cfg.pin_dc = 21;
      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }
    {
      auto cfg = _panel_instance.config();
      cfg.pin_cs = 5;
      cfg.pin_rst = -1; // GPIO 4 is TOUCH_CS, not TFT reset
      cfg.pin_busy = -1;
      cfg.memory_width = 240;
      cfg.memory_height = 320;
      cfg.panel_width = 240;
      cfg.panel_height = 320;
      cfg.offset_x = 0;
      cfg.offset_y = 0;
      cfg.offset_rotation = 0; // setRotation(1) selects landscape
      cfg.dummy_read_pixel = 8;
      cfg.dummy_read_bits = 1;
      cfg.readable = true;
      cfg.invert = false;
      cfg.rgb_order = false;
      cfg.dlen_16bit = false;
      cfg.bus_shared = true;
      _panel_instance.config(cfg);
    }
    setPanel(&_panel_instance);
  }
};

#include <FastLED.h>

// BEGIN VIDI X LEGACY TONE COMPATIBILITY
#ifndef ESP_ARDUINO_VERSION_MAJOR
static void vidiXLegacyTone(uint8_t pin, unsigned int frequency, unsigned long duration) {
  if (frequency == 0) {
    ledcWriteTone(0, 0);
    return;
  }
  ledcSetup(0, frequency, 8);
  ledcAttachPin(pin, 0);
  ledcWriteTone(0, frequency);
  if (duration > 0) {
    delay(duration);
    ledcWriteTone(0, 0);
  }
}
static void vidiXLegacyTone(uint8_t pin, unsigned int frequency) {
  vidiXLegacyTone(pin, frequency, 0);
}
static void vidiXLegacyNoTone(uint8_t pin) {
  ledcWriteTone(0, 0);
  ledcDetachPin(pin);
}
#define tone(...) vidiXLegacyTone(__VA_ARGS__)
#define noTone(...) vidiXLegacyNoTone(__VA_ARGS__)
#endif
// END VIDI X LEGACY TONE COMPATIBILITY



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
  canvas.setPsram(true);
  if (!canvas.createSprite(320, 240)) { canvas.setColorDepth(8); canvas.createSprite(320, 240); }

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
        Serial.printf("[COIN] Collected %d / %d!\n", coinsCollected, NUM_COINS);
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
