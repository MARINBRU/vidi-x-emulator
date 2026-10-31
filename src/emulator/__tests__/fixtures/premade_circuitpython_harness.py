"""Strict host-side CircuitPython API/pin check. This is not a board emulator."""
import math
import os
import runpy
import sys
import types

path, example = sys.argv[1:3]
claimed = {18: "built-in display clock", 23: "built-in display MOSI", 5: "display CS", 21: "display DC"}
frame = 0
scene_changes = 0
canvas_clears = 0
wall_regions = 0
trig_calls = 0
real_sin, real_cos = math.sin, math.cos

def counted_sin(value):
    global trig_calls
    trig_calls += 1
    return real_sin(value)

def counted_cos(value):
    global trig_calls
    trig_calls += 1
    return real_cos(value)

math.sin, math.cos = counted_sin, counted_cos
sent = []
terminals = []

class Finished(BaseException):
    pass

def claim(pin, kind):
    if pin in claimed:
        raise ValueError("pin %s already claimed by %s" % (pin, claimed[pin]))
    claimed[pin] = kind

def module(name, **attrs):
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod
    return mod

class Bitmap:
    def __init__(self, width, height, values):
        assert width > 0 and height > 0 and values >= 1
        self.width, self.height, self.values = width, height, values
    def fill(self, value):
        global scene_changes, canvas_clears
        assert 0 <= value < self.values
        scene_changes += 1
        if self.width == 160 and self.height == 120:
            canvas_clears += 1

class Palette:
    def __init__(self, count):
        self.values = [0] * count
    def __setitem__(self, index, value):
        self.values[index] = value
    def make_transparent(self, index):
        assert index < len(self.values)

class Group:
    def __init__(self, *, scale=1, x=0, y=0):
        self.scale = scale
        self.children = []
    def append(self, item):
        self.children.append(item)

class TileGrid:
    def __init__(self, bitmap, *, pixel_shader, width=1, height=1,
                 tile_width=None, tile_height=None, x=0, y=0):
        assert x >= 0 and y >= 0
        self.width, self.height = width, height

class Font:
    bitmap = Bitmap(96, 96, 2)
    def get_bounding_box(self):
        return (6, 12)

class Terminal:
    def __init__(self, grid, font):
        self.grid = grid
        self.writes = []
        terminals.append(self)
    def write(self, text):
        global scene_changes
        scene_changes += 1
        assert isinstance(text, str)
        assert all(len(line) <= self.grid.width for line in text.split('\r')), (text, self.grid.width)
        self.writes.append(text)

class Display:
    width, height = 320, 240
    root_group = None
    auto_refresh = True
    refresh_count = 0
    presented_changes = 0
    def refresh(self, *, target_frames_per_second=None, minimum_frames_per_second=0):
        assert not self.auto_refresh, "3D frames must use manual refresh"
        assert target_frames_per_second is None and minimum_frames_per_second == 0
        assert scene_changes > self.presented_changes, "unexpected duplicate/empty refresh"
        self.presented_changes = scene_changes
        self.refresh_count += 1
        return True

def region(bitmap, x1, y1, x2, y2, value):
    global scene_changes, wall_regions
    scene_changes += 1
    if bitmap.width == 160 and bitmap.height == 120 and x2 - x1 == 4 and value in (2, 3, 4, 7):
        wall_regions += 1
    assert all(isinstance(v, int) for v in (x1, y1, x2, y2, value))
    assert 0 <= x1 <= x2 <= bitmap.width and 0 <= y1 <= y2 <= bitmap.height
    assert 0 <= value < bitmap.values

def draw_line(bitmap, x1, y1, x2, y2, value):
    global scene_changes
    scene_changes += 1
    assert all(isinstance(v, int) for v in (x1, y1, x2, y2, value))
    assert 0 <= x1 < bitmap.width and 0 <= x2 < bitmap.width
    assert 0 <= y1 < bitmap.height and 0 <= y2 < bitmap.height
    assert 0 <= value < bitmap.values

module("displayio", Bitmap=Bitmap, Palette=Palette, Group=Group, TileGrid=TileGrid)
def blit(dest_bitmap, source_bitmap, x, y, *, x1=0, y1=0, x2=None, y2=None,
         skip_source_index=None, skip_dest_index=None):
    global scene_changes
    scene_changes += 1
    assert isinstance(dest_bitmap, Bitmap) and isinstance(source_bitmap, Bitmap)
    assert 0 <= x < dest_bitmap.width and 0 <= y < dest_bitmap.height
    assert x + source_bitmap.width <= dest_bitmap.width
    assert y + source_bitmap.height <= dest_bitmap.height

if os.environ.get("PREMADE_NO_BLIT") == "1":
    module("bitmaptools", fill_region=region, draw_line=draw_line)
else:
    module("bitmaptools", fill_region=region, draw_line=draw_line, blit=blit)
module("terminalio", FONT=Font(), Terminal=Terminal)

class DigitalInOut:
    def __init__(self, pin):
        self.pin = pin
        self._value = False
        self.input = True
        claim(pin, "digital")
    def switch_to_input(self, pull=None):
        self.input = True
    def switch_to_output(self, value=False):
        self.input = False
        self._value = value
    def deinit(self):
        claimed.pop(self.pin, None)
    @property
    def value(self):
        if self.input and self.pin == 32:
            return frame != 1
        if self.input and self.pin == 33:
            return frame != 2
        return self._value if not self.input else True
    @value.setter
    def value(self, value):
        self._value = bool(value)

