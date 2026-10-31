// VIDI X + external MPU-6050 (0x68/0x69); no sensor driver required.
// VIDIIC shares GPIO32/33 with buttons A/B. Use MENU while connected.
#include <Wire.h>
#include <LovyanGFX.hpp>

LGFX lcd;
int mpuAddress = 0;
int ballX = 160;
int ballY = 128;
int score = 0;
bool previousButton = false;
float rollAngle = 0;
float pitchAngle = 0;

int signedMotionValue() {
  int value = Wire.read() * 256 + Wire.read();
  if (value >= 32768) value -= 65536;
  return value;
}

void setup() {
  Serial.begin(115200);
  pinMode(34, INPUT);
  pinMode(35, INPUT);
  pinMode(13, INPUT_PULLUP);
  pinMode(2, OUTPUT);
  Wire.begin(33, 32);
  for (int address = 0x68; address <= 0x69; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      mpuAddress = address;
      Wire.beginTransmission(address);
      Wire.write(0x6B);
      Wire.write(0);
      Wire.endTransmission();
      break;
    }
  }
  lcd.init();
  lcd.setRotation(1);
  Serial.println(mpuAddress ? "MPU-6050 detected" : "No MPU-6050: use D-pad");
}

void loop() {
  if (mpuAddress != 0) {
    Wire.beginTransmission(mpuAddress);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(mpuAddress, 14);
    if (Wire.available() >= 14) {
      int ax = signedMotionValue();
      int ay = signedMotionValue();
      int az = signedMotionValue();
      int temperature = signedMotionValue();
      int gx = signedMotionValue();
      int gy = signedMotionValue();
      int gz = signedMotionValue();
      rollAngle = atan2((float)ax, sqrt((float)ay * ay + (float)az * az)) * 57.2958;
      pitchAngle = atan2((float)ay, sqrt((float)ax * ax + (float)az * az)) * 57.2958;
      ballX += (int)(rollAngle / 6);
      ballY += (int)(pitchAngle / 6);
      Serial.printf("Gyro deg/s: %.1f %.1f %.1f\n", gx / 131.0, gy / 131.0, gz / 131.0);
    }
  }
  int lr = analogRead(34);
  int ud = analogRead(35);
  if (lr > 3800) ballX -= 5;
  else if (lr > 1500 && lr < 2600) ballX += 5;
  if (ud > 3800) ballY -= 5;
  else if (ud > 1500 && ud < 2600) ballY += 5;
  ballX = constrain(ballX, 12, 308);
  ballY = constrain(ballY, 56, 200);
  bool pressed = digitalRead(13) == LOW;
  if (pressed && !previousButton) { score++; Serial.printf("Score: %d\n", score); }
  previousButton = pressed;
  digitalWrite(2, pressed ? HIGH : LOW);
  lcd.fillScreen(0x0843);
  lcd.fillRect(0, 120 + (int)(pitchAngle / 2), 320, 120, 0x4A69);
  lcd.drawLine(0, 120 + (int)(pitchAngle / 2), 319, 120 + (int)(pitchAngle / 2), 0xFFFF);
  lcd.fillCircle(ballX, ballY, 10, 0xFFE0);
  lcd.fillCircle(ballX, ballY, 5, 0x07E0);
  lcd.setTextColor(0xFFFF, 0x0843);
  lcd.setCursor(8, 8);
  lcd.printf("MPU %s  MENU: SCORE %d", mpuAddress ? "READY" : "NOT FOUND", score);
  delay(40);
}
