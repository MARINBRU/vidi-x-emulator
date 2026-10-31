# Two-board Pong. The C++ and Python variants share STATE: and P2: packets.
role = 0
my_y = 95
opponent_y = 95
ball_x = 160
ball_y = 120
vx = 5
vy = 3
score_1 = 0
score_2 = 0

while True:
    packet = radio.read()
    while packet is not None:
        if my_mac < packet.mac.hex():
            role = 0
        else:
            role = 1
        parts = packet.msg.decode("utf-8").split(":")
        if len(parts) >= 2:
            if parts[0] == "P2" and role == 0:
                opponent_y = int(parts[1])
            elif parts[0] == "STATE" and role == 1:
                state = parts[1].split(",")
                if len(state) >= 5:
                    opponent_y = int(state[0])
                    ball_x = int(state[1])
                    ball_y = int(state[2])
                    score_1 = int(state[3])
                    score_2 = int(state[4])
        packet = radio.read()
    ud = up_down.value
    if ud > 60000 or button_a.value == False:
        my_y = max(28, my_y - 7)
    elif ud > 25000 and ud < 45000 or button_b.value == False:
        my_y = min(192, my_y + 7)
    if role == 0:
        ball_x = ball_x + vx
        ball_y = ball_y + vy
        if ball_y <= 28 or ball_y >= 232:
            vy = -vy
            beep(520)
        if ball_x <= 22 and ball_y >= my_y - 4 and ball_y <= my_y + 44:
            vx = abs(vx)
            ball_x = 23
            beep(780)
        if ball_x >= 298 and ball_y >= opponent_y - 4 and ball_y <= opponent_y + 44:
            vx = -abs(vx)
            ball_x = 297
            beep(660)
        if ball_x < 4:
            score_2 = score_2 + 1
            ball_x = 160
            ball_y = 120
            vx = 5
        elif ball_x > 316:
            score_1 = score_1 + 1
            ball_x = 160
            ball_y = 120
            vx = -5
        radio.send("STATE:" + str(my_y) + "," + str(ball_x) + "," + str(ball_y) + "," + str(score_1) + "," + str(score_2))
    else:
        radio.send("P2:" + str(my_y))
    canvas.fill(0)
    for y in range(14, 118, 7):
        rectangle(79, y, 1, 4, 2)
    left_y = my_y
    right_y = opponent_y
    if role == 1:
        left_y = opponent_y
        right_y = my_y
    rectangle(6, int(left_y / 2), 4, 21, 5)
    rectangle(150, int(right_y / 2), 4, 21, 7)
    rectangle(int(ball_x / 2) - 2, int(ball_y / 2) - 2, 5, 5, 6)
    hud("PONG  " + str(score_1) + " : " + str(score_2) + "  P" + str(role + 1))
    frame_pause()
