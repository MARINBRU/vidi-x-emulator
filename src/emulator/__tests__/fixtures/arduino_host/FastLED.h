// Minimal FastLED-shaped declarations for host syntax tests only.
#pragma once
#include <stdint.h>

enum EOrder { GRB };
template<uint8_t PIN, EOrder ORDER> class WS2812B {};

struct CRGB {
  static CRGB Black;
  static CRGB Gold;
};

class FastLEDClass {
public:
  template<template<uint8_t, EOrder> class CHIPSET, uint8_t PIN, EOrder ORDER>
  void addLeds(CRGB *, int) {}
  void setBrightness(int) {}
  void show() {}
};
extern FastLEDClass FastLED;
