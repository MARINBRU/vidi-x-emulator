// ============================================================================
// VIDI X v1.1 Real Hardware (.INO) Exporter for Arduino IDE / PlatformIO
// Wraps emulator sketches with physical ESP32-WROVER SPI bus config (LovyanGFX)
// and physical ESP-NOW IEEE 802.11 broadcast networking (VidiNetwork).
// ============================================================================

const REAL_LGFX_CLASS_BLOCK = `
// --- Official VIDI X v1.1 (ESP32-WROVER) LovyanGFX ILI9341 SPI Configuration ---
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9341 _panel_instance;
  lgfx::Bus_SPI       _bus_instance;
public:
  LGFX(void) {
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host   = VSPI_HOST;  // ESP32 SPI3 / VSPI
      cfg.spi_mode   = 0;
      cfg.freq_write = 40000000;   // 40 MHz SPI write for 60 FPS DMA
      cfg.freq_read  = 16000000;
      cfg.spi_3wire  = false;
      cfg.use_lock   = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;
      cfg.pin_sclk   = 18;         // VIDI X TFT SCLK
      cfg.pin_mosi   = 23;         // VIDI X TFT MOSI
      cfg.pin_miso   = 19;         // VIDI X TFT MISO
      cfg.pin_dc     = 21;         // VIDI X TFT DC
      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }
    {
      auto cfg = _panel_instance.config();
      cfg.pin_cs           = 5;    // VIDI X TFT CS
      cfg.pin_rst          = 4;    // VIDI X TFT RST (-1 if tied to EN)
      cfg.pin_busy         = -1;
      cfg.memory_width     = 240;
      cfg.memory_height    = 320;
      cfg.panel_width      = 240;
      cfg.panel_height     = 320;
      cfg.offset_x         = 0;
      cfg.offset_y         = 0;
      cfg.offset_rotation  = 0;
      cfg.dummy_read_pixel = 8;
      cfg.dummy_read_bits  = 1;
      cfg.readable         = true;
      cfg.invert           = false;
      cfg.rgb_order        = false;
      cfg.dlen_16bit       = false;
      cfg.bus_shared       = true;
      _panel_instance.config(cfg);
    }
    setPanel(&_panel_instance);
  }
};
`;

const REAL_VIDI_NETWORK_BLOCK = `
// --- Physical ESP32 ESP-NOW Implementation of VidiNetwork ---
#include <WiFi.h>
#include <esp_now.h>

struct VidiNetworkHardware {
  static const int QUEUE_SIZE = 16;
  String rxQueue[QUEUE_SIZE];
  volatile int head = 0;
  volatile int tail = 0;
  int cachedRole = -1; // 0 = Player 1, 1 = Player 2
  uint8_t myMac[6] = {0};
  bool initialized = false;

  void ensureInit() {
    if (initialized) return;
    initialized = true;
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    WiFi.macAddress(myMac);
    // Default role from lowest MAC byte parity; automatically flips if peer MAC > myMac
    // Or hold Tipka B (GPIO 27 / 33) during boot to force Player 2
    pinMode(27, INPUT_PULLUP);
    if (digitalRead(27) == LOW) {
      cachedRole = 1;
    } else {
      cachedRole = (myMac[5] & 1);
    }
    if (esp_now_init() == ESP_OK) {
      esp_now_register_recv_cb(&VidiNetworkHardware::onDataRecv);
      esp_now_peer_info_t peerInfo = {};
      memset(peerInfo.peer_addr, 0xFF, 6);
      peerInfo.channel = 0;
      peerInfo.encrypt = false;
      esp_now_add_peer(&peerInfo);
    }
  }

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  static void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    const uint8_t *mac = info->src_addr;
#else
  static void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
#endif
    if (len <= 0) return;
    // Deterministic Player 1 vs Player 2 assignment by comparing 6-byte hardware MACs
    for (int i = 0; i < 6; i++) {
      if (mac[i] != instance().myMac[i]) {
        instance().cachedRole = (instance().myMac[i] < mac[i]) ? 0 : 1;
        break;
      }
    }
    char buf[128];
    int copyLen = (len < 127) ? len : 127;
    memcpy(buf, data, copyLen);
    buf[copyLen] = '\\0';
    int nextHead = (instance().head + 1) % QUEUE_SIZE;
    if (nextHead != instance().tail) {
      instance().rxQueue[instance().head] = String(buf);
      instance().head = nextHead;
    }
  }

  int boardIndex() {
    ensureInit();
    return cachedRole;
  }

  void broadcast(const char *msg) {
    ensureInit();
    static const uint8_t bcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    esp_now_send(bcast, (const uint8_t *)msg, strlen(msg));
  }

  void broadcast(const String &msg) {
    broadcast(msg.c_str());
  }

  int available() {
    ensureInit();
    return (head - tail + QUEUE_SIZE) % QUEUE_SIZE;
  }

  String readMessage() {
    ensureInit();
    if (head == tail) return String("");
    String s = rxQueue[tail];
    tail = (tail + 1) % QUEUE_SIZE;
    return s;
  }

  static VidiNetworkHardware &instance() {
    static VidiNetworkHardware inst;
    return inst;
  }
};
static VidiNetworkHardware &VidiNetwork = VidiNetworkHardware::instance();
`;

