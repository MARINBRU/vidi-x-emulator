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

# The optional neopixel library drives the five RGB LEDs on GPIO 26.
# When it is not installed, the rest of the example still runs.
leds = None
try:
    import neopixel
    leds = neopixel.NeoPixel(board.RGB_LED, 5, brightness=0.1, auto_write=True)
except (ImportError, ValueError, RuntimeError) as error:
    print("[VIDI X] RGB LEDs unavailable:", error)

# A 10x10 raycasting engine. Angles use radians and distances are wall-corrected.
world = [
    1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,1,
    1,0,2,2,0,0,3,3,0,1,
    1,0,2,0,0,0,0,3,0,1,
    1,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,1,
    1,0,3,0,0,0,0,2,0,1,
    1,0,3,3,0,0,2,2,0,1,
    1,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,
]
player_x = 1.5
player_y = 4.5
player_angle = 0.0
# Draw into the bitmap first, then send one completed frame to the LCD.
# Automatic displayio refresh would otherwise show partial sky/wall redraws.
screen.auto_refresh = False
RAY_COUNT = 40
STRIP_WIDTH = 4
depth = []
for i in range(RAY_COUNT):
    depth.append(0.0)
view_cos = 1.0
view_sin = 0.0
last_frame_time = time.monotonic()
last_control_time = last_frame_time

# The maze walls do not change. On CircuitPython 9, build the minimap once
# and copy it in C each frame. CircuitPython 8 lacks blit, so fall back to
# drawing the wall tiles directly without requiring a firmware upgrade.
use_map_blit = hasattr(bitmaptools, "blit")
map_bitmap = None
if use_map_blit:
    map_bitmap = displayio.Bitmap(43, 43, 16)
    for index in range(100):
        cell = world[index]
        if cell > 0:
            map_x = index % 10
            map_y = int(index / 10)
            mx = 1 + map_x * 4
            my = 1 + map_y * 4
            bitmaptools.fill_region(map_bitmap, mx, my, mx + 3, my + 3, 2 + cell)


def present_3d():
    global last_frame_time
    # refresh() with no FPS target sends immediately and does not skip slow
    # frames. Never rely on displayio's auto refresh midway through drawing.
    screen.refresh()
    if time.monotonic() >= sound_until:
        speaker.duty_cycle = 0
    remaining = 0.04 - (time.monotonic() - last_frame_time)
    if remaining > 0:
        time.sleep(remaining)
    else:
        time.sleep(0.001)
    last_frame_time = time.monotonic()


def idle_3d():
    if time.monotonic() >= sound_until:
        speaker.duty_cycle = 0
    time.sleep(0.02)


def move_player():
    global player_x, player_y, player_angle, last_control_time
    now = time.monotonic()
    # Keep controls responsive on slower boards without allowing a long pause
    # to move the player through a wall in one update.
    step_scale = min(3.0, max(0.25, (now - last_control_time) / 0.04))
    last_control_time = now
    lr = left_right.value
    ud = up_down.value
    if lr > 60000:
        player_angle = player_angle - 0.08 * step_scale
    elif lr > 25000 and lr < 45000:
        player_angle = player_angle + 0.08 * step_scale
    distance = 0.0
    if ud > 60000:
        distance = 0.1 * step_scale
    elif ud > 25000 and ud < 45000:
        distance = -0.08 * step_scale
    if distance != 0:
        next_x = player_x + math.cos(player_angle) * distance
        next_y = player_y + math.sin(player_angle) * distance
        if world[int(player_y) * 10 + int(next_x)] == 0:
            player_x = next_x
        if world[int(next_y) * 10 + int(player_x)] == 0:
            player_y = next_y


def render_walls():
    global view_cos, view_sin
    # Fill both halves directly; there is no need to clear the entire bitmap.
    bitmaptools.fill_region(canvas, 0, 0, 160, 60, 1)
    bitmaptools.fill_region(canvas, 0, 60, 160, 120, 12)
    # A camera plane gives perpendicular DDA distances without a sine/cosine
    # for every column. Forty rays are four pixels wide on the 160px bitmap.
    view_cos = math.cos(player_angle)
    view_sin = math.sin(player_angle)
    plane_x = -view_sin * 0.57735
    plane_y = view_cos * 0.57735
    for col in range(RAY_COUNT):
        camera_x = col * 0.05 - 1.0
        rc = view_cos + plane_x * camera_x
        rs = view_sin + plane_y * camera_x
        if rc == 0:
            rc = 0.0001
        if rs == 0:
            rs = 0.0001
        mx = int(player_x)
        my = int(player_y)
        ddx = abs(1.0 / rc)
        ddy = abs(1.0 / rs)
        sx = 1
        sy = 1
        if rc < 0:
            sx = -1
        if rs < 0:
            sy = -1
        side_x = (mx + 1 - player_x) * ddx
        side_y = (my + 1 - player_y) * ddy
        if sx < 0:
            side_x = (player_x - mx) * ddx
        if sy < 0:
            side_y = (player_y - my) * ddy
        wall = 0
        side = 0
        steps = 0
        while wall == 0 and steps < 24:
            if side_x < side_y:
                side_x = side_x + ddx
                mx = mx + sx
                side = 0
            else:
                side_y = side_y + ddy
                my = my + sy
                side = 1
            if mx < 0 or mx > 9 or my < 0 or my > 9:
                wall = 1
            else:
                wall = world[my * 10 + mx]
            steps = steps + 1
        distance = side_y - ddy
        if side == 0:
            distance = side_x - ddx
        distance = max(0.15, distance)
        depth[col] = distance
        wall_height = min(110, int(104 / distance))
        color = 3
        if wall == 2:
            color = 4
        elif wall == 3:
            color = 7
        if distance > 5:
            color = 2
        x = col * STRIP_WIDTH
        y = 60 - int(wall_height / 2)
        bitmaptools.fill_region(canvas, x, y, x + STRIP_WIDTH, y + wall_height, color)

