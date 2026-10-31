# Two-player ESP-NOW FPS: the packet format matches the C++ arena example.
# Start the same example on two boards. D-pad moves, A fires.
role = 0
peer_x = 8.2
peer_y = 4.5
peer_hp = 100
connected = False
hp = 100
frags = 0
frame = 0
old_a = False

while True:
    frame = frame + 1
    packet = radio.read()
    while packet is not None:
        other_mac = packet.mac.hex()
        new_role = 1
        if my_mac < other_mac:
            new_role = 0
        if new_role != role:
            role = new_role
            if role == 0:
                player_x = 1.8
                player_y = 4.5
                player_angle = 0.0
            else:
                player_x = 8.2
                player_y = 4.5
                player_angle = 3.14159
        fields = packet.msg.decode("utf-8").split(",")
        if fields[0] == "P" and len(fields) >= 5:
            peer_x = float(fields[1])
            peer_y = float(fields[2])
            peer_hp = int(fields[4])
            connected = True
        elif fields[0] == "HIT" and len(fields) >= 2:
            hp = max(0, hp - int(fields[1]))
            beep(220)
            if hp == 0:
                radio.send("FRAG")
                hp = 100
                if role == 0:
                    player_x = 1.8
                    player_y = 4.5
                else:
                    player_x = 8.2
                    player_y = 4.5
        elif fields[0] == "FRAG":
            frags = frags + 1
            beep(1300)
        packet = radio.read()
    if connected == False:
        peer_x = 5.5 + math.cos(frame * 0.04) * 2.0
        peer_y = 4.5 + math.sin(frame * 0.03)
    move_player()
    radio.send("P," + str(player_x) + "," + str(player_y) + "," + str(player_angle) + "," + str(hp))
    pressed_a = button_a.value == False
    if pressed_a and old_a == False:
        beep(980)
        dx = peer_x - player_x
        dy = peer_y - player_y
        forward = dx * math.cos(player_angle) + dy * math.sin(player_angle)
        sideways = -dx * math.sin(player_angle) + dy * math.cos(player_angle)
        if forward > 0.2 and abs(sideways) < 0.4 and forward < depth[40] + 0.08:
            if connected:
                radio.send("HIT,34")
            else:
                peer_hp = peer_hp - 34
                if peer_hp <= 0:
                    peer_hp = 100
                    frags = frags + 1
    old_a = pressed_a
    render_walls()
    render_sprite(peer_x, peer_y, 10, 0)
    draw_map()
    rectangle(116 + int(peer_x * 4), 3 + int(peer_y * 4), 2, 2, 8)
    line(77, 60, 83, 60, 6)
    line(80, 57, 80, 63, 6)
    rectangle(73, 103, 14, 17, 3)
    hud("P" + str(role + 1) + " HP " + str(hp) + " FRAGS " + str(frags))
    frame_pause()
