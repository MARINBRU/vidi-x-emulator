// Minimal host-side Arduino-shaped declarations for C++ syntax checking only.
// These are not a hardware SDK and do not establish VIDI X compatibility.
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define SERIAL_8N1 0
#define VSPI_HOST 3
#define PI 3.14159265358979323846
#define TWO_PI (2.0 * PI)

class String : public std::string {
public:
  using std::string::string;
  String() = default;
  String(const std::string &s) : std::string(s) {}
  String(int n) : std::string(std::to_string(n)) {}
};
inline String operator+(const char *s, const String &v) { return String(std::string(s) + v); }
inline String operator+(const String &a, const String &b) { return String(std::string(a) + std::string(b)); }

struct FakeSerial {
  void begin(int, int = 0, int = -1, int = -1) {}
  template<typename... T> void print(T...) {}
  template<typename... T> void println(T...) {}
  template<typename... T> void printf(T...) {}
  int available() { return 0; }
  String readString() { return String(); }
};
extern FakeSerial Serial, Serial2;
inline void pinMode(int, int) {}
inline int digitalRead(int) { return HIGH; }
inline void digitalWrite(int, int) {}
inline int analogRead(int) { return 0; }
inline void delay(unsigned long) {}
inline void ledcSetup(int, int, int) {}
inline void ledcAttachPin(int, int) {}
inline void ledcWriteTone(int, int) {}
inline void ledcDetachPin(int) {}
template<typename T> T min(T a, T b) { return a < b ? a : b; }
template<typename T> T max(T a, T b) { return a > b ? a : b; }
template<typename T> T constrain(T x, T a, T b) { return max(a, min(x, b)); }
