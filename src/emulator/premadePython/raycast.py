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
depth = [0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,
         0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]


def move_player():
    global player_x, player_y, player_angle
    lr = left_right.value
    ud = up_down.value
    if lr > 60000:
        player_angle = player_angle - 0.08
    elif lr > 25000 and lr < 45000:
        player_angle = player_angle + 0.08
    distance = 0.0
    if ud > 60000:
        distance = 0.1
    elif ud > 25000 and ud < 45000:
        distance = -0.08
    next_x = player_x + math.cos(player_angle) * distance
    next_y = player_y + math.sin(player_angle) * distance
    if world[int(player_y) * 10 + int(next_x)] == 0:
        player_x = next_x
    if world[int(next_y) * 10 + int(player_x)] == 0:
        player_y = next_y


def render_walls():
    canvas.fill(0)
    rectangle(0, 0, 160, 60, 1)
    rectangle(0, 60, 160, 60, 12)
    for col in range(80):
        ray = player_angle - 0.523599 + col * 1.047198 / 80
        rc = math.cos(ray)
        rs = math.sin(ray)
        if abs(rc) < 0.0001:
            rc = 0.0001
        if abs(rs) < 0.0001:
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
        distance = max(0.15, distance * math.cos(ray - player_angle))
        depth[col] = distance
        wall_height = min(110, int(104 / distance))
        color = 3
        if wall == 2:
            color = 4
        elif wall == 3:
            color = 7
        if distance > 5:
            color = 2
        rectangle(col * 2, 60 - int(wall_height / 2), 2, wall_height, color)


def render_sprite(object_x, object_y, color, kind):
    # Project with camera-space coordinates, and depth-test every visible strip.
    dx = object_x - player_x
    dy = object_y - player_y
    forward = dx * math.cos(player_angle) + dy * math.sin(player_angle)
    sideways = -dx * math.sin(player_angle) + dy * math.cos(player_angle)
    if forward > 0.18:
        center = int(80 + sideways / forward * 138.56)
        half_width = max(2, min(24, int(11 / forward)))
        height = max(4, min(60, int(48 / forward)))
        if kind == 1:
            half_width = max(2, int(half_width / 2))
            height = max(4, int(height / 2))
        for stripe in range(80):
            strip_x = stripe * 2
            if strip_x >= center - half_width and strip_x <= center + half_width:
                if forward < depth[stripe] + 0.08:
                    rectangle(strip_x, 60 - int(height / 2), 2, height, color)


def draw_map():
    rectangle(115, 2, 43, 43, 0)
    for index in range(100):
        cell = world[index]
        if cell > 0:
            map_x = index % 10
            map_y = int(index / 10)
            rectangle(116 + map_x * 4, 3 + map_y * 4, 3, 3, 2 + cell)
    rectangle(116 + int(player_x * 4) - 1, 3 + int(player_y * 4) - 1, 3, 3, 9)
    line(116 + int(player_x * 4), 3 + int(player_y * 4),
         116 + int((player_x + math.cos(player_angle)) * 4),
         3 + int((player_y + math.sin(player_angle)) * 4), 9)
