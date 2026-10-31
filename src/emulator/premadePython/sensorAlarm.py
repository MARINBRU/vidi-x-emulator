# Smart sensor watchdog. A quiet tone warns when it gets hot or dark.
temperature = analogio.AnalogIn(board.TEMP)
light = analogio.AnalogIn(board.GPIO39)
frame = 0

while True:
    frame = frame + 1
    temp_c = (temperature.value * 3300 / 65535 - 500) / 10
    light_pct = int(light.value * 100 / 65535)
    alarm = temp_c > 32 or light_pct < 20
    canvas.fill(0)
    rectangle(16, 34, max(0, min(128, int(temp_c * 2))), 15, 8)
    rectangle(16, 67, int(light_pct * 1.28), 15, 6)
    if alarm and frame % 20 == 0:
        beep(600)
        print("Sensor alarm!", temp_c, "C; light", light_pct, "%")
    if alarm:
        hud("ALERT T " + str(int(temp_c)) + "C L " + str(light_pct) + "%")
    else:
        hud("NORMAL T " + str(int(temp_c)) + "C L " + str(light_pct) + "%")
    frame_pause()
