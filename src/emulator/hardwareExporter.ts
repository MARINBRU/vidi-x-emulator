// ============================================================================
// VIDI X v1.1 Real Hardware (.INO) Exporter for Arduino IDE / PlatformIO
// Wraps emulator sketches with physical ESP32-WROVER SPI bus config (LovyanGFX)
// and physical ESP-NOW IEEE 802.11 broadcast networking (VidiNetwork).
// ============================================================================

// VidiLAB's display example: https://github.com/VidiLAB-com/VIDI-X-AI-prompt/blob/main/Podmornice-Glavni-Prompt.md
// GPIO 4 is touch chip select, not display reset (also see CircuitPython's
// ports/espressif/boards/vidi_x/{board.c,pins.c}).
const REAL_LGFX_CLASS_BLOCK = `
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
`;

// Arduino-ESP32 1.x does not provide tone()/noTone(). Later cores do, so use
// this small LEDC fallback only on the older core. Timed tones block there.
const LEGACY_TONE_BLOCK = `
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
`;

// Blank comments but keep offsets and quoted text intact for safe insertions.
function withoutComments(code: string): string {
  return code.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, (part) =>
    part.startsWith('/') ? part.replace(/[^\n]/g, ' ') : part
  );
}

function withoutCommentsOrStrings(code: string): string {
  return code.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
    (part) => part.replace(/[^\n]/g, ' '));
}

/** True when a sketch uses an LGFX display but has no visible configuration. */
export function needsVidiXDisplayConfig(sketchCode: string): boolean {
  const code = withoutComments(sketchCode);
  const symbols = withoutCommentsOrStrings(sketchCode);
  const usesLgfx = /\bLGFX\s+[A-Za-z_]\w*\s*(?:;|\([^;]*\)\s*;|=)/.test(symbols);
  const hasDefinition = /\b(?:class|struct)\s+LGFX\b[^;{]*\{/.test(symbols)
    || /\busing\s+LGFX\s*=/.test(symbols)
    || /\btypedef\b[^;{}]*\bLGFX\s*;/.test(symbols);
  const hasAutodetect = /^\s*#\s*define\s+LGFX_AUTODETECT\b/m.test(code)
    || /^\s*#\s*include\s*[<"](?:[^>"]*\/)?LGFX_AUTODETECT\.hpp[>"]/m.test(code);
  const hasConfigHeader = /^\s*#\s*include\s*[<"](?:[^>"]*\/)?LGFX_[^>"]+\.(?:h|hpp)[>"]/m.test(code);
  return usesLgfx && !hasDefinition && !hasAutodetect && !hasConfigHeader;
}

/** Add only missing physical-hardware support, without changing the saved sketch. */
export function addVidiXHardwareSupport(sketchCode: string): string {
  let out = sketchCode;
  if (needsVidiXDisplayConfig(out)) {
    const clean = withoutComments(out);
    const include = /^[ \t]*#[ \t]*include[ \t]*[<"]LovyanGFX\.(?:hpp|h)[>"][^\n]*/m.exec(clean);
    if (include && include.index !== undefined) {
      const start = include.index;
      const end = start + include[0].length;
      const hasVersionBefore = /^[ \t]*#[ \t]*define[ \t]+LGFX_USE_V1\b/m.test(clean.slice(0, start));
      out = out.slice(0, start) + (hasVersionBefore ? '' : '#define LGFX_USE_V1\n')
        + out.slice(start, end) + '\n' + REAL_LGFX_CLASS_BLOCK + out.slice(end);
    } else {
      out = '#define LGFX_USE_V1\n#include <LovyanGFX.hpp>\n' + REAL_LGFX_CLASS_BLOCK + '\n' + out;
    }
  }

  const clean = withoutComments(out);
  const symbols = withoutCommentsOrStrings(out);
  const usesTone = /\b(?:tone|noTone)\s*\(/.test(symbols);
  const hasToneImplementation = /\b(?:void|int|bool)\s+(?:tone|noTone)\s*\(/.test(symbols)
    || /^\s*#\s*define\s+(?:tone|noTone)\b/m.test(symbols)
    || /\bvidiXLegacyTone\b/.test(symbols);
  if (usesTone && !hasToneImplementation) {
    const includes = [...clean.matchAll(/^[ \t]*#[ \t]*include[ \t]*[<"][^>"]+[>"][^\n]*/gm)];
    const last = includes[includes.length - 1];
    const at = last ? (last.index ?? 0) + last[0].length : 0;
    out = out.slice(0, at) + '\n' + LEGACY_TONE_BLOCK + '\n' + out.slice(at);
  }
  return out;
}

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

  void begin() {
    ensureInit();
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
  let out = addVidiXHardwareSupport(sketchCode);

  const headerComment = [
    `// ============================================================================`,
    `// VIDI X v1.1 (ESP32-WROVER) Real Hardware Export — ${sketchName}`,
    `// Target Board in Arduino IDE: "ESP32 Wrover Module" (PSRAM: Enabled)`,
    `// Required Libraries: LovyanGFX, FastLED, Adafruit_ILI9341 / TFT_eSPI`,
    `// ============================================================================`,
    ``,
  ].join('\n');

  // Enable PSRAM for simple full-screen sprite allocations. Respect sketches
  // that already configure their sprite, including the starter's own fallback.
  const spriteSource = withoutCommentsOrStrings(out);
  const spriteCalls = [...spriteSource.matchAll(/(\b\w+)\.createSprite\(\s*320\s*,\s*240\s*\)\s*;/g)];
  for (const match of spriteCalls.reverse()) {
    const name = match[1];
    if (new RegExp(`\\b${name}\\.setPsram\\s*\\(`).test(spriteSource)) continue;
    const at = match.index ?? 0;
    const replacement = `${name}.setPsram(true);\n  if (!${name}.createSprite(320, 240)) { ${name}.setColorDepth(8); ${name}.createSprite(320, 240); }`;
    out = out.slice(0, at) + replacement + out.slice(at + match[0].length);
  }

  // If sketch uses VidiNetwork, inject the real ESP32 ESP-NOW broadcast implementation
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
