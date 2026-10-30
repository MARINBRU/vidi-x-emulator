"""Exercise code.py with strict mocks of the VIDI X CircuitPython 9.2.9 APIs.

This is a host test, not an ESP32 or a physical display. The mocks intentionally
omit the emulator-only DISPLAY drawing methods and MPU roll/pitch properties.
"""
import builtins
import math
import sys
import types

source = open(sys.argv[1], encoding="utf-8").read()
scenario = sys.argv[2]
use_mpu = scenario != "default"
address = 0x69 if scenario == "mpu69" else 0x68
if use_mpu:
    source = source.replace("USE_MPU6050 = False", "USE_MPU6050 = True", 1)
if address == 0x69:
    source = source.replace("MPU6050_ADDRESS = 0x68", "MPU6050_ADDRESS = 0x69", 1)

claims = {}
digital = {}
terminals = []
frame = 0
imports = []
buses = []


def claim(pin, owner):
    if pin in claims:
        raise ValueError("Pin already in use: " + str(pin))
    claims[pin] = owner


class Display:
    __slots__ = ("width", "height", "root_group")

    def __init__(self):
        self.width, self.height = 320, 240
        self.root_group = None


class Bitmap:
    __slots__ = ("width", "height", "value_count", "pixels")

    def __init__(self, width, height, value_count):
        assert width > 0 and height > 0 and value_count > 0
        self.width, self.height, self.value_count = width, height, value_count
        self.pixels = bytearray(width * height)

    def __setitem__(self, index, value):
        assert 0 <= index < len(self.pixels) and 0 <= value < self.value_count
        self.pixels[index] = value


class Palette:
    __slots__ = ("colors", "transparent")

    def __init__(self, count):
        self.colors = [0] * count
        self.transparent = set()

    def __setitem__(self, index, color):
        self.colors[index] = color

    def make_transparent(self, index):
        assert 0 <= index < len(self.colors)
        self.transparent.add(index)


class TileGrid:
    __slots__ = ("bitmap", "pixel_shader", "width", "height", "tile_width", "tile_height", "x", "y")

    def __init__(self, bitmap, *, pixel_shader, width=1, height=1,
                 tile_width=None, tile_height=None, x=0, y=0):
        assert isinstance(bitmap, Bitmap) and isinstance(pixel_shader, Palette)
        self.bitmap, self.pixel_shader = bitmap, pixel_shader
        self.width, self.height = width, height
        self.tile_width = tile_width or bitmap.width
        self.tile_height = tile_height or bitmap.height
        assert bitmap.width % self.tile_width == 0 and bitmap.height % self.tile_height == 0
        self.x, self.y = x, y


class Group:
    __slots__ = ("children",)

    def __init__(self):
        self.children = []

    def append(self, item):
        assert isinstance(item, (TileGrid, Group)) and item not in self.children
        self.children.append(item)


class Font:
    __slots__ = ("bitmap",)

    def __init__(self):
        self.bitmap = Bitmap(6 * 96, 12, 2)

    def get_bounding_box(self):
        return 6, 12


class Terminal:
    __slots__ = ("grid", "font", "writes")

    def __init__(self, grid, font):
        assert grid.bitmap is font.bitmap and grid.width * grid.height >= 2
        self.grid, self.font, self.writes = grid, font, []
        terminals.append(self)

    def write(self, text):
        assert isinstance(text, str)
        self.writes.append(text)
        return len(text)


class DigitalInOut:
    __slots__ = ("pin", "direction", "pull", "_value")

    def __init__(self, pin):
        claim(pin, "digital")
        self.pin, self.direction, self.pull, self._value = pin, "INPUT", None, False
        digital[pin] = self

    def switch_to_input(self, pull=None):
        self.direction, self.pull = "INPUT", pull

    def switch_to_output(self, value=False):
        self.direction, self._value = "OUTPUT", value

    @property
    def value(self):
        if self.direction == "INPUT":
            # Press, hold, release, press again. Scoring should be edge-triggered.
            return [True, False, False, True, False][min(frame, 4)]
        return self._value

    @value.setter
    def value(self, value):
        self._value = bool(value)


class AnalogIn:
    __slots__ = ("pin",)

    def __init__(self, pin):
        claim(pin, "analog")
        self.pin = pin

    @property
    def value(self):
        return 65535 if self.pin == 34 and frame < 2 else 0


