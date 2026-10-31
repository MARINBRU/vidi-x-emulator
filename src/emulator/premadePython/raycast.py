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
