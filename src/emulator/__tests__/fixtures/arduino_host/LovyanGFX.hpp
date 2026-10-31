#pragma once
#include "Arduino.h"
namespace lgfx {
struct BusConfig {
  int spi_host, spi_mode, freq_write, freq_read, dma_channel;
  int pin_sclk, pin_mosi, pin_miso, pin_dc;
  bool spi_3wire, use_lock;
};
struct PanelConfig {
  int pin_cs, pin_rst, pin_busy, memory_width, memory_height, panel_width, panel_height;
  int offset_x, offset_y, offset_rotation, dummy_read_pixel, dummy_read_bits;
  bool readable, invert, rgb_order, dlen_16bit, bus_shared;
};
class Bus_SPI {
public:
  BusConfig config() { return {}; }
  void config(const BusConfig &) {}
};
struct TouchConfig {
  int spi_host, freq, pin_sclk, pin_mosi, pin_miso, pin_cs, pin_int;
  int offset_rotation, x_min, x_max, y_min, y_max;
  bool bus_shared;
};
class Touch_XPT2046 {
public:
  TouchConfig config() { return {}; }
  void config(const TouchConfig &) {}
};
class Panel_ILI9341 {
public:
  PanelConfig config() { return {}; }
  void config(const PanelConfig &) {}
  void setBus(Bus_SPI *) {}
  void setTouch(Touch_XPT2046 *) {}
};
class LGFX_Device {
public:
  void setPanel(Panel_ILI9341 *) {}
  void init() {}
  void setRotation(int) {}
  void fillScreen(int) {}
  void fillRect(int, int, int, int, int) {}
  void drawLine(int, int, int, int, int) {}
  void fillCircle(int, int, int, int) {}
  void setTextColor(int, int = 0) {}
  void setTextSize(int) {}
  void setCursor(int, int) {}
  void calibrateTouch(uint16_t *, int, int, int) {}
  void setTouchCalibrate(uint16_t *) {}
  bool getTouch(uint16_t *, uint16_t *) { return false; }
  template<typename... T> void print(T...) {}
  template<typename... T> void printf(T...) {}
};
}

class LGFX_Sprite {
public:
  explicit LGFX_Sprite(lgfx::LGFX_Device *) {}
  void setPsram(bool) {}
  void setColorDepth(int) {}
  bool createSprite(int, int) { return true; }
  void pushSprite(int, int) {}
  void fillRect(int, int, int, int, int) {}
  void drawRect(int, int, int, int, int) {}
  void fillRoundRect(int, int, int, int, int, int) {}
  void drawRoundRect(int, int, int, int, int, int) {}
  void fillCircle(int, int, int, int) {}
  void fillEllipse(int, int, int, int, int) {}
  void drawEllipse(int, int, int, int, int) {}
  void drawFastVLine(int, int, int, int) {}
  void drawLine(int, int, int, int, int) {}
  void setTextColor(int, int = 0) {}
  void setTextSize(int) {}
  void setCursor(int, int) {}
  template<typename... T> void print(T...) {}
  template<typename... T> void printf(T...) {}
};