class AnalogIn:
    def __init__(self, pin):
        self.pin = pin
        claim(pin, "analog")
    @property
    def value(self):
        if self.pin in (34, 35):
            return 32000 if frame == 1 else 0
        if self.pin == 26:
            return 15000
        return 32000

class PWMOut:
    def __init__(self, pin, *, frequency, duty_cycle, variable_frequency):
        claim(pin, "pwm")
        self.pin = pin
        self.frequency = frequency
        self.duty_cycle = duty_cycle
    def deinit(self):
        claimed.pop(self.pin, None)

class PulseOut:
    def __init__(self, pin, *, frequency, duty_cycle):
        claim(pin, "IR transmitter")
    def send(self, durations):
        assert durations.typecode == 'H' and len(durations) == 67
        sent.append(durations)

class PulseIn:
    def __init__(self, pin, *, maxlen, idle_state):
        claim(pin, "IR receiver")
        self.pin = pin
        self.durations = [9000, 4500]
        for byte in (1, 254, 69, 186):
            for bit in range(8):
                self.durations.extend([560, 1690 if byte & (1 << bit) else 560])
        self.durations.append(560)
    def __len__(self):
        return len(self.durations)
    def popleft(self):
        return self.durations.pop(0)
    def pause(self):
        pass
    def resume(self):
        pass
    def clear(self):
        self.durations.clear()
    def deinit(self):
        claimed.pop(self.pin, None)

class UART:
    def __init__(self, tx, rx, *, baudrate, timeout):
        claim(tx, "uart tx")
        claim(rx, "uart rx")
    def write(self, data):
        assert isinstance(data, bytes)
        sent.append(data)
        return len(data)
    def read(self):
        return b'FRAME#7\n' if frame == 2 else None

pins = dict(GPIO0=0, STATUS=2, TOUCH_CS=4, TOUCH_IRQ=12, MENU=13, MIC=14,
            GPIO14=14, IRTX=15, IRRX=25, GPIO15=15, GPIO25=25, GPIO26=26, TEMP=26,
            RGB_LED=26, GPIO27=27, BTN_A=32, BTN_B=33, BTN_L_R=34,
            BTN_UP_DOWN=35, GPIO39=39)
def spi():
    raise ValueError("built-in display owns SPI pins")
display = Display()
module("board", DISPLAY=display, SPI=spi, **pins)
module("digitalio", DigitalInOut=DigitalInOut,
       Pull=types.SimpleNamespace(UP="UP", DOWN="DOWN"),
       Direction=types.SimpleNamespace(INPUT="INPUT", OUTPUT="OUTPUT"))
module("analogio", AnalogIn=AnalogIn)
module("pwmio", PWMOut=PWMOut)
module("pulseio", PulseOut=PulseOut, PulseIn=PulseIn)
module("busio", UART=UART)

if os.environ.get("PREMADE_OPTIONALS") == "1":
    class NeoPixel:
        def __init__(self, pin, count, *, brightness, auto_write):
            claim(pin, "neopixel")
            self.values = [0] * count
        def __setitem__(self, index, value):
            self.values[index] = value
        def fill(self, value):
            self.values[:] = [value] * len(self.values)
    module("neopixel", NeoPixel=NeoPixel)
    module("xpt2046_circuitpython", Touch=lambda *args, **kwargs: None)

class Packet:
    mac = bytes([0x24, 0x6f, 0x28, 0, 0x10, 2])
    def __init__(self, msg):
        self.msg = msg
class Peer:
    def __init__(self, mac):
        assert isinstance(mac, bytes) and len(mac) == 6
class ESPNow:
    def __init__(self):
        self.peers = []
        self.count = 0
    def send(self, message):
        assert isinstance(message, (str, bytes)) and len(message) <= 250
        sent.append(message)
    def read(self):
        self.count += 1
        if self.count != 1:
            return None
        if 'fps' in example:
            return Packet(b'P,8.2,4.5,3.14,100')
        if 'pong' in example:
            return Packet(b'P2:100')
        return Packet(b'Hello from another board')
module("espnow", Peer=Peer, ESPNow=ESPNow)
module("wifi", radio=types.SimpleNamespace(mac_address=bytes([0x24, 0x6f, 0x28, 0, 0x10, 1])))

def sleep(_seconds):
    global frame
    if not display.auto_refresh:
        assert display.refresh_count > 0, "manual display slept before its first frame"
        assert display.presented_changes == scene_changes, "slept with a partially drawn frame"
    frame += 1
    if frame >= 4:
        raise Finished()
module("time", sleep=sleep, monotonic=lambda: frame * 0.05)
try:
    runpy.run_path(path, run_name="__main__")
except Finished:
    pass
assert frame >= 4
assert terminals, "the example did not create a text terminal"
if not display.auto_refresh:
    assert 2 <= display.refresh_count <= frame
    if example in ("premade-3d-maze", "premade-block-3"):
        # Initial frame, moving frame, map toggle; no redraw while idle.
        assert display.refresh_count == 3, display.refresh_count
        assert canvas_clears == 0, "the maze clears the full canvas before drawing"
        assert wall_regions == 40 * display.refresh_count, wall_regions
        assert trig_calls <= 2 * display.refresh_count + 2, trig_calls
print("PASS", example, "frames", frame, "packets", len(sent))
