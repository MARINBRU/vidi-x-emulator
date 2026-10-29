import React, { useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Terminal,
  Cable,
  HardDrive,
  Puzzle,
  Trash2,
  Send,
  Plus,
  X,
  Activity,
  Save,
  Minus,
  Maximize2,
  GripHorizontal,
} from 'lucide-react';
import { BoardRuntimeInstance } from '../emulator/clusterManager';
import { globalExtensionRegistry } from '../emulator/extensions/registry';
import { EXPANSION_HEADER_PINS } from '../emulator/pinout';
import { WireConnection, WirelessPacket } from '../emulator/types';

export type InstrumentWindowId =
  | 'serial'
  | 'scope'
  | 'interconnect'
  | 'pins'
  | 'sd'
  | 'extensions';

export interface FloatingWindowState {
  id: InstrumentWindowId;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
}

interface MultiWindowManagerProps {
  openWindows: FloatingWindowState[];
  onCloseWindow: (id: InstrumentWindowId) => void;
  onFocusWindow: (id: InstrumentWindowId) => void;
  onMoveWindow: (id: InstrumentWindowId, x: number, y: number) => void;
  onToggleMinimize: (id: InstrumentWindowId) => void;
  onToggleMaximize: (id: InstrumentWindowId) => void;
  boards: BoardRuntimeInstance[];
  selectedBoard: BoardRuntimeInstance;
  onSelectBoard: (boardId: string) => void;
  wires: WireConnection[];
  wirelessPackets: WirelessPacket[];
  onAddWire: (fromBoard: string, fromGpio: number, toBoard: string, toGpio: number) => void;
  onRemoveWire: (wireId: string) => void;
  onAutoWireBoards: (boardA: string, boardB: string) => void;
  onClearWireless: () => void;
  onSendSerial: (boardId: string, text: string) => void;
  onClearSerial: (boardId: string) => void;
  onWriteSdFile: (boardId: string, name: string, content: string) => void;
  onDeleteSdFile: (boardId: string, name: string) => void;
  onAttachExtension: (boardId: string, extId: string) => void;
  onDetachExtension: (boardId: string, extId: string) => void;
}

const GPIO_OPTIONS = EXPANSION_HEADER_PINS.filter((p) => p.gpio !== null);

export const WINDOW_META: Record<
  InstrumentWindowId,
  { label: string; short: string; icon: React.FC<{ className?: string }>; accent: string }
> = {
  serial: { label: 'UART0 SERIAL MONITOR', short: 'UART0', icon: Terminal, accent: 'text-emerald-400' },
  scope: { label: '8-CH LOGIC & ADC SCOPE', short: 'SCOPE', icon: Activity, accent: 'text-cyan-400' },
  interconnect: { label: '60P WIRES & RF BUS', short: 'PATCH/RF', icon: Cable, accent: 'text-purple-400' },
  pins: { label: 'ESP32 GPIO MATRIX', short: 'GPIO', icon: Cpu, accent: 'text-amber-300' },
  sd: { label: 'SPI MICROSD STORAGE', short: 'SD-FS', icon: HardDrive, accent: 'text-sky-400' },
  extensions: { label: '60P EXTENSION BUS', short: 'EXT-BUS', icon: Puzzle, accent: 'text-rose-400' },
};

const SCOPE_CHANNELS = [
  { gpio: 34, name: 'IO34 D-PAD L/R', color: '#fbbf24' },
  { gpio: 35, name: 'IO35 D-PAD U/D', color: '#38bdf8' },
  { gpio: 32, name: 'IO32 TIPKA A', color: '#f43f5e' },
  { gpio: 33, name: 'IO33 TIPKA B', color: '#4ade80' },
  { gpio: 14, name: 'IO14 MIC PRE', color: '#22d3ee' },
  { gpio: 39, name: 'IO39 LDR LIGHT', color: '#facc15' },
  { gpio: 26, name: 'IO26 TEMP/RGB', color: '#fb923c' },
  { gpio: 25, name: 'IO25 PIEZO SPK', color: '#c084fc' },
];

