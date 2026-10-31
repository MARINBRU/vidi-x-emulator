# The optional neopixel library drives the five RGB LEDs on GPIO 26.
# When it is not installed, the rest of the example still runs.
leds = None
try:
    import neopixel
    leds = neopixel.NeoPixel(board.RGB_LED, 5, brightness=0.1, auto_write=True)
except (ImportError, ValueError, RuntimeError) as error:
    print("[VIDI X] RGB LEDs unavailable:", error)
