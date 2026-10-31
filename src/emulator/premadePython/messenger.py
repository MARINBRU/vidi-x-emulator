# ESP-NOW messenger: start this on two boards, then press A to send a packet.
old_a = False
sent = 0
received = 0
last_message = "Waiting for a message"

while True:
    packet = radio.read()
    while packet is not None:
        last_message = packet.msg.decode("utf-8")
        received = received + 1
        beep(1200)
        if leds is not None:
            leds.fill(0x00FF00)
        print("RX:", last_message)
        packet = radio.read()
    pressed_a = button_a.value == False
    if pressed_a and old_a == False:
        sent = sent + 1
        radio.send("Hello from VIDI X #" + str(sent))
        beep(720)
        if leds is not None:
            leds.fill(0x0088FF)
    old_a = pressed_a
    canvas.fill(0)
    rectangle(15, 35, min(130, sent * 5), 16, 5)
    rectangle(15, 65, min(130, received * 5), 16, 9)
    hud("TX " + str(sent) + " RX " + str(received) + "  A: SEND")
    frame_pause()
