# VIDI X v1.1 CircuitPython starter (uses CircuitPython 9 APIs).
# False: D-pad only. True: D-pad and tilt from an EXTERNAL MPU-6050.
# No extra sensor library is required in either mode.
USE_MPU6050 = True

import time
import board
import displayio
import terminalio
import analogio
import digitalio
import math

# Optional external MPU-6050: connect to VIDIIC and common GND (3.3 V logic).
# SCL is GPIO 32; SDA is GPIO 33. Check the breakout's power requirements.
# No sensor library is required; this demo reads the chip's I2C registers.
# SCL/SDA share GPIO 32/33 with A/B, so MENU is used when gyro mode is on.
# Most MPU-6050 modules use 0x68. If AD0 is connected high, use 0x69.
MPU6050_ADDRESS = 0x68
mpu_ready = False
i2c = None
mpu_data = bytearray(14)
mpu_motion_register = bytes([0x3B])

if USE_MPU6050:
    action_pin = board.MENU
    try:
        i2c = board.VIDIIC()
        if i2c.try_lock():
            try:
                # Identify the MPU-6050 before writing configuration registers.
                who = bytearray(1)
                i2c.writeto_then_readfrom(MPU6050_ADDRESS, bytes([0x75]), who)
                if who[0] == 0x68:
                    i2c.writeto(MPU6050_ADDRESS, bytes([0x6B, 0x00]))  # Wake
                    time.sleep(0.1)
                    i2c.writeto(MPU6050_ADDRESS, bytes([0x1C, 0x00]))  # +/-2g
                    i2c.writeto(MPU6050_ADDRESS, bytes([0x1B, 0x00]))  # +/-250 deg/s
                    mpu_ready = True
                else:
                    print("[VIDI X] Device at MPU address is not an MPU-6050.")
            finally:
                i2c.unlock()
        else:
            print("[VIDI X] VIDIIC is busy; using D-pad only.")
    except (OSError, ValueError, RuntimeError) as error:
        print("[VIDI X] MPU-6050 unavailable; using D-pad only:", error)
    if not mpu_ready and i2c is not None:
        i2c.deinit()  # Free GPIO 32/33 when the sensor is not available.
        i2c = None
else:
    action_pin = board.BTN_A


def signed16(high, low):
    value = high * 256 + low
    if value >= 32768:
        value = value - 65536
    return value

button = digitalio.DigitalInOut(action_pin)
button.switch_to_input(pull=digitalio.Pull.UP)
led = digitalio.DigitalInOut(board.STATUS)
led.switch_to_output(value=False)
btn_lr = analogio.AnalogIn(board.BTN_L_R)
btn_ud = analogio.AnalogIn(board.BTN_UP_DOWN)

# board.DISPLAY is already initialized by the VIDI X CircuitPython firmware.
# Use displayio's scene graph rather than display.fill()/text()/circle().
display = board.DISPLAY
scene = displayio.Group()
bg = displayio.Bitmap(display.width, display.height, 1)
bg_colors = displayio.Palette(1)
bg_colors[0] = 0x0A1220
scene.append(displayio.TileGrid(bg, pixel_shader=bg_colors))

# Text using the built-in terminal font: no adafruit_display_text required.
font = terminalio.FONT
font_w, font_h = font.get_bounding_box()
text_colors = displayio.Palette(2)
text_colors[0] = 0x0A1220
text_colors[1] = 0xDDEEFF
heading_grid = displayio.TileGrid(font.bitmap, pixel_shader=text_colors,
                                  width=42, height=2, tile_width=font_w,
                                  tile_height=font_h, x=8, y=6)
scene.append(heading_grid)
heading = terminalio.Terminal(heading_grid, font)
if USE_MPU6050:
    heading.write("VIDI X CIRCUITPYTHON\r\nD-PAD / TILT: MOVE   MENU: SCORE")
else:
    heading.write("VIDI X CIRCUITPYTHON\r\nD-PAD: MOVE   A: SCORE")

status_grid = displayio.TileGrid(font.bitmap, pixel_shader=text_colors,
                                 width=42, height=1, tile_width=font_w,
                                 tile_height=font_h, x=8, y=32)
