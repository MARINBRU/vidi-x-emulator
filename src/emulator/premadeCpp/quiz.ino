// Six-question English VIDI X quiz based on the teacher's guide.
// Choose A/B/C/D with UP/LEFT/RIGHT/DOWN. Press A to restart.
#include <LovyanGFX.hpp>
LGFX lcd;
String questions[6] = {"What is 2 + 2?", "In F=ma, what is m?", "Water contains oxygen and?", "What is the brain of a computer?", "Which unit measures frequency?", "Which device measures temperature?"};
String answersA[6] = {"2", "Mass", "Gold", "GPU", "Hertz", "A speaker"};
String answersB[6] = {"3", "Acceleration", "Hydrogen", "Memory", "Pixels", "A sensor"};
String answersC[6] = {"4", "Force", "Carbon", "Disk", "Celsius", "A screen"};
String answersD[6] = {"5", "Speed", "Copper", "CPU", "Volts", "A button"};
int correct[6] = {2, 0, 1, 3, 0, 1};
int level = 0;
int score = 0;
int previousChoice = -1;
bool dirty = true;

void drawQuiz() {
  lcd.fillScreen(0x0000);
  lcd.setTextColor(0xFFFF, 0x0000);
  lcd.setTextSize(1);
  lcd.setCursor(8, 8);
  lcd.printf("QUESTION %d/6  SCORE %d", min(level + 1, 6), score);
  if (level < 6) {
    lcd.setCursor(8, 30); lcd.print(questions[level]);
    lcd.fillRect(8, 50, 304, 28, 0x0210);
    lcd.fillRect(8, 90, 304, 28, 0x03E0);
    lcd.fillRect(8, 130, 304, 28, 0xA400);
    lcd.fillRect(8, 170, 304, 28, 0x6010);
    lcd.setTextColor(0xFFFF);
    lcd.setCursor(14, 60); lcd.print("A UP: " + answersA[level]);
    lcd.setCursor(14, 100); lcd.print("B LEFT: " + answersB[level]);
    lcd.setCursor(14, 140); lcd.print("C RIGHT: " + answersC[level]);
    lcd.setCursor(14, 180); lcd.print("D DOWN: " + answersD[level]);
  } else {
    lcd.setCursor(8, 50); lcd.printf("Quiz finished! Score %d/6", score);
    lcd.setCursor(8, 85); lcd.print("Press A to play again");
  }
}

void setup() {
  pinMode(34, INPUT);
  pinMode(35, INPUT);
  pinMode(32, INPUT_PULLUP);
  lcd.init();
  lcd.setRotation(1);
  Serial.begin(115200);
}

void loop() {
  if (dirty) { drawQuiz(); dirty = false; }
  int lr = analogRead(34);
  int ud = analogRead(35);
  int choice = -1;
  if (ud > 3800) choice = 0;
  else if (lr > 3800) choice = 1;
  else if (lr > 1500 && lr < 2600) choice = 2;
  else if (ud > 1500 && ud < 2600) choice = 3;
  if (level < 6 && choice >= 0 && previousChoice == -1) {
    if (choice == correct[level]) { score++; Serial.printf("Correct! Score %d\n", score); tone(25, 1000, 70); }
    else { Serial.printf("Not quite. Score %d\n", score); tone(25, 260, 70); }
    level++;
    dirty = true;
  } else if (level >= 6 && digitalRead(32) == LOW) {
    level = 0; score = 0; dirty = true;
  }
  previousChoice = choice;
  delay(40);
}
