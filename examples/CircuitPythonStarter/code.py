# VIDI X v1.1 CircuitPython starter (uses CircuitPython 9 APIs).
# No extra libraries or sensors are needed for the default D-pad demo.
# To use an EXTERNAL MPU-6050, see the instructions below and set this to True.
USE_MPU6050 = False

import time
import board
import displayio
import terminalio
import analogio
import digitalio
import math

# Optional external MPU-6050: install adafruit_mpu6050, adafruit_bus_device,
# and adafruit_register in the board filesystem /lib. Connect to VIDIIC.
# VIDIIC uses the same GPIOs as A/B, so use MENU instead while I2C is active.
# Leave USE_MPU6050 False if the library or sensor is not present.
mpu = None
if USE_MPU6050:
    import adafruit_mpu6050
    i2c = board.VIDIIC()
    mpu = adafruit_mpu6050.MPU6050(i2c)
    action_pin = board.MENU
else:
    action_pin = board.BTN_A

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
print("[VIDI X] Ready. Move with the D-pad; press A to score (MENU with MPU-6050).")

while True:
    if mpu is not None:
        # Inclination from acceleration (m/s^2); the driver has no roll/pitch
        # properties. This is an approximate static tilt, not sensor fusion.
        ax, ay, az = mpu.acceleration
        roll = math.degrees(math.atan2(ax, math.sqrt(ay * ay + az * az)))
        pitch = math.degrees(math.atan2(ay, math.sqrt(ax * ax + az * az)))
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

    ball_x = max(12, min(display.width - 12, ball_x))
    ball_y = max(45, min(200, ball_y))
    ball.x = ball_x - 12
    ball.y = ball_y - 12

    pressed = not button.value
    if pressed and not was_pressed:
        score = score + 1
        score_text.write("\rSCORE: " + str(score))
    was_pressed = pressed
    led.value = pressed
    time.sleep(0.025)
