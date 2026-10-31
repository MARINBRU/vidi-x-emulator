# Six-question English VIDI X quiz, inspired by the supplied teacher's guide.
# Answers A/B/C/D correspond to UP/LEFT/RIGHT/DOWN; touch is optional.
questions = ["What is 2 + 2?", "In F=ma, what is m?", "Water contains oxygen and?", "What is the brain of a computer?", "Which unit measures frequency?", "Which device measures temperature?"]
answer_a = ["2", "Mass", "Gold", "GPU", "Hertz", "A speaker"]
answer_b = ["3", "Acceleration", "Hydrogen", "Memory", "Pixels", "A sensor"]
answer_c = ["4", "Force", "Carbon", "Disk", "Celsius", "A screen"]
answer_d = ["5", "Speed", "Copper", "CPU", "Volts", "A button"]
correct = [2, 0, 1, 3, 0, 1]
quiz_grids = []
# Fixed-size text rows drawn above the background bitmap.
for row in range(6):
    grid = displayio.TileGrid(font.bitmap, pixel_shader=text_colors, width=47,
                              height=1, tile_width=font_w, tile_height=font_h,
                              x=6, y=22 + row * 33)
    scene.append(grid)
    quiz_grids.append(terminalio.Terminal(grid, font))
level = 0
score = 0
last_choice = -1
last_displayed = -1

while True:
    if level != last_displayed:
        canvas.fill(0)
        rectangle(4, 20, 152, 18, 3)
        rectangle(4, 38, 152, 18, 4)
        rectangle(4, 56, 152, 18, 7)
        rectangle(4, 74, 152, 18, 13)
        if level < 6:
            quiz_grids[0].write("\r" + questions[level] + "          ")
            quiz_grids[1].write("\rA UP: " + answer_a[level] + "          ")
            quiz_grids[2].write("\rB LEFT: " + answer_b[level] + "          ")
            quiz_grids[3].write("\rC RIGHT: " + answer_c[level] + "          ")
            quiz_grids[4].write("\rD DOWN: " + answer_d[level] + "          ")
            quiz_grids[5].write("\rChoose a direction              ")
        else:
            quiz_grids[0].write("\rQuiz finished!                  ")
            quiz_grids[1].write("\rScore: " + str(score) + "/6          ")
            quiz_grids[2].write("\rPress A to play again           ")
            quiz_grids[3].write("\r                                 ")
            quiz_grids[4].write("\r                                 ")
            quiz_grids[5].write("\r                                 ")
        last_displayed = level
    hud("QUESTION " + str(min(level + 1, 6)) + "/6 SCORE " + str(score))
    choice = -1
    lr = left_right.value
    ud = up_down.value
    if ud > 60000:
        choice = 0
    elif lr > 60000:
        choice = 1
    elif lr > 25000 and lr < 45000:
        choice = 2
    elif ud > 25000 and ud < 45000:
        choice = 3
    if touch is not None and touch.is_pressed():
        point = touch.get_coordinates()
        if point[0] is not None and point[1] is not None and point[0] >= 8 and point[0] < 312:
            if point[1] >= 40 and point[1] < 76:
                choice = 0
            elif point[1] >= 76 and point[1] < 112:
                choice = 1
            elif point[1] >= 112 and point[1] < 148:
                choice = 2
            elif point[1] >= 148 and point[1] < 184:
                choice = 3
    if level < 6 and choice >= 0 and last_choice == -1:
        if choice == correct[level]:
            score = score + 1
            print("Correct! Score", score)
            beep(1000)
        else:
            print("Not quite. Score", score)
            beep(260)
        level = level + 1
    elif level >= 6 and button_a.value == False:
        level = 0
        score = 0
    last_choice = choice
    frame_pause()
