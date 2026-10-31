# VIDI X CircuitPython example. Uses built-in CircuitPython 9 modules.
# The display is already initialized by the VIDI X firmware.
import time
import math
import board
import displayio
import bitmaptools
import terminalio
import analogio
import digitalio
import pwmio

screen = board.DISPLAY
scene = displayio.Group()
canvas = displayio.Bitmap(160, 120, 16)
colors = displayio.Palette(16)
colors[0] = 0x000000
colors[1] = 0x101C34
colors[2] = 0x303C50
colors[3] = 0x3366AA
colors[4] = 0x00AAAA
colors[5] = 0x00FFFF
colors[6] = 0xFFCC33
colors[7] = 0xFF6622
colors[8] = 0xEE3344
colors[9] = 0x66EE66
colors[10] = 0xFF66CC
colors[11] = 0xFFFFFF
colors[12] = 0x222244
colors[13] = 0x553355
colors[14] = 0x557755
colors[15] = 0x999999
large = displayio.Group(scale=2)
large.append(displayio.TileGrid(canvas, pixel_shader=colors))
scene.append(large)
font = terminalio.FONT
font_w, font_h = font.get_bounding_box()
text_colors = displayio.Palette(2)
text_colors[0] = 0x000000
text_colors[1] = 0xFFFFFF
text_grid = displayio.TileGrid(font.bitmap, pixel_shader=text_colors,
                               width=40, height=1, tile_width=font_w,
                               tile_height=font_h, x=4, y=2)
scene.append(text_grid)
text = terminalio.Terminal(text_grid, font)
screen.root_group = scene

left_right = analogio.AnalogIn(board.BTN_L_R)
up_down = analogio.AnalogIn(board.BTN_UP_DOWN)
button_a = digitalio.DigitalInOut(board.BTN_A)
button_a.switch_to_input(pull=digitalio.Pull.UP)
button_b = digitalio.DigitalInOut(board.BTN_B)
button_b.switch_to_input(pull=digitalio.Pull.UP)
speaker = pwmio.PWMOut(board.GPIO25, frequency=440, duty_cycle=0, variable_frequency=True)
sound_until = 0


def rectangle(x, y, width, height, color):
    x1 = max(0, min(160, int(x)))
    y1 = max(0, min(120, int(y)))
    x2 = max(0, min(160, int(x + width)))
    y2 = max(0, min(120, int(y + height)))
    if x2 > x1 and y2 > y1:
        bitmaptools.fill_region(canvas, x1, y1, x2, y2, color)


def line(x1, y1, x2, y2, color):
    bitmaptools.draw_line(canvas, int(x1), int(y1), int(x2), int(y2), color)


def hud(message):
    text.write("\r" + message + "    ")


def beep(frequency):
    global sound_until
    speaker.frequency = frequency
    speaker.duty_cycle = 18000
    sound_until = time.monotonic() + 0.08


def frame_pause():
    if time.monotonic() >= sound_until:
        speaker.duty_cycle = 0
    time.sleep(0.04)
