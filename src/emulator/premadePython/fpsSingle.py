# Single-player FPS: D-pad moves/turns, A shoots, B reloads or restarts.
player_x = 1.5
player_y = 4.5
drone_x = [8.2, 8.2, 2.5, 6.5]
drone_y = [1.8, 8.2, 7.5, 3.5]
drone_hp = [100, 100, 100, 100]
hp = 100
ammo = 24
kills = 0
old_a = False
old_b = False
frame = 0

while True:
    frame = frame + 1
    move_player()
    pressed_a = button_a.value == False
    pressed_b = button_b.value == False
    if pressed_a and old_a == False and ammo > 0 and hp > 0:
        ammo = ammo - 1
        beep(980)
        target = -1
        nearest = 99.0
        for i in range(4):
            dx = drone_x[i] - player_x
            dy = drone_y[i] - player_y
            forward = dx * math.cos(player_angle) + dy * math.sin(player_angle)
            sideways = -dx * math.sin(player_angle) + dy * math.cos(player_angle)
            if drone_hp[i] > 0 and forward > 0.2 and abs(sideways) < 0.3:
                if forward < nearest and forward < depth[int(RAY_COUNT / 2)] + 0.08:
                    target = i
                    nearest = forward
        if target >= 0:
            drone_hp[target] = drone_hp[target] - 50
            if drone_hp[target] <= 0:
                kills = kills + 1
                beep(1350)
    if pressed_b and old_b == False:
        if hp <= 0 or kills == 4:
            hp = 100
            kills = 0
            drone_hp = [100, 100, 100, 100]
            player_x = 1.5
            player_y = 4.5
            player_angle = 0.0
        ammo = 24
        beep(520)
    old_a = pressed_a
    old_b = pressed_b
    if hp > 0 and kills < 4:
        for i in range(4):
            if drone_hp[i] > 0:
                dx = player_x - drone_x[i]
                dy = player_y - drone_y[i]
                distance = math.sqrt(dx * dx + dy * dy)
                if distance > 0.65:
                    next_x = drone_x[i] + dx / distance * 0.022
                    next_y = drone_y[i] + dy / distance * 0.022
                    if world[int(drone_y[i]) * 10 + int(next_x)] == 0:
                        drone_x[i] = next_x
                    if world[int(next_y) * 10 + int(drone_x[i])] == 0:
                        drone_y[i] = next_y
                elif frame % 18 == 0:
                    hp = max(0, hp - 8)
                    beep(190)
    if leds is not None:
        for i in range(5):
            if hp > i * 20:
                leds[i] = 0x00FF00
            else:
                leds[i] = 0
    render_walls()
    # Depth-sort the four drones before drawing their individual wall-tested strips.
    order = [0, 1, 2, 3]
    for i in range(4):
        for j in range(i + 1, 4):
            a = order[i]
            b = order[j]
            da = (drone_x[a] - player_x) * (drone_x[a] - player_x) + (drone_y[a] - player_y) * (drone_y[a] - player_y)
            db = (drone_x[b] - player_x) * (drone_x[b] - player_x) + (drone_y[b] - player_y) * (drone_y[b] - player_y)
            if db > da:
                order[i] = b
                order[j] = a
    for position in range(4):
        i = order[position]
        if drone_hp[i] > 0:
            render_sprite(drone_x[i], drone_y[i], 8, 0)
    draw_map()
    for i in range(4):
        if drone_hp[i] > 0:
            rectangle(116 + int(drone_x[i] * 4), 3 + int(drone_y[i] * 4), 2, 2, 8)
    line(77, 60, 83, 60, 6)
    line(80, 57, 80, 63, 6)
    rectangle(73, 103, 14, 17, 3)
    if hp <= 0:
        hud("GAME OVER - B RESTART")
    elif kills == 4:
        hud("ARENA CLEARED - B RESTART")
    else:
        hud("HP " + str(hp) + " AMMO " + str(ammo) + " KILLS " + str(kills))
    present_3d()
