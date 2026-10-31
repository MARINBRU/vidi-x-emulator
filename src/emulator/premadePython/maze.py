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

while True:
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
    frame_pause()