class I2C:
    __slots__ = ("locked", "deinitialized", "transactions")

    def __init__(self):
        if scenario == "init-error":
            raise RuntimeError("VIDIIC pins unavailable")
        claim(32, "i2c")
        claim(33, "i2c")
        self.locked, self.deinitialized = False, False
        self.transactions = []
        buses.append(self)

    def try_lock(self):
        assert not self.deinitialized and not self.locked
        if scenario == "busy":
            return False
        self.locked = True
        return True

    def unlock(self):
        assert self.locked and not self.deinitialized
        self.locked = False

    def deinit(self):
        assert not self.locked and not self.deinitialized
        self.deinitialized = True
        assert claims.pop(32) == claims.pop(33) == "i2c"

    def check(self, actual_address):
        assert not self.deinitialized and self.locked, "I2C transaction without a lock"
        if scenario == "missing" or actual_address != address:
            raise OSError("No I2C device at address")

    def writeto(self, actual_address, data):
        self.check(actual_address)
        assert isinstance(data, bytes) and len(data) == 2
        self.transactions.append(("write", actual_address, bytes(data)))
        if scenario == "config-error" and data[0] == 0x1C:
            raise ValueError("configuration failed")

    def writeto_then_readfrom(self, actual_address, out, incoming):
        self.check(actual_address)
        assert isinstance(out, bytes) and isinstance(incoming, bytearray)
        self.transactions.append(("read", actual_address, bytes(out), len(incoming)))
        if out == bytes([0x75]) and len(incoming) == 1:
            incoming[0] = 0xFF if scenario == "bad-id" else 0x68
            return
        assert out == bytes([0x3B]) and len(incoming) == 14
        if scenario == "read-error" and frame >= 2:
            raise OSError("sensor disconnected")
        # Negative values exercise signed big-endian conversion and deg/s scaling.
        values = (8192, -4096, 14000, -500, 3930, -5240, 13100)
        for idx, value in enumerate(values):
            incoming[2 * idx:2 * idx + 2] = value.to_bytes(2, "big", signed=True)


class StopLoop(Exception):
    pass


def sleep(seconds):
    global frame
    assert seconds > 0
    if seconds >= 0.1:  # Sensor wake delay is not an animation frame.
        return
    frame += 1
    if frame == 5:
        raise StopLoop()


def module(name, **attrs):
    result = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(result, key, value)
    sys.modules[name] = result
    return result


display = Display()
module("board", DISPLAY=display, BTN_A=32, BTN_B=33, MENU=13, STATUS=2,
       BTN_L_R=34, BTN_UP_DOWN=35, VIDIIC=I2C)
module("displayio", Bitmap=Bitmap, Palette=Palette, TileGrid=TileGrid, Group=Group)
font = Font()
module("terminalio", FONT=font, Terminal=Terminal)
module("digitalio", DigitalInOut=DigitalInOut, Pull=types.SimpleNamespace(UP="UP"))
module("analogio", AnalogIn=AnalogIn)
module("time", sleep=sleep, monotonic=lambda: frame / 4)
module("math", degrees=math.degrees, atan2=math.atan2, sqrt=math.sqrt)
original_import = builtins.__import__
allowed = {"time", "board", "displayio", "terminalio", "analogio", "digitalio", "math"}


def guarded_import(name, *args, **kwargs):
    imports.append(name)
    if name not in allowed:
        raise ImportError("Unexpected or missing library: " + name)
    return original_import(name, *args, **kwargs)


scope = {"__builtins__": dict(vars(builtins), __import__=guarded_import)}
try:
    exec(compile(source, sys.argv[1], "exec"), scope)
except StopLoop:
    pass

assert frame == 5
assert isinstance(display.root_group, Group) and len(display.root_group.children) == 5
assert not hasattr(display, "fill") and not hasattr(display, "text")
assert scope["ball_bitmap"].pixels[12 * 24 + 12] == 2
assert 0 in scope["ball_colors"].transparent
assert scope["score"] == 2 and len(terminals[2].writes) == 3
assert terminals[2].writes[-1].startswith("\rSCORE: 2")
assert digital[2].value is True
assert scope["ball"].x == scope["ball_x"] - 12
assert scope["ball"].y == scope["ball_y"] - 12
assert "adafruit_mpu6050" not in imports
if not use_mpu:
    assert claims[32] == "digital" and 33 not in claims and 13 not in claims
    assert not buses and scope["ball_x"] == 150
    print("PASS no external libraries")
elif scenario in ("mpu68", "mpu69"):
    assert len(buses) == 1 and not buses[0].locked and not buses[0].deinitialized
    assert claims[32] == claims[33] == "i2c" and claims[13] == "digital"
    assert scope["mpu_ready"] and scope["ball_x"] > 160
    assert (scope["ax"], scope["ay"], scope["az"]) == (8192, -4096, 14000)
    assert (scope["gx"], scope["gy"], scope["gz"]) == (30.0, -40.0, 100.0)
    assert any("GYRO: 30,-40,100 deg/s" in text for text in terminals[1].writes)
    assert buses[0].transactions[:4] == [
        ("read", address, bytes([0x75]), 1),
        ("write", address, bytes([0x6B, 0x00])),
        ("write", address, bytes([0x1C, 0x00])),
        ("write", address, bytes([0x1B, 0x00])),
    ]
    assert all(tx[1] == address for tx in buses[0].transactions)
    print("PASS optional MPU-6050 at " + hex(address))
else:
    assert claims[13] == "digital" and 32 not in claims and 33 not in claims
    assert not scope["mpu_ready"] and scope["i2c"] is None
    if scenario == "init-error":
        assert not buses
    else:
        assert buses[0].deinitialized
    assert any("D-PAD ONLY" in text for text in terminals[1].writes)
    if scenario == "read-error":
        assert any("MPU READ ERROR" in text for text in terminals[1].writes)
        assert scope["ball_x"] > 150  # It moved before the sensor disconnected.
    else:
        assert scope["ball_x"] == 150
    print("PASS fallback " + scenario)