def render_sprite(object_x, object_y, color, kind):
    # Project with the same camera as the walls, and depth-test visible strips.
    dx = object_x - player_x
    dy = object_y - player_y
    forward = dx * view_cos + dy * view_sin
    sideways = -dx * view_sin + dy * view_cos
    if forward > 0.18:
        center = int(80 + sideways / forward * 138.56)
        half_width = max(2, min(24, int(11 / forward)))
        height = max(4, min(60, int(48 / forward)))
        if kind == 1:
            half_width = max(2, int(half_width / 2))
            height = max(4, int(height / 2))
        if center + half_width >= 0 and center - half_width < 160:
            first = max(0, int((center - half_width) / STRIP_WIDTH))
            last = min(RAY_COUNT - 1, int((center + half_width) / STRIP_WIDTH))
            for stripe in range(first, last + 1):
                if forward < depth[stripe] + 0.08:
                    rectangle(stripe * STRIP_WIDTH, 60 - int(height / 2), STRIP_WIDTH, height, color)

def draw_map():
    if use_map_blit:
        bitmaptools.blit(canvas, map_bitmap, 115, 2)
    else:
        rectangle(115, 2, 43, 43, 0)
        for index in range(100):
            cell = world[index]
            if cell > 0:
                map_x = index % 10
                map_y = int(index / 10)
                rectangle(116 + map_x * 4, 3 + map_y * 4, 3, 3, 2 + cell)
    rectangle(116 + int(player_x * 4) - 1, 3 + int(player_y * 4) - 1, 3, 3, 9)
    line(116 + int(player_x * 4), 3 + int(player_y * 4),
         116 + int((player_x + view_cos) * 4),
         3 + int((player_y + view_sin) * 4), 9)

# 3D maze: D-pad moves and turns, B toggles the map (or restarts on victory).
player_x = 1.5
player_y = 1.5
coin_x = [3.5, 8.5, 1.5, 6.5, 8.5]
coin_y = [1.5, 1.5, 7.5, 5.5, 8.5]
coin_taken = [0, 0, 0, 0, 0]
collected = 0
show_map = True
old_b = False
old_a = False
first_frame = True

while True:
    previous_x = player_x
    previous_y = player_y
    previous_angle = player_angle
    previous_coins = collected
    previous_map = show_map
    move_player()
    for i in range(5):
        dx = coin_x[i] - player_x
        dy = coin_y[i] - player_y
        if coin_taken[i] == 0 and dx * dx + dy * dy < 0.30:
            coin_taken[i] = 1
            collected = collected + 1
            beep(880)
            if leds is not None:
                leds[i] = 0xFFAA00
    pressed_b = button_b.value == False
    pressed_a = button_a.value == False
    if pressed_b and old_b == False:
        if collected == 5:
            collected = 0
            coin_taken = [0, 0, 0, 0, 0]
            player_x = 1.5
            player_y = 1.5
            player_angle = 0.0
            if leds is not None:
                leds.fill(0)
        else:
            show_map = show_map == False
    if pressed_a and old_a == False:
        beep(650)
    old_a = pressed_a
    old_b = pressed_b
    # A still scene does not need to be cleared and sent to the LCD again.
    redraw = first_frame or player_x != previous_x or player_y != previous_y or player_angle != previous_angle
    redraw = redraw or collected != previous_coins or show_map != previous_map
    if redraw:
        render_walls()
        # Draw farthest first so nearer coins cover farther coins.
        order = [0, 1, 2, 3, 4]
        for i in range(5):
            for j in range(i + 1, 5):
                a = order[i]
                b = order[j]
                da = (coin_x[a] - player_x) * (coin_x[a] - player_x) + (coin_y[a] - player_y) * (coin_y[a] - player_y)
                db = (coin_x[b] - player_x) * (coin_x[b] - player_x) + (coin_y[b] - player_y) * (coin_y[b] - player_y)
                if db > da:
                    order[i] = b
                    order[j] = a
        for position in range(5):
            i = order[position]
            if coin_taken[i] == 0:
                render_sprite(coin_x[i], coin_y[i], 6, 1)
        if show_map:
            draw_map()
            for i in range(5):
                if coin_taken[i] == 0:
                    rectangle(116 + int(coin_x[i] * 4), 3 + int(coin_y[i] * 4), 2, 2, 6)
        if collected == 5:
            hud("MAZE CLEARED! B: RESTART")
        else:
            hud("COINS " + str(collected) + "/5  B: MAP")
        present_3d()
        first_frame = False
    else:
        idle_3d()
