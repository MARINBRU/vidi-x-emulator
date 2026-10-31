# VIDI X WIRE BRIDGE: TX15 RX27
# Cross GPIO15 (TX) to GPIO27 (RX), connect both grounds, and optionally
# connect GPIO26 -> GPIO14 for the digital signal. GPIO16/17 are WROVER PSRAM.
# These shared pins also connect to the IR TX, SELECT, RGB LEDs and microphone.
import busio

uart = busio.UART(board.GPIO15, board.GPIO27, baudrate=115200, timeout=0)
output_pin = digitalio.DigitalInOut(board.GPIO26)
output_pin.switch_to_output(value=False)
input_pin = digitalio.DigitalInOut(board.GPIO14)
input_pin.switch_to_input()
sent = 0
received = 0
old_b = False
last_message = "Waiting for data"

while True:
    output_pin.value = button_a.value == False
    pressed_b = button_b.value == False
    if pressed_b and old_b == False:
        sent = sent + 1
        uart.write(bytes("FRAME#" + str(sent) + "\n", "utf-8"))
        beep(880)
    old_b = pressed_b
    data = uart.read()
    if data is not None:
        last_message = data.decode("utf-8")
        received = received + 1
        print("UART RX:", last_message)
        beep(1174)
    canvas.fill(0)
    rectangle(10, 32, min(140, sent * 6), 14, 5)
    rectangle(10, 64, min(140, received * 6), 14, 9)
    if input_pin.value:
        rectangle(130, 92, 18, 18, 6)
    hud("UART TX " + str(sent) + " RX " + str(received) + "  A GPIO B SEND")
    frame_pause()
