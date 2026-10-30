import React, { useEffect, useRef, useState } from 'react';
import {
  Power,
  RotateCcw,
  Volume2,
  VolumeX,
  Camera,
  Trash2,
  Play,
  Square,
  Grid,
} from 'lucide-react';
import { BoardRuntimeInstance } from '../emulator/clusterManager';
import { EXPANSION_HEADER_PINS } from '../emulator/pinout';
import { ButtonId, SensorState } from '../emulator/types';

interface VidiXBoardViewProps {
  instance: BoardRuntimeInstance;
  isSelected: boolean;
  canRemove: boolean;
  pendingWirePin: { boardId: string; gpio: number } | null;
  onSelect: () => void;
  onRemove: () => void;
  onTogglePower: () => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onButtonChange: (button: ButtonId, pressed: boolean) => void;
  onTouchChange: (pressed: boolean, x: number, y: number) => void;
  onSensorChange: (partial: Partial<SensorState>) => void;
  onSendIr: (code: number) => void;
  onToggleMute: () => void;
  onPinClickForWire: (boardId: string, gpio: number) => void;
}

export const VidiXBoardView: React.FC<VidiXBoardViewProps> = ({
  instance,
  isSelected,
  canRemove,
  pendingWirePin,
  onSelect,
  onRemove,
  onTogglePower,
  onStart,
  onStop,
  onReset,
  onButtonChange,
  onTouchChange,
  onSensorChange,
  onSendIr,
  onToggleMute,
  onPinClickForWire,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showSensors, setShowSensors] = useState(false);
  const [showHeaderPins, setShowHeaderPins] = useState(false);
  const [pixelGrid, setPixelGrid] = useState(false);
  const [hoverCoords, setHoverCoords] = useState<[number, number] | null>(null);
  const { state, display } = instance;

  // Render 320x240 ILI9341 framebuffer onto HTML5 canvas at 60fps
  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(320, 240);

    const renderLoop = () => {
      if (!state.poweredOn) {
        ctx.fillStyle = '#05070b';
        ctx.fillRect(0, 0, 320, 240);
      } else {
        imageData.data.set(display.rgbaBuffer);
        ctx.putImageData(imageData, 0, 0);
        display.dirty = false;
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [display, state.poweredOn]);

  const handleCaptureScreenshot = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.id}-screen-${Date.now()}.png`;
    a.click();
  };

  const computeTouchCoords = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(319, Math.round(((e.clientX - rect.left) / rect.width) * 320)));
    const y = Math.max(0, Math.min(239, Math.round(((e.clientY - rect.top) / rect.height) * 240)));
    return [x, y];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = computeTouchCoords(e);
    setHoverCoords([x, y]);
    onTouchChange(true, x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = computeTouchCoords(e);
    setHoverCoords([x, y]);
    if (!state.touch.pressed) return;
    onTouchChange(true, x, y);
  };

  const handlePointerUp = () => {
    if (state.touch.pressed) {
      onTouchChange(false, state.touch.x, state.touch.y);
    }
  };

  const handlePointerLeave = () => {
    if (!state.touch.pressed) {
      setHoverCoords(null);
    }
  };

  const bindBtn = (btn: ButtonId) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      onButtonChange(btn, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      onButtonChange(btn, false);
    },
    onPointerCancel: () => onButtonChange(btn, false),
  });

  const adc34 = state.pins[34]?.analogValue ?? 0;
  const adc35 = state.pins[35]?.analogValue ?? 0;

  return (
    <div
      onClick={onSelect}
      className={`relative select-none transition-all duration-150 bg-[#0d1017] border ${
        isSelected
          ? 'border-amber-400/90 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_24px_60px_rgba(0,0,0,0.85)]'
          : 'border-[#252a36] hover:border-[#384052] shadow-[0_18px_45px_rgba(0,0,0,0.7)]'
      }`}
    >
      {/* Top Industrial Instrument Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#12151e] border-b border-[#252a36] font-mono text-[11px]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#080a0f] border border-[#252a36]">
            <span
              className={`w-2 h-2 rounded-full ${
                state.poweredOn && state.running
                  ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                  : state.poweredOn
                  ? 'bg-amber-400'
                  : 'bg-zinc-600'
              }`}
            />
            <span className="font-bold tracking-wider text-zinc-100">{state.name}</span>
          </div>

          <span className="text-zinc-400 hidden sm:inline">
            MAC <strong className="text-amber-300/90 font-normal">{state.macAddress}</strong>
          </span>
          <span className="text-zinc-600 hidden md:inline">/</span>
          <span className="text-zinc-400 hidden md:inline">{state.ipAddress}</span>

          {isSelected && (
            <span className="px-1.5 py-0.2 bg-amber-400/15 text-amber-300 border border-amber-400/40 text-[9px] uppercase tracking-widest">
              FOCUS
            </span>
          )}
        </div>

        {/* Hardware Bench Controls */}
        <div className="flex items-center gap-1">
          {state.running ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[10px] uppercase tracking-wider cursor-pointer"
              title="Halt Execution"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              HALT
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[10px] uppercase tracking-wider cursor-pointer"
              title="Execute Sketch"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              EXEC
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            title="Hardware Reset (EN)"
            className="px-1.5 py-0.5 bg-[#090b10] hover:bg-[#1c202c] text-zinc-300 border border-[#252a36] text-[10px] flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            RST
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowHeaderPins((v) => !v);
            }}
            className={`px-2 py-0.5 border text-[10px] uppercase tracking-wider cursor-pointer ${
              showHeaderPins
                ? 'bg-amber-400 text-black font-bold border-amber-300'
                : 'bg-[#090b10] hover:bg-[#1c202c] text-zinc-300 border-[#252a36]'
            }`}
            title="Toggle 60-Pin Expansion Edge Connector"
          >
            60P-BUS
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSensors((v) => !v);
            }}
            className={`px-2 py-0.5 border text-[10px] uppercase tracking-wider cursor-pointer ${
              showSensors
                ? 'bg-zinc-200 text-zinc-900 font-bold border-zinc-300'
                : 'bg-[#090b10] hover:bg-[#1c202c] text-zinc-300 border-[#252a36]'
            }`}
            title="Toggle sensors and simulated external MPU-6050"
          >
            SENSORS / GYRO
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setPixelGrid((v) => !v);
            }}
            title="Toggle LCD Pixel Grid"
            className={`p-1 border cursor-pointer ${
              pixelGrid
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-[#090b10] text-zinc-400 border-[#252a36] hover:text-zinc-200'
            }`}
          >
            <Grid className="w-3 h-3" />
          </button>

          <button
            onClick={handleCaptureScreenshot}
            title="Capture 320x240 TFT Display PNG"
            className="p-1 bg-[#090b10] hover:bg-[#1c202c] text-zinc-400 hover:text-zinc-100 border border-[#252a36] cursor-pointer"
          >
            <Camera className="w-3 h-3" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            title={state.audio.muted ? 'Unmute Piezo Buzzer' : 'Mute Piezo Buzzer'}
            className={`p-1 border cursor-pointer ${
              state.audio.muted
                ? 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                : state.audio.active
                ? 'bg-amber-400/20 text-amber-300 border-amber-400'
                : 'bg-[#090b10] text-zinc-400 border-[#252a36] hover:text-zinc-100'
            }`}
          >
            {state.audio.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePower();
            }}
            title="Main Power Switch"
            className={`p-1 border cursor-pointer ${
              state.poweredOn
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-700/60'
                : 'bg-[#090b10] text-zinc-600 border-[#252a36]'
            }`}
          >
            <Power className="w-3 h-3" />
          </button>

          {canRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title="Remove VIDI X Unit"
              className="p-1 bg-[#090b10] hover:bg-rose-950/70 text-zinc-500 hover:text-rose-300 border border-[#252a36] cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable 60-Pin Gold ENIG Edge Connector */}
      {showHeaderPins && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-2.5 bg-[#07090e] border-b border-[#252a36] font-mono"
        >
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-2">
            <span>
              J1 // 60-PIN EXPANSION BUS — <span className="text-amber-300">CLICK ANY GPIO PAD TO PATCH JUMPER WIRE</span>
            </span>
            <span className="text-emerald-400">
              {state.attachedExtensions.length > 0
                ? `EXT: ${state.attachedExtensions.map((x) => x.name).join(', ')}`
                : 'BUS IDLE'}
            </span>
          </div>
          <div className="grid grid-cols-10 sm:grid-cols-15 gap-1">
            {EXPANSION_HEADER_PINS.map((pin) => {
              const pState = pin.gpio !== null ? state.pins[pin.gpio] : null;
              const isHigh = pState ? pState.digitalValue === 1 : pin.type.startsWith('POWER');
              const isPending =
                pendingWirePin?.boardId === state.id && pendingWirePin?.gpio === pin.gpio;

              return (
                <button
                  key={pin.headerPin}
                  disabled={pin.gpio === null}
                  onClick={() => {
                    if (pin.gpio !== null) {
                      onPinClickForWire(state.id, pin.gpio);
                    }
                  }}
                  title={`Pin #${pin.headerPin} (${pin.name}): ${pin.description}${
                    pState
                      ? ` | Mode: ${pState.mode} | Dig: ${pState.digitalValue} | ADC: ${pState.analogValue}`
                      : ''
                  }`}
                  className={`px-1 py-1 text-[9px] border text-left transition-all ${
                    isPending
                      ? 'bg-amber-400 text-black font-bold border-white animate-pulse'
                      : pin.gpio === null
                      ? pin.type === 'GND'
                        ? 'bg-[#0b0d13] text-zinc-600 border-[#1c202b] cursor-default'
                        : 'bg-rose-950/30 text-rose-400/80 border-rose-900/40 cursor-default'
                      : isHigh
                      ? 'bg-amber-500/15 text-amber-200 border-amber-500/60 hover:bg-amber-500/25 cursor-pointer'
                      : 'bg-[#0e121b] text-zinc-300 border-[#262c3a] hover:border-amber-400 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-zinc-500">#{pin.headerPin}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isHigh ? 'bg-amber-400' : 'bg-zinc-700'
                      }`}
                    />
                  </div>
                  <div className="font-bold truncate">
                    {pin.gpio !== null ? `IO${pin.gpio}` : pin.name}
                  </div>
                  <div className="text-[8px] text-zinc-400 truncate">
                    {pState ? `${pState.analogValue}` : pin.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHYSICAL VIDI X v1.1 ROYAL BLUE FR-4 PCB CHASSIS                      */}
      {/* ===================================================================== */}
      <div className="vidi-pcb-surface relative p-4 sm:p-5 overflow-hidden">
        {/* Decorative Copper PCB Traces (SVG background layer) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
          viewBox="0 0 640 360"
          fill="none"
        >
          <path d="M 40 30 L 110 30 L 130 50 L 130 140" stroke="#38bdf8" strokeWidth="1.5" />
          <path d="M 45 330 L 120 330 L 145 305 L 495 305 L 520 330 L 600 330" stroke="#38bdf8" strokeWidth="1.5" />
          <path d="M 600 35 L 530 35 L 510 55 L 510 150" stroke="#38bdf8" strokeWidth="1.5" />
          <circle cx="110" cy="30" r="2.5" fill="#fbbf24" />
          <circle cx="530" cy="35" r="2.5" fill="#fbbf24" />
          <circle cx="145" cy="305" r="2.5" fill="#fbbf24" />
          <circle cx="495" cy="305" r="2.5" fill="#fbbf24" />
        </svg>

        {/* Top Gold Edge Fingers (Visual representation of 60-Pin Connector on PCB Top Edge) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowHeaderPins((v) => !v);
          }}
          title="Click to expand 60-Pin Edge Connector Patch Bay"
          className="mx-auto mb-3 max-w-[380px] h-2.5 bg-[#041230] border border-amber-500/40 px-1 flex items-center justify-between gap-[2px] cursor-pointer hover:border-amber-300"
        >
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 bg-gradient-to-b from-amber-300 via-amber-400 to-yellow-600"
            />
          ))}
        </div>

        {/* 4 Corner M3 Brass/Gold Plated Mounting Standoffs */}
        {[
          'top-2.5 left-2.5',
          'top-2.5 right-2.5',
          'bottom-2.5 left-2.5',
          'bottom-2.5 right-2.5',
        ].map((pos, idx) => (
          <div
            key={idx}
            className={`absolute ${pos} w-4 h-4 rounded-full bg-[#06080d] border-[2.5px] border-amber-400/90 shadow-inner flex items-center justify-center`}
          >
            <div className="w-1.5 h-1.5 rounded-full border border-amber-500/40" />
          </div>
        ))}

        {/* Top PCB Silkscreen Bar: VIDI X Logo + 5x WS2812B Addressable RGB LEDs + System Tally LEDs */}
        <div className="relative z-10 flex items-center justify-between px-4 mb-3">
          {/* Silkscreen Brand */}
          <div className="flex items-baseline gap-2 font-mono">
            <span className="font-black tracking-tighter text-base text-white">
              VIDI <span className="text-amber-400">X</span>
            </span>
            <span className="text-[9px] text-sky-200/70 tracking-widest uppercase">
              REV 1.1 // CROATIA
            </span>
          </div>

          {/* 5x Addressable WS2812B 5050 RGB LEDs (GPIO 26) */}
          <div
            className="flex items-center gap-2 px-2.5 py-1 bg-[#051842]/90 border border-sky-300/20"
            title="5x WS2812B Addressable RGB LEDs (FastLED on GPIO 26)"
          >
            <span className="text-[8px] font-mono text-sky-200/70 uppercase">WS2812(26)</span>
            <div className="flex items-center gap-1.5">
              {state.rgbLeds.map((led, idx) => {
                const isLit = state.poweredOn && (led.r > 0 || led.g > 0 || led.b > 0);
                const rgbCss = `rgb(${led.r}, ${led.g}, ${led.b})`;
                return (
                  <div
                    key={idx}
                    className="w-3 h-3 bg-[#10141d] border border-zinc-600 flex items-center justify-center"
                    title={`RGB LED #${idx + 1}: (${led.r}, ${led.g}, ${led.b})`}
                  >
                    <div
                      className="w-2 h-2 rounded-full transition-colors"
                      style={{
                        backgroundColor: isLit ? rgbCss : '#1e2430',
                        boxShadow: isLit ? `0 0 8px ${rgbCss}` : 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Discrete SMD Status LEDs: PWR, STAT(IO2), RF, SD */}
          <div className="flex items-center gap-2.5 font-mono text-[9px] text-sky-100/80">
            <div className="flex items-center gap-1" title="3.3V Power Rail LED">
              <span
                className={`w-2 h-2 rounded-xs ${
                  state.leds.power
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-zinc-800'
                }`}
              />
              <span>PWR</span>
            </div>
            <div className="flex items-center gap-1" title="Blue Status LED (GPIO 2)">
              <span
                className={`w-2 h-2 rounded-xs ${
                  state.leds.status
                    ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8]'
                    : 'bg-zinc-800'
                }`}
              />
              <span>STAT(2)</span>
            </div>
            <div className="flex items-center gap-1" title="RF / ESP-NOW Transceiver LED">
              <span
                className={`w-2 h-2 rounded-xs ${
                  state.leds.wifi
                    ? 'bg-amber-300 shadow-[0_0_8px_#fcd34d]'
                    : 'bg-zinc-800'
                }`}
              />
              <span>RF</span>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* MAIN 3-SECTION CONSOLE LAYOUT                                       */}
        {/* =================================================================== */}
        <div className="relative z-10 grid grid-cols-[136px_1fr_136px] items-center gap-3">
          {/* LEFT WING: Onboard Sensors + Tactile D-Pad + Select/Start */}
          <div className="flex flex-col items-center justify-between h-full py-1 gap-2">
            {/* Physical Sensor Packages on PCB (Click to open Stimulus bar) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowSensors((v) => !v);
              }}
              title="Click to adjust Microphone, LDR Light, MCP9700A Temp & IR Sensors"
              className="w-full p-1.5 bg-[#041844] border border-sky-300/25 hover:border-amber-300/70 transition-colors cursor-pointer font-mono"
            >
              <div className="flex items-center justify-between text-[8px] text-sky-200/70 mb-1">
                <span>SENSORS</span>
                <span className="text-amber-300">ADJ ▾</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                {/* MIC1 Package */}
                <div className="bg-[#071f54] p-1 border border-sky-400/20">
                  <div className="w-3.5 h-3.5 mx-auto rounded-full bg-zinc-800 border border-zinc-400 flex items-center justify-center mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  </div>
                  <div className="text-[8px] text-sky-200 font-bold">{state.sensors.micLevel}%</div>
                  <div className="text-[7px] text-sky-300/60">MIC14</div>
                </div>

                {/* LDR1 Photoresistor Package */}
                <div className="bg-[#071f54] p-1 border border-sky-400/20">
                  <div className="w-3.5 h-3.5 mx-auto rounded-full bg-amber-950 border border-amber-400/80 flex items-center justify-center mb-0.5">
                    <div className="w-2 h-0.5 bg-amber-300" />
                  </div>
                  <div className="text-[8px] text-amber-300 font-bold">
                    {state.sensors.lightLevel}%
                  </div>
                  <div className="text-[7px] text-sky-300/60">LDR39</div>
                </div>

                {/* MCP9700A Temp IC */}
                <div className="bg-[#071f54] p-1 border border-sky-400/20">
                  <div className="w-3.5 h-2.5 mx-auto my-0.5 bg-zinc-900 border border-zinc-500 flex items-center justify-center">
                    <span className="text-[6px] text-zinc-300">U4</span>
                  </div>
                  <div className="text-[8px] text-orange-300 font-bold">
                    {state.sensors.temperatureC.toFixed(0)}°
                  </div>
                  <div className="text-[7px] text-sky-300/60">TMP26</div>
                </div>
              </div>
            </div>

            {/* Physical 4-Switch Tactile D-Pad Cross */}
            <div className="relative w-[116px] h-[116px] my-1">
              {/* Silkscreen Cross Outline */}
              <div className="absolute inset-3 border border-dashed border-sky-200/25 rounded-full pointer-events-none" />

              {/* UP Switch (SW1) */}
              <div className="absolute top-0 left-[40px] w-9 h-9 bg-[#14171f] border border-zinc-500 p-1 flex items-center justify-center shadow-md">
                <button
                  {...bindBtn('UP')}
                  title="SW1 UP (GPIO 35 ADC=4095 | Key: W / Up)"
                  className={`w-full h-full rounded-full tactile-cap-yellow flex items-center justify-center text-[10px] font-black text-zinc-950 cursor-pointer ${
                    state.buttons.UP ? 'pressed' : ''
                  }`}
                >
                  ▲
                </button>
              </div>

              {/* LEFT Switch (SW3) */}
              <div className="absolute top-[40px] left-0 w-9 h-9 bg-[#14171f] border border-zinc-500 p-1 flex items-center justify-center shadow-md">
                <button
                  {...bindBtn('LEFT')}
                  title="SW3 LEFT (GPIO 34 ADC=4095 | Key: A / Left)"
                  className={`w-full h-full rounded-full tactile-cap-yellow flex items-center justify-center text-[10px] font-black text-zinc-950 cursor-pointer ${
                    state.buttons.LEFT ? 'pressed' : ''
                  }`}
                >
                  ◀
                </button>
              </div>

              {/* Center PCB Silkscreen Readout */}
              <div className="absolute top-[40px] left-[40px] w-9 h-9 flex flex-col items-center justify-center font-mono text-[7px] text-sky-200/80 leading-tight">
                <span>34:{adc34}</span>
                <span>35:{adc35}</span>
              </div>

              {/* RIGHT Switch (SW4) */}
              <div className="absolute top-[40px] right-0 w-9 h-9 bg-[#14171f] border border-zinc-500 p-1 flex items-center justify-center shadow-md">
                <button
                  {...bindBtn('RIGHT')}
                  title="SW4 RIGHT (GPIO 34 ADC=2000 | Key: D / Right)"
                  className={`w-full h-full rounded-full tactile-cap-yellow flex items-center justify-center text-[10px] font-black text-zinc-950 cursor-pointer ${
                    state.buttons.RIGHT ? 'pressed' : ''
                  }`}
                >
                  ▶
                </button>
              </div>

              {/* DOWN Switch (SW2) */}
              <div className="absolute bottom-0 left-[40px] w-9 h-9 bg-[#14171f] border border-zinc-500 p-1 flex items-center justify-center shadow-md">
                <button
                  {...bindBtn('DOWN')}
                  title="SW2 DOWN (GPIO 35 ADC=2000 | Key: S / Down)"
                  className={`w-full h-full rounded-full tactile-cap-yellow flex items-center justify-center text-[10px] font-black text-zinc-950 cursor-pointer ${
                    state.buttons.DOWN ? 'pressed' : ''
                  }`}
                >
                  ▼
                </button>
              </div>
            </div>

            {/* SELECT & START Microswitches (GPIO 27 Ladder) */}
            <div className="w-full flex items-center justify-between gap-1.5 px-1 font-mono">
              <button
                {...bindBtn('SELECT')}
                title="SELECT Button (GPIO 27 ADC=4095 | Key: Shift)"
                className={`flex-1 py-1 px-1.5 bg-[#14171f] border text-[8px] font-bold tracking-wider uppercase cursor-pointer ${
                  state.buttons.SELECT
                    ? 'border-amber-300 text-amber-300 translate-y-[1px]'
                    : 'border-zinc-500 text-zinc-200 hover:border-zinc-300 shadow-[0_2px_0_#05070a]'
                }`}
              >
                SELECT
              </button>
              <button
                {...bindBtn('START')}
                title="START Button (GPIO 27 ADC=2000 | Key: Enter)"
                className={`flex-1 py-1 px-1.5 bg-[#14171f] border text-[8px] font-bold tracking-wider uppercase cursor-pointer ${
                  state.buttons.START
                    ? 'border-amber-300 text-amber-300 translate-y-[1px]'
                    : 'border-zinc-500 text-zinc-200 hover:border-zinc-300 shadow-[0_2px_0_#05070a]'
                }`}
              >
                START
              </button>
            </div>
          </div>

          {/* CENTER: ILI9341 2.8" 320x240 TFT LCD MODULE + TOUCHSCREEN */}
          <div className="flex flex-col items-center">
            {/* Physical Red/Black ILI9341 Daughterboard Bezel */}
            <div className="relative p-2.5 bg-[#111319] border-2 border-[#2e3442] shadow-[inset_0_2px_6px_rgba(0,0,0,0.9),0_6px_20px_rgba(0,0,0,0.65)]">
              {/* Top Screen Module Silkscreen */}
              <div className="flex items-center justify-between text-[8px] font-mono text-zinc-400 mb-1 px-0.5">
                <span>ILI9341 2.8" TFT // 320×240 RGB565</span>
                <span
                  className={
                    state.touch.pressed
                      ? 'text-emerald-300 font-bold'
                      : hoverCoords
                      ? 'text-amber-300'
                      : 'text-amber-400/90'
                  }
                >
                  {state.touch.pressed
                    ? `TOUCH X:${state.touch.x} Y:${state.touch.y}`
                    : hoverCoords
                    ? `POS X:${hoverCoords[0]} Y:${hoverCoords[1]}`
                    : `LAST (${state.touch.x},${state.touch.y})`}
                </span>
              </div>

              {/* Active 320x240 Display Canvas */}
              <div className="relative border border-black bg-black overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={320}
                  height={240}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  className="w-[288px] h-[216px] sm:w-[320px] sm:h-[240px] block cursor-crosshair"
                  style={{ imageRendering: 'pixelated' }}
                />
                {pixelGrid && (
                  <div className="absolute inset-0 lcd-pixel-grid pointer-events-none" />
                )}
                {/* Live Screen Touch Event Coordinate Reticle & Readout */}
                {state.touch.pressed && (
                  <div
                    className="pointer-events-none absolute z-20"
                    style={{
                      left: `${(state.touch.x / 320) * 100}%`,
                      top: `${(state.touch.y / 240) * 100}%`,
                    }}
                  >
                    <div className="w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full border border-emerald-400 bg-emerald-400/20 shadow-[0_0_8px_#34d399]" />
                    <div
                      className={`absolute px-1.5 py-0.5 rounded bg-black/85 border border-emerald-400/80 font-mono text-[9px] font-bold text-emerald-300 whitespace-nowrap shadow-md ${
                        state.touch.x > 220 ? 'right-2' : 'left-2'
                      } ${state.touch.y < 28 ? 'top-2' : '-top-5'}`}
                    >
                      X:{state.touch.x} Y:{state.touch.y}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Gold Flex Ribbon Accent */}
              <div className="mt-1 flex items-center justify-between px-1">
                <span className="text-[7px] font-mono text-zinc-500">SPI: CS5 DC21 MOSI23 SCK18</span>
                <div className="w-14 h-1.5 bg-gradient-to-r from-amber-600/70 via-amber-400/80 to-amber-600/70 border border-amber-300/30" />
                <span className="text-[7px] font-mono text-zinc-500">T_CS14 IRQ2</span>
              </div>
            </div>

            {/* Bottom Edge Tactile System Switches: MENU(13), VOL-, VOL+, BOOT(0), EN */}
            <div className="flex items-center justify-center gap-1.5 mt-2.5 font-mono">
              <button
                {...bindBtn('MENU')}
                title="MENU Button (GPIO 13 | Key: M)"
                className={`px-2 py-0.5 bg-[#14171f] border text-[8px] font-bold uppercase cursor-pointer ${
                  state.buttons.MENU
                    ? 'border-amber-300 text-amber-300 translate-y-[1px]'
                    : 'border-zinc-500 text-zinc-200 hover:border-zinc-300 shadow-[0_2px_0_#05070a]'
                }`}
              >
                MENU(13)
              </button>
              <button
                {...bindBtn('VOL_DOWN')}
                className={`px-1.5 py-0.5 bg-[#14171f] border text-[8px] cursor-pointer ${
                  state.buttons.VOL_DOWN
                    ? 'border-amber-300 text-amber-300'
                    : 'border-zinc-600 text-zinc-300'
                }`}
              >
                VOL-
              </button>
              <button
                {...bindBtn('VOL_UP')}
                className={`px-1.5 py-0.5 bg-[#14171f] border text-[8px] cursor-pointer ${
                  state.buttons.VOL_UP
                    ? 'border-amber-300 text-amber-300'
                    : 'border-zinc-600 text-zinc-300'
                }`}
              >
                VOL+
              </button>
              <button
                {...bindBtn('BOOT')}
                title="ESP32 BOOT / Restart Button (GPIO 0)"
                className={`px-2 py-0.5 bg-[#14171f] border text-[8px] font-bold cursor-pointer ${
                  state.buttons.BOOT
                    ? 'border-amber-300 text-amber-300 translate-y-[1px]'
                    : 'border-zinc-500 text-amber-200/90 hover:border-amber-300 shadow-[0_2px_0_#05070a]'
                }`}
              >
                IO0/BOOT
              </button>
              <button
                {...bindBtn('RESET')}
                title="Hardware Reset (EN)"
                className="px-2 py-0.5 bg-rose-950/80 border border-rose-700/70 text-rose-200 text-[8px] font-bold hover:bg-rose-900 cursor-pointer shadow-[0_2px_0_#05070a]"
              >
                EN/RST
              </button>
            </div>
          </div>

          {/* RIGHT WING: ESP32-WROVER RF Shield Can + Tipka A & B + Piezo Buzzer */}
          <div className="flex flex-col items-center justify-between h-full py-1 gap-2">
            {/* Metallic ESP32-WROVER-E Module Can */}
            <div className="w-full p-2 bg-gradient-to-b from-zinc-300 via-zinc-400 to-zinc-500 border border-zinc-200 shadow-md text-zinc-950 font-mono">
              <div className="flex items-center justify-between border-b border-zinc-600/40 pb-0.5 mb-0.5">
                <span className="text-[8px] font-black tracking-tight">ESP32-WROVER</span>
                <span className="text-[7px] font-bold px-1 bg-zinc-900 text-amber-300">16MB</span>
              </div>
              <div className="text-[7px] text-zinc-800 leading-tight">
                <div>XTENSA LX6 240MHz</div>
                <div>8MB PSRAM // WIFI+BT</div>
              </div>
            </div>

            {/* Action Buttons Tipka A (GPIO 32) & Tipka B (GPIO 33) */}
            <div className="relative w-[116px] h-[108px] my-1">
              {/* Tipka B (Upper Right - GPIO 33) */}
              <div className="absolute top-1 right-1 flex flex-col items-center">
                <div className="w-12 h-12 bg-[#14171f] border border-zinc-500 p-1.5 flex items-center justify-center shadow-lg">
                  <button
                    {...bindBtn('B')}
                    title="Tipka B / Action Button B (GPIO 33 | Key: K / X)"
                    className={`w-full h-full rounded-full tactile-cap-green flex flex-col items-center justify-center font-mono font-black text-xs text-zinc-950 cursor-pointer ${
                      state.buttons.B ? 'pressed' : ''
                    }`}
                  >
                    <span>B</span>
                  </button>
                </div>
                <span className="text-[8px] font-mono text-sky-100/90 mt-0.5 font-bold">
                  TIPKA B (33)
                </span>
              </div>

              {/* Tipka A (Lower Left - GPIO 32) */}
              <div className="absolute bottom-1 left-1 flex flex-col items-center">
                <div className="w-12 h-12 bg-[#14171f] border border-zinc-500 p-1.5 flex items-center justify-center shadow-lg">
                  <button
                    {...bindBtn('A')}
                    title="Tipka A / Action Button A (GPIO 32 | Key: Space / J / Z)"
                    className={`w-full h-full rounded-full tactile-cap-red flex flex-col items-center justify-center font-mono font-black text-xs text-white cursor-pointer ${
                      state.buttons.A ? 'pressed' : ''
                    }`}
                  >
                    <span>A</span>
                  </button>
                </div>
                <span className="text-[8px] font-mono text-sky-100/90 mt-0.5 font-bold">
                  TIPKA A (32)
                </span>
              </div>
            </div>

            {/* Cylindrical Piezo Buzzer Package (BZ1 - GPIO 25) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
              }}
              title="Piezo Buzzer BZ1 (GPIO 25 / DAC1) — Click to Mute/Unmute"
              className={`w-full px-2 py-1.5 border font-mono flex items-center justify-between cursor-pointer transition-colors ${
                state.audio.active
                  ? 'bg-amber-400/20 border-amber-300 text-amber-200'
                  : 'bg-[#041844] border-sky-300/25 text-sky-200/80 hover:border-sky-300/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full bg-[#111318] border border-zinc-500 flex items-center justify-center ${
                    state.audio.active ? 'ring-2 ring-amber-400' : ''
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-zinc-700 border border-zinc-900" />
                </div>
                <div className="text-[8px] leading-tight">
                  <div className="font-bold">BZ1 (IO25)</div>
                  <div className="text-[7px] opacity-75">
                    {state.audio.muted ? 'MUTED' : 'DAC1/PWM'}
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-bold">
                {state.audio.active ? `${state.audio.frequency}Hz` : '0Hz'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Compile / Runtime Error Strip */}
      {state.compileError && (
        <div className="px-3 py-1.5 bg-rose-950 border-t border-rose-700 text-rose-200 text-[11px] font-mono">
          {state.compileError}
        </div>
      )}

      {/* Expandable Onboard Hardware Stimulus & Jumper Deck */}
      {showSensors && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-3 bg-[#090b10] border-t border-[#252a36] grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]"
        >
          {/* VIDIIC I2C MPU-6050 6-DoF Gyroscope + Accelerometer */}
          <div className="sm:col-span-2 p-2.5 bg-[#0f131c] border border-[#252a36]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-zinc-200 font-semibold">
                  SIMULATED EXTERNAL MPU-6050 // VIDIIC (0x68 | SCL=32 SDA=33)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400">
                  Roll: <strong className="text-zinc-100">{state.sensors.gyroRoll ?? 0}°</strong> | Pitch:{' '}
                  <strong className="text-zinc-100">{state.sensors.gyroPitch ?? 0}°</strong> | Yaw:{' '}
                  <strong className="text-zinc-100">{state.sensors.gyroYaw ?? 0}°</strong>
                </span>
                <button
                  onClick={() =>
                    onSensorChange({
                      gyroRoll: 0,
                      gyroPitch: 0,
                      gyroYaw: 0,
                      gyroRateX: 0,
                      gyroRateY: 0,
                      gyroRateZ: 0,
                    })
                  }
                  className="px-2 py-0.5 bg-[#18181b] hover:bg-[#27272a] border border-zinc-700 text-zinc-200 text-[10px] cursor-pointer"
                >
                  Level (0°)
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                  <span>Roll X (Tilt Left/Right)</span>
                  <span className="text-zinc-200">{state.sensors.gyroRoll ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={1}
                  value={state.sensors.gyroRoll ?? 0}
                  onChange={(e) =>
                    onSensorChange({ gyroRoll: parseInt(e.target.value, 10) })
                  }
                  className="w-full cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                  <span>Pitch Y (Tilt Fwd/Back)</span>
                  <span className="text-zinc-200">{state.sensors.gyroPitch ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={1}
                  value={state.sensors.gyroPitch ?? 0}
                  onChange={(e) =>
                    onSensorChange({ gyroPitch: parseInt(e.target.value, 10) })
                  }
                  className="w-full cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                  <span>Yaw Z (Heading)</span>
                  <span className="text-zinc-200">{state.sensors.gyroYaw ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={state.sensors.gyroYaw ?? 0}
                  onChange={(e) =>
                    onSensorChange({ gyroYaw: parseInt(e.target.value, 10) })
                  }
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Temperature Sensor Stimulus */}
          <div className="p-2 bg-[#0f131c] border border-[#252a36]">
            <div className="flex justify-between mb-1">
              <span className="text-zinc-300">U4 // MCP9700A TEMP (IO26)</span>
              <span className="text-orange-300 font-bold">
                {state.sensors.temperatureC.toFixed(1)} °C
              </span>
            </div>
            <input
              type="range"
              min={-10}
              max={60}
              step={0.5}
              value={state.sensors.temperatureC}
              onChange={(e) => onSensorChange({ temperatureC: parseFloat(e.target.value) })}
              className="w-full accent-orange-400 cursor-pointer"
            />
          </div>

          {/* LDR Light Sensor Stimulus */}
          <div className="p-2 bg-[#0f131c] border border-[#252a36]">
            <div className="flex justify-between mb-1">
              <span className="text-zinc-300">LDR1 // PHOTORESISTOR (IO39)</span>
              <span className="text-amber-300 font-bold">{state.sensors.lightLevel}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={state.sensors.lightLevel}
              onChange={(e) => onSensorChange({ lightLevel: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Microphone Preamp Stimulus */}
          <div className="p-2 bg-[#0f131c] border border-[#252a36]">
            <div className="flex justify-between mb-1">
              <span className="text-zinc-300">MIC1 // PREAMP GAIN (IO14/36)</span>
              <span className="text-cyan-300 font-bold">
                {state.sensors.micLevel}% @ {state.sensors.micFrequency}Hz
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={state.sensors.micLevel}
                onChange={(e) => onSensorChange({ micLevel: parseInt(e.target.value, 10) })}
                className="flex-1 accent-cyan-400 cursor-pointer"
              />
              <select
                value={state.sensors.micFrequency}
                onChange={(e) =>
                  onSensorChange({ micFrequency: parseInt(e.target.value, 10) })
                }
                className="bg-[#080a0f] border border-[#252a36] px-1 text-[10px] text-cyan-300"
              >
                <option value={220}>220Hz</option>
                <option value={440}>440Hz</option>
                <option value={880}>880Hz</option>
                <option value={1760}>1.7kHz</option>
              </select>
            </div>
          </div>

          {/* IR NEC Pulse Generator & Hardware Jumpers */}
          <div className="p-2 bg-[#0f131c] border border-[#252a36] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-zinc-300">IR1 // NEC TX (IO15)</span>
              <button
                onClick={() =>
                  onSensorChange({
                    dpadMapping:
                      state.sensors.dpadMapping === 'STD_34LR_35UD'
                        ? 'ALT_34UD_35LR'
                        : 'STD_34LR_35UD',
                  })
                }
                className="px-1.5 py-0.5 bg-[#080a0f] border border-[#2e3545] text-[9px] text-amber-300 cursor-pointer"
                title="Swap GPIO 34 / GPIO 35 D-Pad Polarity"
              >
                JP_DPAD: {state.sensors.dpadMapping === 'STD_34LR_35UD' ? '34=LR 35=UD' : '34=UD 35=LR'}
              </button>
            </div>
            <div className="flex items-center gap-1">
              {[0x45, 0x46, 0x47, 0x44, 0x40].map((code) => (
                <button
                  key={code}
                  onClick={() => onSendIr(code)}
                  className="flex-1 py-0.5 bg-[#080a0f] hover:bg-amber-400 hover:text-black text-zinc-300 border border-[#2e3545] text-[10px] cursor-pointer transition-colors"
                >
                  0x{code.toString(16).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Telemetry Strip */}
      <div className="px-3 py-1 bg-[#090b10] border-t border-[#252a36] flex items-center justify-between font-mono text-[10px] text-zinc-400">
        <div className="flex items-center gap-3">
          <span>
            ROM: <strong className="text-zinc-200 font-normal">{state.sketchName}</strong>
          </span>
          <span>T+{(state.uptimeMs / 1000).toFixed(1)}s</span>
        </div>
        <div className="flex items-center gap-3">
          <span>IO34:{adc34}</span>
          <span>IO35:{adc35}</span>
          {(state.wifiConnected || state.espNowInitialized) && (
            <span className="text-amber-300">
              RF:{state.espNowInitialized ? 'ESP-NOW' : state.wifiSsid}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
