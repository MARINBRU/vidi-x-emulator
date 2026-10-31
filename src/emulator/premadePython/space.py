# Space defender: move with the D-pad, A fires, collect energy and avoid meteors.
import random

ship_x = 80
ship_y = 99
health = 100
energy = 0
score = 0
meteor_x = [20, 50, 85, 110, 140]
meteor_y = [-20, -50, -80, -110, -140]
meteor_speed = [2, 3, 2, 3, 2]
cell_x = [35, 120]
cell_y = [-40, -100]
bullet_x = [0, 0, 0, 0]
bullet_y = [-10, -10, -10, -10]
old_a = False

while True:
    lr = left_right.value
    ud = up_down.value
    if lr > 60000:
        ship_x = max(8, ship_x - 3)
    elif lr > 25000 and lr < 45000:
        ship_x = min(152, ship_x + 3)
    if ud > 60000:
        ship_y = max(20, ship_y - 3)
    elif ud > 25000 and ud < 45000:
        ship_y = min(110, ship_y + 3)
    pressed_a = button_a.value == False
    if pressed_a and old_a == False:
        if health <= 0:
            health = 100
            energy = 0
            score = 0
            meteor_y = [-20, -50, -80, -110, -140]
        else:
            for i in range(4):
                if bullet_y[i] < 0:
                    bullet_x[i] = ship_x
                    bullet_y[i] = ship_y - 8
                    beep(900)
                    break
    old_a = pressed_a
    if health > 0:
        for i in range(5):
            meteor_y[i] = meteor_y[i] + meteor_speed[i]
            if meteor_y[i] > 126:
                meteor_y[i] = -random.randint(5, 40)
                meteor_x[i] = random.randint(8, 152)
            if abs(meteor_x[i] - ship_x) < 10 and abs(meteor_y[i] - ship_y) < 10:
                health = max(0, health - 12)
                meteor_y[i] = -random.randint(10, 50)
                beep(180)
        for i in range(2):
            cell_y[i] = cell_y[i] + 2
            if cell_y[i] > 125:
                cell_y[i] = -random.randint(40, 100)
                cell_x[i] = random.randint(8, 152)
            if abs(cell_x[i] - ship_x) < 9 and abs(cell_y[i] - ship_y) < 9:
                energy = energy + 10
                score = score + 25
                cell_y[i] = -random.randint(40, 100)
                beep(1040)
        for i in range(4):
            if bullet_y[i] >= 0:
                bullet_y[i] = bullet_y[i] - 6
                for j in range(5):
                    if abs(bullet_x[i] - meteor_x[j]) < 9 and abs(bullet_y[i] - meteor_y[j]) < 9:
                        meteor_y[j] = -random.randint(10, 50)
                        bullet_y[i] = -10
                        score = score + 50
                        break
    canvas.fill(0)
    for i in range(5):
        rectangle(meteor_x[i] - 6, meteor_y[i] - 6, 12, 12, 7)
    for i in range(2):
        rectangle(cell_x[i] - 3, cell_y[i] - 3, 7, 7, 9)
    for i in range(4):
        if bullet_y[i] >= 0:
            rectangle(bullet_x[i] - 1, bullet_y[i] - 3, 3, 6, 6)
    rectangle(ship_x - 7, ship_y - 4, 15, 9, 3)
    rectangle(ship_x - 3, ship_y - 9, 7, 9, 5)
    if leds is not None:
        for i in range(5):
            if health > i * 20:
                leds[i] = 0x00FF00
            else:
                leds[i] = 0
    if health <= 0:
        hud("GAME OVER - A RESTART")
    else:
        hud("HP " + str(health) + " SCORE " + str(score) + " NRG " + str(energy))
    frame_pause()