scene.append(status_grid)
status_text = terminalio.Terminal(status_grid, font)
if USE_MPU6050 and mpu_ready:
    status_text.write("MPU-6050 CONNECTED")
elif USE_MPU6050:
    status_text.write("NO MPU-6050: D-PAD ONLY")
else:
    status_text.write("MPU-6050 OFF")

score_grid = displayio.TileGrid(font.bitmap, pixel_shader=text_colors,
                                width=16, height=1, tile_width=font_w,
                                tile_height=font_h, x=8, y=214)
scene.append(score_grid)
score_text = terminalio.Terminal(score_grid, font)
score_text.write("SCORE: 0")

# Draw the ball once into a transparent bitmap and move its TileGrid.
ball_bitmap = displayio.Bitmap(24, 24, 3)
ball_colors = displayio.Palette(3)
ball_colors[0] = 0x000000
ball_colors[1] = 0xFFEE00
ball_colors[2] = 0x22EE55
ball_colors.make_transparent(0)
for y in range(24):
    for x in range(24):
        dx = x - 12
        dy = y - 12
        distance = dx * dx + dy * dy
        if distance <= 36:
            ball_bitmap[y * 24 + x] = 2
        elif distance <= 121:
            ball_bitmap[y * 24 + x] = 1

ball_x = 160
ball_y = 128
ball = displayio.TileGrid(ball_bitmap, pixel_shader=ball_colors, x=ball_x - 12, y=ball_y - 12)
scene.append(ball)
display.root_group = scene
score = 0
was_pressed = False
last_gyro_update = 0
print("[VIDI X] Ready. Move with the D-pad; press A to score (MENU with MPU-6050).")

while True:
    if mpu_ready:
        try:
            if i2c.try_lock():
                try:
                    # Burst: ax, ay, az, temperature, gx, gy, gz (big-endian).
                    i2c.writeto_then_readfrom(MPU6050_ADDRESS, mpu_motion_register, mpu_data)
                finally:
                    i2c.unlock()

                ax = signed16(mpu_data[0], mpu_data[1])
                ay = signed16(mpu_data[2], mpu_data[3])
                az = signed16(mpu_data[4], mpu_data[5])
                gx = signed16(mpu_data[8], mpu_data[9]) / 131.0
                gy = signed16(mpu_data[10], mpu_data[11]) / 131.0
                gz = signed16(mpu_data[12], mpu_data[13]) / 131.0

                # Tilt is estimated from acceleration, not gyro angular rate.
                # This is approximate static inclination, not sensor fusion.
                roll = math.degrees(math.atan2(ax, math.sqrt(ay * ay + az * az)))
                pitch = math.degrees(math.atan2(ay, math.sqrt(ax * ax + az * az)))
                ball_x = ball_x + int(roll / 6)
                ball_y = ball_y + int(pitch / 6)
                if time.monotonic() - last_gyro_update >= 0.5:
                    status_text.write("\rGYRO: " + str(int(gx)) + "," + str(int(gy)) + "," + str(int(gz)) + " deg/s       ")
                    last_gyro_update = time.monotonic()
        except (OSError, ValueError, RuntimeError) as error:
            print("[VIDI X] MPU-6050 read failed; using D-pad only:", error)
            mpu_ready = False
            i2c.deinit()
            i2c = None
            status_text.write("\rMPU READ ERROR: D-PAD ONLY           ")

    if btn_lr.value > 60000:
        ball_x = ball_x - 5
    elif btn_lr.value > 25000 and btn_lr.value < 45000:
        ball_x = ball_x + 5
    if btn_ud.value > 60000:
        ball_y = ball_y - 5
    elif btn_ud.value > 25000 and btn_ud.value < 45000:
        ball_y = ball_y + 5

    ball_x = max(12, min(display.width - 12, ball_x))
    ball_y = max(56, min(200, ball_y))
    ball.x = ball_x - 12
    ball.y = ball_y - 12

    pressed = not button.value
    if pressed and not was_pressed:
        score = score + 1
        score_text.write("\rSCORE: " + str(score))
    was_pressed = pressed
    led.value = pressed
    time.sleep(0.025)
