#pragma once
class TwoWire {
public:
  void begin(int, int) {}
  void beginTransmission(int) {}
  int endTransmission(bool = true) { return 0; }
  int write(int) { return 1; }
  int requestFrom(int, int) { return 14; }
  int available() { return 14; }
  int read() { return 0; }
};
extern TwoWire Wire;
