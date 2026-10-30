// ============================================================================
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