export const MultiWindowManager: React.FC<MultiWindowManagerProps> = ({
  openWindows,
  onCloseWindow,
  onFocusWindow,
  onMoveWindow,
  onToggleMinimize,
  onToggleMaximize,
  boards,
  selectedBoard,
  onSelectBoard,
  wires,
  wirelessPackets,
  onAddWire,
  onRemoveWire,
  onAutoWireBoards,
  onClearWireless,
  onSendSerial,
  onClearSerial,
  onWriteSdFile,
  onDeleteSdFile,
  onAttachExtension,
  onDetachExtension,
}) => {
  const [serialInput, setSerialInput] = useState('');
  const [scopePaused, setScopePaused] = useState(false);
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [wireFromBoard, setWireFromBoard] = useState<string>(boards[0]?.state.id || '');
  const [wireFromGpio, setWireFromGpio] = useState<number>(17);
  const [wireToBoard, setWireToBoard] = useState<string>(
    boards[1]?.state.id || boards[0]?.state.id || ''
  );
  const [wireToGpio, setWireToGpio] = useState<number>(16);

  const [newSdName, setNewSdName] = useState('/data.txt');
  const [newSdContent, setNewSdContent] = useState('VIDI_X_LOG=1\n');

  // Dragging state
  const dragRef = useRef<{
    id: InstrumentWindowId;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const { state } = selectedBoard;
  const isScopeOpen = openWindows.some((w) => w.id === 'scope' && !w.minimized);

  // Render 8-channel Logic & ADC Oscilloscope Canvas whenever the scope window is open
  useEffect(() => {
    if (!isScopeOpen || scopePaused) return;
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);

    const chHeight = h / SCOPE_CHANNELS.length;

    ctx.strokeStyle = '#141923';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const history = state.logicHistory;

    SCOPE_CHANNELS.forEach((ch, idx) => {
      const topY = idx * chHeight;
      const bottomY = topY + chHeight - 5;
      const usableH = chHeight - 12;

      ctx.strokeStyle = '#1d2331';
      ctx.beginPath();
      ctx.moveTo(0, topY + chHeight);
      ctx.lineTo(w, topY + chHeight);
      ctx.stroke();

      ctx.fillStyle = ch.color;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(ch.name, 8, topY + 12);

      const currentVal = history[history.length - 1]?.pins[ch.gpio] ?? 0;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${currentVal}`, 115, topY + 12);

      if (history.length > 1) {
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
          const val = Math.min(4095, Math.max(0, history[i].pins[ch.gpio] ?? 0));
          const x = 152 + ((w - 160) * i) / 120;
          const y = bottomY - (val / 4095) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  }, [isScopeOpen, scopePaused, state.logicHistory, state.uptimeMs]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const { id, startX, startY, origX, origY } = dragRef.current;
      const nx = Math.max(8, Math.min(window.innerWidth - 220, origX + (e.clientX - startX)));
      const ny = Math.max(52, Math.min(window.innerHeight - 80, origY + (e.clientY - startY)));
      onMoveWindow(id, nx, ny);
    };
    const handlePointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onMoveWindow]);

  if (openWindows.length === 0) return null;

  const availableExtensions = globalExtensionRegistry.listAvailable();

  const renderWindowBody = (winId: InstrumentWindowId) => {
    switch (winId) {
      case 'serial':
        return (
          <div className="flex flex-col h-full gap-2">
            <div className="flex items-center justify-between bg-[#080a0f] border border-[#252a38] px-2.5 py-1.5 text-[10px]">
              <span>
                <strong className="text-emerald-400">{state.name}</strong> // UART0 115200 8N1
              </span>
              <button
                onClick={() => onClearSerial(state.id)}
                className="px-2 py-0.5 bg-[#141926] hover:bg-[#1f2637] text-zinc-300 border border-[#2a3142] cursor-pointer"
              >
                CLEAR
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 bg-[#05070b] border border-[#252a38] text-xs space-y-1 select-text">
              {state.serialLog.length === 0 ? (
                <div className="text-zinc-600 text-center py-8">-- NO SERIAL FRAMES --</div>
              ) : (
                state.serialLog.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.direction === 'sys'
                        ? 'text-amber-400'
                        : msg.direction === 'rx'
                        ? 'text-cyan-400'
                        : 'text-emerald-300'
                    }
                  >
                    <span className="text-zinc-600 mr-1.5">
                      [{new Date(msg.timestamp).toLocaleTimeString()}]
                    </span>
                    {msg.text}
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!serialInput.trim()) return;
                onSendSerial(state.id, serialInput);
                setSerialInput('');
              }}
              className="flex gap-1"
            >
              <input
                type="text"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                placeholder={`Send string to ${state.name} RX0...`}
                className="flex-1 bg-[#06080c] border border-[#2a3142] px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-400 select-text"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                TX
              </button>
            </form>
          </div>
        );

      case 'scope':
        return (
          <div className="flex flex-col h-full gap-2">
            <div className="flex items-center justify-between bg-[#080a0f] border border-[#252a38] px-2.5 py-1.5 text-[10px]">
              <span>
                <strong className="text-cyan-400">{state.name}</strong> // 8-CH HARDWARE WAVEFORM (50ms/div)
              </span>
              <button
                onClick={() => setScopePaused((p) => !p)}
                className={`px-2 py-0.5 font-bold border cursor-pointer ${
                  scopePaused
                    ? 'bg-amber-400 text-black border-amber-300'
                    : 'bg-[#141926] text-cyan-300 border-cyan-500/40'
                }`}
              >
                {scopePaused ? 'RESUME' : 'FREEZE'}
              </button>
            </div>
            <div className="flex-1 bg-[#05070b] border border-[#252a38] p-1.5 flex flex-col min-h-0">
              <canvas
                ref={scopeCanvasRef}
                width={480}
                height={310}
                className="w-full h-full block border border-[#191f2c]"
              />
            </div>
          </div>
        );

      case 'interconnect':
        return (
          <div className="flex flex-col gap-3">
            <div className="p-2.5 bg-[#080a0f] border border-[#252a38]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-amber-300">
                  60-PIN EXPANSION PATCH BAY
                </span>
                {boards.length >= 2 && (
                  <button
                    onClick={() => onAutoWireBoards(boards[0].state.id, boards[1].state.id)}
                    className="px-2 py-0.5 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/50 text-[9px] font-bold cursor-pointer"
                  >
                    AUTO-PATCH UNIT #1 ↔ #2
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-2 p-2 bg-[#0c1018] border border-[#1d2230] text-[11px]">
                <div>
                  <label className="block text-[8px] text-zinc-400 mb-0.5">SOURCE</label>
                  <div className="flex gap-1">
                    <select
                      value={wireFromBoard}
                      onChange={(e) => setWireFromBoard(e.target.value)}
                      className="flex-1 bg-[#06080c] border border-[#2a3142] px-1 py-0.5 text-[10px]"
                    >
                      {boards.map((b) => (
                        <option key={b.state.id} value={b.state.id}>
                          {b.state.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={wireFromGpio}
                      onChange={(e) => setWireFromGpio(Number(e.target.value))}
                      className="w-20 bg-[#06080c] border border-[#2a3142] px-1 py-0.5 text-[10px]"
                    >
                      {GPIO_OPTIONS.map((p) => (
                        <option key={p.headerPin} value={p.gpio!}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] text-zinc-400 mb-0.5">TARGET</label>
                  <div className="flex gap-1">
                    <select
                      value={wireToBoard}
                      onChange={(e) => setWireToBoard(e.target.value)}
                      className="flex-1 bg-[#06080c] border border-[#2a3142] px-1 py-0.5 text-[10px]"
                    >
                      {boards.map((b) => (
                        <option key={b.state.id} value={b.state.id}>
                          {b.state.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={wireToGpio}
                      onChange={(e) => setWireToGpio(Number(e.target.value))}
                      className="w-20 bg-[#06080c] border border-[#2a3142] px-1 py-0.5 text-[10px]"
                    >
                      {GPIO_OPTIONS.map((p) => (
                        <option key={p.headerPin} value={p.gpio!}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => onAddWire(wireFromBoard, wireFromGpio, wireToBoard, wireToGpio)}
                  className="col-span-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  PATCH JUMPER WIRE
                </button>
              </div>

              {wires.length > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {wires.map((w) => {
                    const bFrom = boards.find((b) => b.state.id === w.fromBoardId);
                    const bTo = boards.find((b) => b.state.id === w.toBoardId);
                    const sigHigh = bFrom?.state.pins[w.fromGpio]?.digitalValue === 1;
                    return (
                      <div
                        key={w.id}
                        className="flex items-center justify-between px-2 py-1 bg-[#0c1018] border border-[#1f2534] text-[10px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2" style={{ backgroundColor: w.color }} />
                          <span>
                            {bFrom?.state.name}:<strong className="text-cyan-300">IO{w.fromGpio}</strong>
                          </span>
                          <span className="text-zinc-500">→</span>
                          <span>
                            {bTo?.state.name}:<strong className="text-amber-300">IO{w.toGpio}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] px-1 ${
                              sigHigh ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500'
                            }`}
                          >
                            {sigHigh ? '3.3V' : '0V'}
                          </span>
                          <button
                            onClick={() => onRemoveWire(w.id)}
                            className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-2.5 bg-[#080a0f] border border-[#252a38] flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-purple-300">
                  RF PACKET SNIFFER (ESP-NOW / UDP / BT / IR)
                </span>
                <button
                  onClick={onClearWireless}
                  className="text-[9px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  CLEAR
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 text-[10px]">
                {wirelessPackets.length === 0 ? (
                  <div className="text-center py-4 text-zinc-600">-- NO RF FRAMES --</div>
                ) : (
                  wirelessPackets.slice(0, 35).map((pkt) => (
                    <div
                      key={pkt.id}
                      className="p-1 bg-[#0c1018] border border-[#1d2230] flex items-center justify-between gap-2"
                    >
                      <span className="px-1 text-[8px] font-bold bg-purple-950 text-purple-300 border border-purple-700/50 shrink-0">
                        {pkt.protocol}
                      </span>
                      <span className="text-zinc-400 shrink-0">{pkt.fromMac.slice(-5)}</span>
                      <span className="text-amber-300 truncate flex-1">{pkt.payload}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      case 'pins':
        return (
          <div className="bg-[#080a0f] border border-[#252a38] p-2">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-[#252a38] text-zinc-400 text-[9px]">
                  <th className="py-1 px-1.5">PIN</th>
                  <th className="py-1 px-1.5">FUNCTION</th>
                  <th className="py-1 px-1.5">MODE</th>
                  <th className="py-1 px-1.5">LVL</th>
                  <th className="py-1 px-1.5">ADC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#151922]">
                {GPIO_OPTIONS.map((def) => {
                  const p = state.pins[def.gpio!];
                  if (!p) return null;
                  const voltage = ((p.analogValue / 4095) * 3.3).toFixed(2);
                  return (
                    <tr key={def.headerPin} className="hover:bg-[#10141f]">
                      <td className="py-1 px-1.5 font-bold text-cyan-300">IO{def.gpio}</td>
                      <td className="py-1 px-1.5 text-zinc-300 truncate max-w-[140px]">
                        {def.description}
                      </td>
                      <td className="py-1 px-1.5 text-zinc-400">{p.mode}</td>
                      <td className="py-1 px-1.5">
                        <span
                          className={`px-1 font-bold ${
                            p.digitalValue === 1
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'text-zinc-500'
                          }`}
                        >
                          {p.digitalValue === 1 ? 'HI' : 'LO'}
                        </span>
                      </td>
                      <td className="py-1 px-1.5 text-amber-300">
                        {p.analogValue} <span className="text-zinc-500">({voltage}V)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );

      case 'sd':
        return (
          <div className="flex flex-col gap-2.5">
            <div className="p-2.5 bg-[#080a0f] border border-[#252a38]">
              <div className="text-[10px] font-bold text-sky-300 mb-1.5">
                WRITE FILE TO {state.name} MICROSD (CS=IO22)
              </div>
              <div className="flex gap-1.5 mb-1.5">
                <input
                  type="text"
                  value={newSdName}
                  onChange={(e) => setNewSdName(e.target.value)}
                  className="flex-1 bg-[#05070b] border border-[#252a38] px-2 py-1 text-xs text-zinc-100 select-text"
                />
                <button
                  onClick={() => onWriteSdFile(state.id, newSdName, newSdContent)}
                  className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3 h-3" />
                  SAVE
                </button>
              </div>
              <textarea
                rows={2}
                value={newSdContent}
                onChange={(e) => setNewSdContent(e.target.value)}
                className="w-full bg-[#05070b] border border-[#252a38] p-1.5 text-xs text-zinc-200 select-text"
              />
            </div>

            <div className="space-y-1.5">
              {Object.values(state.sdFiles).map((file) => (
                <div
                  key={file.name}
                  className="p-2 bg-[#080a0f] border border-[#252a38] text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sky-300 font-bold">{file.name}</span>
                    <button
                      onClick={() => onDeleteSdFile(state.id, file.name)}
                      className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <pre className="text-[10px] text-zinc-300 whitespace-pre-wrap bg-[#05070b] p-1.5 border border-[#191e2b]">
                    {file.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        );

      case 'extensions':
        return (
          <div className="space-y-2">
            {availableExtensions.map((ext) => {
              const isAttached = state.attachedExtensions.some(
                (a) => a.extensionId === ext.id
              );
              return (
                <div
                  key={ext.id}
                  className="p-2.5 bg-[#080a0f] border border-[#252a38] flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <span>{ext.name}</span>
                      <span className="text-[9px] px-1 bg-[#161c28] text-amber-300">
                        IO:{ext.usedGpios.join(',')}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{ext.description}</p>
                  </div>
                  {isAttached ? (
                    <button
                      onClick={() => onDetachExtension(state.id, ext.id)}
                      className="px-2 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold shrink-0 cursor-pointer"
                    >
                      DETACH
                    </button>
                  ) : (
                    <button
                      onClick={() => onAttachExtension(state.id, ext.id)}
                      className="px-2 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold shrink-0 cursor-pointer"
                    >
                      ATTACH
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
    }
  };

  return (
    <>
      {openWindows.map((win) => {
        const meta = WINDOW_META[win.id];
        const Icon = meta.icon;

        const style: React.CSSProperties = win.maximized
          ? {
              position: 'fixed',
              top: 52,
              left: 12,
              right: 12,
              bottom: 36,
              zIndex: win.zIndex,
            }
          : {
              position: 'fixed',
              left: win.x,
              top: win.y,
              width: win.width,
              height: win.minimized ? 'auto' : win.height,
              zIndex: win.zIndex,
            };

        return (
          <div
            key={win.id}
            style={style}
            onPointerDown={() => onFocusWindow(win.id)}
            className="flex flex-col bg-[#0c0f16]/98 border border-[#32394c] shadow-[0_20px_60px_rgba(0,0,0,0.85)] select-none font-mono overflow-hidden"
          >
            {/* Draggable Window Title Bar */}
            <div
              onPointerDown={(e) => {
                if (win.maximized) return;
                onFocusWindow(win.id);
                dragRef.current = {
                  id: win.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: win.x,
                  origY: win.y,
                };
              }}
              className="flex items-center justify-between px-3 py-1.5 bg-[#141926] border-b border-[#2a3040] cursor-move"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.accent}`} />
                <span className="font-bold text-[11px] tracking-wider text-zinc-100 truncate">
                  {meta.label}
                </span>
                {boards.length > 1 && (
                  <select
                    value={state.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => onSelectBoard(e.target.value)}
                    className="ml-1 bg-[#080a0f] border border-[#2a3040] px-1.5 py-0.2 text-[10px] text-amber-300 cursor-pointer"
                  >
                    {boards.map((b) => (
                      <option key={b.state.id} value={b.state.id}>
                        {b.state.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 shrink-0"
              >
                <button
                  onClick={() => onToggleMinimize(win.id)}
                  title={win.minimized ? 'Restore Window' : 'Shade / Minimize Window'}
                  className="p-1 text-zinc-400 hover:text-white hover:bg-[#22293a] cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onToggleMaximize(win.id)}
                  title={win.maximized ? 'Restore Size' : 'Maximize Window'}
                  className="p-1 text-zinc-400 hover:text-white hover:bg-[#22293a] cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onCloseWindow(win.id)}
                  title="Close Window"
                  className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/50 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Window Body (Hidden when Minimized/Shaded) */}
            {!win.minimized && (
              <div className="flex-1 overflow-y-auto p-2.5 flex flex-col min-h-0">
                {renderWindowBody(win.id)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
