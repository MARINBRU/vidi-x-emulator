# D-pad explorer and touch painter. A beeps; B clears the screen.
x = 80
y = 60
old_b = False
canvas.fill(0)

while True:
    lr = left_right.value
    ud = up_down.value
    if lr > 60000:
        x = max(2, x - 2)
    elif lr > 25000 and lr < 45000:
        x = min(157, x + 2)
    if ud > 60000:
        y = max(10, y - 2)
    elif ud > 25000 and ud < 45000:
        y = min(117, y + 2)
    if touch is not None and touch.is_pressed():
        point = touch.get_coordinates()
        if point[0] is not None and point[1] is not None:
            x = max(0, min(157, int(point[0] / 2)))
            y = max(8, min(117, int(point[1] / 2)))
    if button_b.value == False and old_b == False:
        canvas.fill(0)
    old_b = button_b.value == False
    if button_a.value == False:
        beep(880)
        rectangle(x - 2, y - 2, 5, 5, 6)
    else:
        rectangle(x - 2, y - 2, 5, 5, 5)
    hud("D-PAD / TOUCH  A TONE  B CLEAR")
    frame_pause()
