// ============================================================================
// MY VIDI X PROJECT (.INO) — Saved in Browser Cookies
// Board: VIDI X v1.1 (ESP32-WROVER + ILI9341 320x240 TFT + FastLED)
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
  canvas.setPsram(true);
  if (!canvas.createSprite(320, 240)) {
    canvas.setColorDepth(8);
    canvas.createSprite(320, 240);
  }

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