export function exportForRealVidiXHardware(sketchCode: string, sketchName = 'vidi_x_sketch'): string {
  let out = sketchCode;

  const headerComment = [
    `// ============================================================================`,
    `// VIDI X v1.1 (ESP32-WROVER) Real Hardware Export — ${sketchName}`,
    `// Target Board in Arduino IDE: "ESP32 Wrover Module" (PSRAM: Enabled)`,
    `// Required Libraries: LovyanGFX, FastLED, Adafruit_ILI9341 / TFT_eSPI`,
    `// ============================================================================`,
    ``,
  ].join('\n');

  // 1. If sketch uses LovyanGFX `LGFX lcd;` without defining `class LGFX`, inject the VIDI X SPI config
  const usesLgfx = /\bLGFX\s+\w+\s*;/.test(out);
  const hasLgfxClass = /class\s+LGFX\s*:/.test(out);
  if (usesLgfx && !hasLgfxClass) {
    if (out.includes('#include <LovyanGFX.hpp>')) {
      out = out.replace(
        '#include <LovyanGFX.hpp>',
        `#define LGFX_USE_V1\n#include <LovyanGFX.hpp>\n${REAL_LGFX_CLASS_BLOCK}`
      );
    } else {
      out = `#define LGFX_USE_V1\n#include <LovyanGFX.hpp>\n${REAL_LGFX_CLASS_BLOCK}\n` + out;
    }
  }

  // 2. Ensure 320x240 LGFX_Sprite enables PSRAM (or 8-bit fallback) so ESP32 SRAM doesn't overflow
  out = out.replace(
    /(\b\w+)\.createSprite\(\s*320\s*,\s*240\s*\)\s*;/g,
    `$1.setPsram(true);\n  if (!$1.createSprite(320, 240)) { $1.setColorDepth(8); $1.createSprite(320, 240); }`
  );

  // 3. If sketch uses VidiNetwork, inject the real ESP32 ESP-NOW broadcast implementation
  if (/\bVidiNetwork\b/.test(out) && !out.includes('struct VidiNetworkHardware')) {
    // Remove duplicate #include <WiFi.h> or <esp_now.h> if present so we place them cleanly
    out = out
      .replace(/^\s*#include\s*<WiFi\.h>\s*$/gm, '// (WiFi.h included in VidiNetworkHardware)')
      .replace(/^\s*#include\s*<esp_now\.h>\s*$/gm, '// (esp_now.h included in VidiNetworkHardware)');

    // Insert right after the last #include or at the top of the file
    const includeMatches = [...out.matchAll(/^\s*#include\s+[<"][^>"]+[>"]/gm)];
    if (includeMatches.length > 0) {
      const lastMatch = includeMatches[includeMatches.length - 1];
      const insertPos = (lastMatch.index ?? 0) + lastMatch[0].length;
      out =
        out.slice(0, insertPos) +
        '\n' +
        REAL_VIDI_NETWORK_BLOCK +
        '\n' +
        out.slice(insertPos);
    } else {
      out = REAL_VIDI_NETWORK_BLOCK + '\n' + out;
    }
  }

  return headerComment + out;
}
