# Temperature (GPIO26), light (GPIO39), microphone (GPIO14), buttons and touch.
# GPIO26 is also the RGB LED pin: it cannot be driven as RGB and sampled as
# temperature simultaneously. Fit the temperature/light jumper as appropriate.
temperature = analogio.AnalogIn(board.TEMP)
light = analogio.AnalogIn(board.GPIO39)
microphone = analogio.AnalogIn(board.MIC)
cursor_x = 80
cursor_y = 60
counter = 0

while True:
    counter = counter + 1
    lr = left_right.value
    ud = up_down.value
    if lr > 60000:
        cursor_x = max(2, cursor_x - 2)
    elif lr > 25000 and lr < 45000:
        cursor_x = min(157, cursor_x + 2)
    if ud > 60000:
        cursor_y = max(15, cursor_y - 2)
    elif ud > 25000 and ud < 45000:
        cursor_y = min(117, cursor_y + 2)
    if touch is not None and touch.is_pressed():
        point = touch.get_coordinates()
        if point[0] is not None and point[1] is not None:
            cursor_x = int(point[0] / 2)
            cursor_y = int(point[1] / 2)
    temp_c = (temperature.value * 3300 / 65535 - 500) / 10
    light_pct = int(light.value * 100 / 65535)
    mic_pct = int(microphone.value * 100 / 65535)
    canvas.fill(0)
    rectangle(10, 24, int(light_pct * 1.25), 10, 6)
    rectangle(10, 45, int(mic_pct * 1.25), 10, 5)
    rectangle(10, 66, max(0, min(125, int(temp_c + 20))), 10, 8)
    rectangle(cursor_x - 3, cursor_y - 3, 7, 7, 11)
    if button_a.value == False:
        beep(880)
        rectangle(142, 17, 12, 12, 9)
    if button_b.value == False:
        rectangle(142, 33, 12, 12, 10)
    hud("T " + str(int(temp_c)) + "C L " + str(light_pct) + "% M " + str(mic_pct) + "%")
    if counter % 25 == 0:
        print("Temperature C:", temp_c, "Light %:", light_pct, "Microphone %:", mic_pct)
    frame_pause()
