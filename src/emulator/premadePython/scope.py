# Microphone/light oscilloscope, synth and NEC infrared lab.
# CircuitPython's VIDI X aliases IRRX and speaker to GPIO25. B switches between
# sound and IR receive so that only one owns the pin. A plays or sends NEC 0x45.
import pulseio
from array import array

microphone = analogio.AnalogIn(board.MIC)
light = analogio.AnalogIn(board.GPIO39)
trace_x = 3
last_mic_y = 60
last_light_y = 60
note = 0
old_a = False
old_b = False
old_left = False
old_right = False
notes = [262, 294, 330, 349, 392, 440, 494, 523]
ir_mode = False
ir_rx = None
last_ir = -1
canvas.fill(0)

# NEC address 0x01, command 0x45, least-significant bit first.
ir_frame = array("H", [9000,4500,560,1690,560,560,560,560,560,560,560,560,
                       560,560,560,560,560,560,560,560,560,1690,560,1690,
                       560,1690,560,1690,560,1690,560,1690,560,1690,560,1690,
                       560,560,560,1690,560,560,560,560,560,560,560,1690,
                       560,560,560,560,560,1690,560,560,560,1690,560,1690,
                       560,1690,560,560,560,1690,560])
ir_tx = None
try:
    ir_tx = pulseio.PulseOut(board.IRTX, frequency=38000, duty_cycle=32768)
except (ValueError, RuntimeError, NotImplementedError) as error:
    print("[VIDI X] IR transmitter unavailable:", error)

while True:
    lr = left_right.value
    left = lr > 60000
    right = lr > 25000 and lr < 45000
    if left and old_left == False:
        note = (note + 7) % 8
    if right and old_right == False:
        note = (note + 1) % 8
    old_left = left
    old_right = right
    pressed_b = button_b.value == False
    if pressed_b and old_b == False:
        if ir_mode:
            ir_rx.deinit()
            ir_rx = None
            speaker = pwmio.PWMOut(board.GPIO25, frequency=440, duty_cycle=0, variable_frequency=True)
            ir_mode = False
        else:
            speaker.deinit()
            try:
                ir_rx = pulseio.PulseIn(board.IRRX, maxlen=100, idle_state=True)
                ir_mode = True
            except (ValueError, RuntimeError, NotImplementedError) as error:
                print("[VIDI X] IR receiver unavailable:", error)
                speaker = pwmio.PWMOut(board.GPIO25, frequency=440, duty_cycle=0, variable_frequency=True)
    old_b = pressed_b
    pressed_a = button_a.value == False
    if pressed_a and old_a == False:
        if ir_mode:
            if ir_tx is not None:
                ir_tx.send(ir_frame)
                print("IR TX: 69")
        else:
            beep(notes[note])
    old_a = pressed_a
    if ir_mode and len(ir_rx) >= 66:
        ir_rx.pause()
        header = ir_rx.popleft()
        gap = ir_rx.popleft()
        if header > 7000 and gap > 3000:
            command = 0
            for bit in range(32):
                mark = ir_rx.popleft()
                space = ir_rx.popleft()
                if bit >= 16 and bit < 24 and space > 1100:
                    command = command + 2 ** (bit - 16)
            last_ir = command
            print("IR RX:", last_ir)
        ir_rx.clear()
        ir_rx.resume()
    mic = microphone.value
    light_value = light.value
    mic_y = 106 - int(mic * 88 / 65535)
    light_y = 106 - int(light_value * 88 / 65535)
    rectangle(trace_x, 16, 3, 94, 0)
    line(trace_x - 1, last_mic_y, trace_x, mic_y, 5)
    line(trace_x - 1, last_light_y, trace_x, light_y, 6)
    last_mic_y = mic_y
    last_light_y = light_y
    trace_x = trace_x + 1
    if trace_x >= 157:
        trace_x = 3
    if ir_mode:
        hud("IR RX " + str(last_ir) + "  A SEND  B SOUND")
        time.sleep(0.04)
    else:
        hud("SOUND " + str(notes[note]) + "  A PLAY  B IR")
        frame_pause()
