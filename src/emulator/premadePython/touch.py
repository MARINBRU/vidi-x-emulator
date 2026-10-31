# Optional touch driver used by the VIDI X teaching guide.
# With the firmware's default display, board.SPI() may already be claimed.
# In that case, or when the optional driver is missing, D-pad controls still work.
touch = None
touch_cs = None
try:
    import xpt2046_circuitpython
    touch_cs = digitalio.DigitalInOut(board.TOUCH_CS)
    touch = xpt2046_circuitpython.Touch(board.SPI(), cs=touch_cs)
except (ImportError, ValueError, RuntimeError) as error:
    if touch_cs is not None:
        touch_cs.deinit()
    print("[VIDI X] Touch unavailable; use the D-pad:", error)
