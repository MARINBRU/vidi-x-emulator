// VIDI X WIRE BRIDGE: TX15 RX27
// UART: cross GPIO15 (TX) to GPIO27 (RX), and connect both grounds.
// GPIO26 -> GPIO14 is the optional digital signal. These share the RGB LEDs
// and microphone; GPIO15/27 also share IR TX / SELECT. Disconnect those uses.
// Do not use GPIO16/17: they are reserved for WROVER PSRAM.
#include <LovyanGFX.hpp>
LGFX lcd;
int sent = 0;
int received = 0;
String lastMessage = "Waiting for data";
bool oldB = false;

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 27, 15);
  pinMode(26, OUTPUT);
  pinMode(14, INPUT);
  pinMode(32, INPUT_PULLUP);
  pinMode(33, INPUT_PULLUP);
  lcd.init();
  lcd.setRotation(1);
}

void loop() {
  digitalWrite(26, digitalRead(32) == LOW ? HIGH : LOW);
  bool pressedB = digitalRead(33) == LOW;
  if (pressedB && !oldB) {
    sent++;
    Serial2.println(String("FRAME#") + String(sent));
    tone(25, 880, 35);
  }
  oldB = pressedB;
  if (Serial2.available() > 0) {
    lastMessage = Serial2.readString();
    received++;
    tone(25, 1174, 45);
  }
  lcd.fillScreen(0x0000);
  lcd.setTextColor(0xFFFF, 0x0000);
  lcd.setCursor(8, 8); lcd.print("WIRED GPIO / UART BRIDGE");
  lcd.setCursor(8, 38); lcd.print("GPIO15 TX -> GPIO27 RX; GND -> GND");
  lcd.setCursor(8, 65); lcd.printf("A: GPIO26 output. GPIO14 input: %d", digitalRead(14));
  lcd.setCursor(8, 95); lcd.printf("B: SEND    TX %d    RX %d", sent, received);
  lcd.setCursor(8, 125); lcd.print(lastMessage);
  delay(60);
}
