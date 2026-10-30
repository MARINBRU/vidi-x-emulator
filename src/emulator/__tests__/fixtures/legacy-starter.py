# VIDI X CircuitPython (.py) — Saved in Browser Cookies
# Board: VIDI X V1.1 + VIDIIC I2C MPU-6050 6-DoF Gyroscope (0x68 on SCL=32, SDA=33)
import time
import board
import digitalio
import analogio
import simpleio
import neopixel
import xpt2046_circuitpython
import adafruit_mpu6050

display = board.DISPLAY
touch = xpt2046_circuitpython.Touch(board.SPI(), cs=digitalio.DigitalInOut(board.TOUCH_CS))
pixels = neopixel.NeoPixel(board.RGB_LED, 5, auto_write=True)
led = digitalio.DigitalInOut(board.STATUS)
led.direction = digitalio.Direction.OUTPUT

btn_a = digitalio.DigitalInOut(board.BTN_A)
btn_a.switch_to_input(digitalio.Pull.UP)
btn_lr = analogio.AnalogIn(board.BTN_L_R)
btn_ud = analogio.AnalogIn(board.BTN_UP_DOWN)

# Initialize MPU-6050 6-DoF Gyroscope + Accelerometer on VIDIIC I2C bus
i2c = board.VIDIIC()
mpu = adafruit_mpu6050.MPU6050(i2c)

ball_x = 160
ball_y = 128
score = 0

print("[VIDI X CircuitPython] Ready! Tilt board via SENSORS / GYRO or use D-Pad.")

while True:
    ax, ay, az = mpu.acceleration
    gx, gy, gz = mpu.gyro
    roll = int(mpu.roll)
    pitch = int(mpu.pitch)

    # Move ball with Gyroscope tilt OR D-Pad buttons
    ball_x = ball_x + int(roll / 6)
    ball_y = ball_y + int(pitch / 6)

    if btn_lr.value > 60000:
        ball_x = ball_x - 5
    elif btn_lr.value > 25000 and btn_lr.value < 45000:
        ball_x = ball_x + 5

    if btn_ud.value > 60000:
        ball_y = ball_y - 5
    elif btn_ud.value > 25000 and btn_ud.value < 45000:
        ball_y = ball_y + 5

    tx, ty = touch.get_coordinates()
    if tx is not None and ty is not None:
        ball_x = tx
        ball_y = ty

    ball_x = max(20, min(300, ball_x))
    ball_y = max(40, min(215, ball_y))

    if not btn_a.value:
        score = score + 1
        led.value = True
        pixels.fill(0x00E5FF)
        simpleio.tone(board.GPIO25, 660, duration=0.05)
    else:
        led.value = False

    display.fill(0x0A1220)
    display.fill_rectangle(0, 0, 320, 22, 0x162238)
    display.text("VIDI X CIRCUITPYTHON + GYRO", 8, 7, 0x00E5FF, 1)
    display.text("SCORE:" + str(score), 245, 7, 0xFFEE00, 1)

    # Artificial horizon reference crosshairs
    display.line(20, 128, 300, 128, 0x243450)
    display.line(160, 36, 160, 220, 0x243450)
    display.rect(12, 28, 296, 198, 0x334868)

    # Draw tilt-controlled ball
    display.circle(ball_x, ball_y, 12, 0xFFEE00, False)
    display.circle(ball_x, ball_y, 6, 0x22EE55, True)

    # Gyro & Accelerometer telemetry footer
    display.text(f"Roll:{roll}d Pitch:{pitch}d AccX:{ax:.1f} AccY:{ay:.1f}", 16, 214, 0xCCCCCC, 1)

    time.sleep(0.025)
