import React, { useEffect, useState } from 'react';
import {
  Play,
  RotateCcw,
  AlertTriangle,
  Copy,
  FileCode2,
  Cpu,
  Terminal,
  Send,
  FolderKanban,
  Plus,
  Cookie,
  Eye,
  EyeOff,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  X,
} from 'lucide-react';
import { BoardRuntimeInstance, VidiXClusterManager } from '../emulator/clusterManager';
import { exportForRealVidiXHardware, needsVidiXDisplayConfig } from '../emulator/hardwareExporter';
import { DEFAULT_STARTER_CPP, UserProject } from '../emulator/projectStorage';
import { VidiXBoardView } from './VidiXBoardView';

interface ArduinoCodeStudioProps {
  cluster: VidiXClusterManager;
  boards: BoardRuntimeInstance[];
  selectedBoard: BoardRuntimeInstance;
  onSelectBoard: (boardId: string) => void;
  userProjects: UserProject[];
  activeProjectId: string;
  onSelectUserProject: (project: UserProject) => void;
  onSaveActiveCode: (code: string) => void;
  onCreateNewProject: (mode: 'cpp' | 'blocks' | 'python') => void;
}

const PIN_REFERENCE = [
  { macro: 'VIDIIC / MPU-6050', pin: '32 / 33', note: 'External I2C gyro & accel (0x68)' },
  { macro: 'TFT_CS / TFT_DC', pin: '5 / 21', note: 'ILI9341 320x240 SPI TFT' },
  { macro: 'TOUCH_CS / TOUCH_IRQ', pin: '4 / 12', note: 'XPT2046 Resistive Touch' },
  { macro: 'BTN_LR / UP_DOWN', pin: '34 / 35', note: 'D-Pad Analog (>4000 / ~2000)' },
  { macro: 'Tipka_A / BTN_A', pin: '32', note: 'Action A (INPUT_PULLUP)' },
  { macro: 'Tipka_B / BTN_B', pin: '33 / 27', note: 'Action B / Start-Select' },
  { macro: 'BTN_MENU', pin: '13', note: 'Menu / Relay Digital' },
  { macro: 'LED_PIN', pin: '26', note: '5x WS2812B RGB LEDs (FastLED)' },
  { macro: 'STATUS_LED', pin: '2', note: 'Blue Status Indicator LED' },
  { macro: 'SPEAKER_PIN', pin: '25', note: 'Piezo Speaker PWM / tone()' },
  { macro: 'MIC_PIN', pin: '14 / 36', note: 'Analog Microphone Preamp' },
  { macro: 'LIGHT_PIN', pin: '39', note: 'LDR Ambient Light Sensor' },
  { macro: 'TEMP_PIN', pin: '26', note: 'MCP9700A Temp Sensor' },
  { macro: 'SD_CS', pin: '22', note: 'MicroSD Card SPI CS' },
  { macro: 'UART2 TX/RX', pin: '17 / 16', note: '60-Pin Expansion Serial2' },
];

const PYTHON_API_REFERENCE = [
  { macro: 'MPU-6050 (optional)', pin: 'board.VIDIIC()', note: 'External sensor; gyro example reads I2C without a library' },
  { macro: 'VIDIIC / A / B', pin: 'GPIO 32 / 33', note: 'Shared pins: A/B unavailable while I2C is in use' },
  { macro: 'board.DISPLAY', pin: 'ILI9341', note: 'Set display.root_group to a displayio.Group' },
  { macro: 'displayio', pin: 'Scene graph', note: 'Bitmap, Palette, TileGrid, Group; built-in terminalio for text' },
  { macro: 'xpt2046_circuitpython', pin: 'board.TOUCH_CS', note: 'x, y = touch.get_coordinates()' },
  { macro: 'analogio.AnalogIn', pin: 'BTN_L_R / UP_DOWN', note: '>60000 (Left/Up), 30000..60000 (Right/Down)' },
  { macro: 'digitalio.DigitalInOut', pin: 'BTN_A / BTN_B', note: 'Pull.UP, not switch.value' },
  { macro: 'neopixel.NeoPixel', pin: 'board.RGB_LED', note: 'pixels = NeoPixel(board.RGB_LED, 5)' },
  { macro: 'simpleio.tone()', pin: 'board.GPIO25', note: 'simpleio.tone(board.GPIO25, 440, duration=0.2)' },
  { macro: 'pwmio.PWMOut', pin: 'board.STATUS', note: 'led.duty_cycle = 32768 (0..65535)' },
];

export const ArduinoCodeStudio: React.FC<ArduinoCodeStudioProps> = ({
  cluster,
  boards,
  selectedBoard,
  onSelectBoard,
  userProjects,
  activeProjectId,
  onSelectUserProject,
  onSaveActiveCode,
  onCreateNewProject,
}) => {
  const { state } = selectedBoard;
  const [draftCode, setDraftCode] = useState(state.sketchCode);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [cookieSavedBadge, setCookieSavedBadge] = useState(false);
  const [serialInput, setSerialInput] = useState('');

  // Optional sidebars & previews (Live Hardware Preview & Serial Dock are optional and off by default)
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [showSerialDock, setShowSerialDock] = useState(false);

  const activeProject = userProjects.find((p) => p.id === activeProjectId);
  const isPythonProject = activeProject?.mode === 'python';
  const currentModeProjects = userProjects.filter((p) =>
    isPythonProject ? p.mode === 'python' : p.mode === 'cpp'
  );

  useEffect(() => {
    setDraftCode(state.sketchCode);
  }, [state.id, state.sketchCode]);

  const lineCount = draftCode.split('\n').length;

  const handleFlash = () => {
    onSaveActiveCode(draftCode);
    cluster.updateSketch(state.id, draftCode, activeProject?.name || state.sketchName);
    cluster.startBoard(state.id);
    setCookieSavedBadge(true);
    setTimeout(() => setCookieSavedBadge(false), 1400);
  };

  const handleExportRealHardware = () => {
    const safeName = (state.sketchName || state.name || 'vidi_x_sketch')
      .replace(/[^a-z0-9]+/gi, '_')
      .toLowerCase();
    if (isPythonProject) {
      const blob = new Blob([draftCode], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'code.py';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const hwCode = exportForRealVidiXHardware(draftCode, state.sketchName || state.name);
    const blob = new Blob([hwCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}_real_hw.ino`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#080a0f] font-mono text-zinc-100 select-none">
      {/* Optional Left Sidebar: User Cookie Projects + VIDI X Hardware Cheat Sheet */}
      {showLeftSidebar && (
        <div className="w-72 border-r border-[#222836] bg-[#0b0e15] flex flex-col shrink-0">
          {/* Target Board Selector */}
          <div className="p-2.5 border-b border-[#222836] bg-[#10141f]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[9px] text-zinc-400 font-bold tracking-wider">
                TARGET VIDI X HARDWARE UNIT
              </label>
              <button
                onClick={() => {
                  const newId = cluster.addBoard(
                    draftCode || DEFAULT_STARTER_CPP,
                    activeProject?.name || 'My VIDI X Sketch',
                    true
                  );
                  onSelectBoard(newId);
                }}
                className="px-1.5 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[9px] cursor-pointer"
                title="Add another VIDI X board"
              >
                + ADD UNIT
              </button>
            </div>
            <select
              value={state.id}
              onChange={(e) => onSelectBoard(e.target.value)}
              className="w-full bg-[#07090e] border border-[#2a3144] px-2 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400"
            >
              {boards.map((b) => (
                <option key={b.state.id} value={b.state.id}>
                  {b.state.name} ({b.state.macAddress})
                </option>
              ))}
            </select>
          </div>

          {/* User's Self Projects Saved in Browser Cookies */}
          <div className="p-2.5 border-b border-[#222836]">
            <div className="flex items-center justify-between gap-1.5 mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300 tracking-wider">
                <FolderKanban className="w-3.5 h-3.5" />
                <span>
                  {isPythonProject
                    ? `PYTHON PROJECTS (${currentModeProjects.length})`
                    : `C++ PROJECTS (${currentModeProjects.length})`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isPythonProject ? (
                  <button
                    onClick={() => onCreateNewProject('python')}
                    className="px-1.5 py-0.5 bg-[#222226] hover:bg-[#2e2e34] border border-zinc-600 text-zinc-200 font-bold text-[9px] flex items-center gap-0.5 cursor-pointer"
                    title="Create a new CircuitPython (.py) project in browser cookies"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>NEW PYTHON</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onCreateNewProject('cpp')}
                    className="px-1.5 py-0.5 bg-[#222226] hover:bg-[#2e2e34] border border-zinc-600 text-zinc-200 font-bold text-[9px] flex items-center gap-0.5 cursor-pointer"
                    title="Create a new Arduino C++ (.ino) project in browser cookies"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>NEW C++</span>
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {currentModeProjects.map((proj) => {
                const isSelected = proj.id === activeProjectId;
                return (
                  <button
                    key={proj.id}
                    onClick={() => onSelectUserProject(proj)}
                    className={`w-full text-left p-2 border transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400/15 border-amber-400 text-white'
                        : 'bg-[#111622] hover:bg-[#171e2e] border-[#242b3d] text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold truncate">{proj.name}</span>
                      <span className="text-[8px] px-1 bg-[#0b0e15] text-zinc-300 border border-zinc-600 shrink-0">
                        {proj.mode === 'python' ? 'PYTHON' : 'C++'}
                      </span>
                    </div>
                    <div className="text-[9px] text-zinc-400 truncate mt-0.5">
                      {proj.sketchCode.split('\n').length} lines • Saved in Cookies
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* VIDI X v1.1 Pinout / CircuitPython API Reference */}
          <div className="flex-1 overflow-y-auto p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300 tracking-wider mb-2">
              <Cpu className="w-3.5 h-3.5" />
              <span>
                {isPythonProject
                  ? 'VIDI X CIRCUITPYTHON + GYRO API'
                  : 'VIDI X v1.1 PIN & GYRO REFERENCE'}
              </span>
            </div>
            <div className="space-y-1 text-[10px]">
              {(isPythonProject ? PYTHON_API_REFERENCE : PIN_REFERENCE).map((item) => (
                <div
                  key={item.macro}
                  className="p-1.5 bg-[#0e121b] border border-[#1d2332] flex flex-col"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300">{item.macro}</span>
                    <span className="px-1 bg-[#181f2e] text-amber-300 font-bold text-[9px]">
                      {isPythonProject ? item.pin : `GPIO ${item.pin}`}
                    </span>
                  </div>
                  <span className="text-[9px] text-zinc-400 mt-0.5">{item.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Center Column: Code Editor (.ino or .py) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#06080c]">
        {/* Editor Action Toolbar */}
        <div className="h-10 px-3 bg-[#0e121b] border-b border-[#222836] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowLeftSidebar((v) => !v)}
              className="p-1 text-zinc-400 hover:text-white bg-[#161b28] border border-[#2c3347] cursor-pointer"
              title={showLeftSidebar ? 'Hide ROM & Pin Sidebar' : 'Show ROM & Pin Sidebar'}
            >
              {showLeftSidebar ? (
                <PanelLeftClose className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftOpen className="w-3.5 h-3.5" />
              )}
            </button>
            <FileCode2 className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="text-xs font-bold text-zinc-100 truncate">
              {activeProject?.name || state.sketchName}
            </span>
            <span className="px-1.5 py-0.5 bg-[#1b1b20] border border-zinc-600 text-zinc-200 text-[10px] shrink-0">
              {isPythonProject ? 'Python (.py)' : 'C++ (.ino)'}
            </span>
            <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] hidden sm:flex items-center gap-1 shrink-0">
              <Cookie className="w-3 h-3" />
              {cookieSavedBadge ? 'SAVED TO COOKIES ✓' : `COOKIE AUTO-SAVE (${lineCount} LINES)`}
            </span>
            {state.compileError && (
              <span className="px-2 py-0.5 bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[10px] flex items-center gap-1 shrink-0">
                <AlertTriangle className="w-3 h-3" />
                COMPILE ERROR
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={async () => {
                const outCode = isPythonProject
                  ? draftCode
                  : exportForRealVidiXHardware(
                      draftCode,
                      state.sketchName || state.name
                    );
                try {
                  await navigator.clipboard.writeText(outCode);
                  setCopyStatus('copied');
                } catch {
                  setCopyStatus('error');
                }
                setTimeout(() => setCopyStatus('idle'), 2500);
              }}
              className="px-2.5 py-1 bg-[#161b28] hover:bg-[#1f2637] text-zinc-300 border border-[#2c3347] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              title={isPythonProject
                ? 'Copy Python code to the clipboard'
                : 'Copy an .ino for the VIDI X compiler without changing your project'}
            >
              <Copy className="w-3 h-3" />
              {copyStatus === 'copied'
                ? 'COPIED!'
                : copyStatus === 'error'
                ? 'COPY FAILED'
                : isPythonProject
                ? 'COPY .PY'
                : 'COPY .INO'}
            </button>

            <button
              onClick={handleExportRealHardware}
              className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              title={
                isPythonProject
                  ? 'Download code.py to upload to your VIDI X'
                  : 'Download ready-to-flash Arduino IDE (.ino) sketch for a physical VIDI X v1.1 (ESP32-WROVER)'
              }
            >
              <Download className="w-3 h-3" />
              <span>{isPythonProject ? 'EXPORT .PY' : 'EXPORT REAL HW .INO'}</span>
            </button>

            <button
              onClick={() => cluster.resetBoard(state.id)}
              className="px-2.5 py-1 bg-[#161b28] hover:bg-[#1f2637] text-zinc-200 border border-[#2c3347] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              REBOOT
            </button>

            <button
              onClick={handleFlash}
              className="px-3.5 py-1 bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] flex items-center gap-1.5 shadow-[0_0_15px_rgba(251,191,36,0.3)] cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              COMPILE & FLASH
            </button>

            {/* Optional Serial Console Toggle */}
            <button
              onClick={() => setShowSerialDock((v) => !v)}
              className={`px-2.5 py-1 text-[10px] font-bold border flex items-center gap-1 cursor-pointer ${
                showSerialDock
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-[#161b28] text-zinc-400 border-[#2c3347] hover:text-zinc-200'
              }`}
              title="Toggle optional bottom UART0 Serial Monitor"
            >
              <Terminal className="w-3 h-3" />
              <span>SERIAL</span>
            </button>

            {/* Optional Live Hardware Preview Toggle */}
            <button
              onClick={() => setShowLivePreview((v) => !v)}
              className={`px-2.5 py-1 text-[10px] font-bold border flex items-center gap-1 cursor-pointer ${
                showLivePreview
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-[#161b28] text-zinc-400 border-[#2c3347] hover:text-zinc-200'
              }`}
              title="Toggle optional live VIDI X Hardware Preview panel"
            >
              {showLivePreview ? (
                <EyeOff className="w-3 h-3" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
              <span>{showLivePreview ? 'HIDE PREVIEW' : 'PREVIEW BOARD'}</span>
            </button>
          </div>
        </div>

        {!isPythonProject && needsVidiXDisplayConfig(draftCode) && (
          <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-900 text-zinc-200 text-xs" role="status">
            This sketch needs the VIDI X display setup for a real board. Use COPY .INO or EXPORT REAL HW .INO to add it without changing your saved project.
          </div>
        )}
        {isPythonProject && /# VIDI X CircuitPython \(.py\)/.test(draftCode) && /mpu\.(roll|pitch)|display\.(fill_rectangle|circle|text)\s*\(/.test(draftCode) && (
          <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-900 text-zinc-200 text-xs" role="status">
            This edited older starter uses simulator-only display or gyro methods. Its code is unchanged; create a new Python project for a hardware-compatible starter and copy your changes across.
          </div>
        )}
        {isPythonProject && /^\s*(?:import\s+adafruit_mpu6050\b|from\s+adafruit_mpu6050\s+import\b)/m.test(draftCode) && (
          <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-900 text-zinc-200 text-xs" role="status">
            This project contains an adafruit_mpu6050 import. If that code runs on the board, it needs the library. The updated Gyroscope premade reads an external sensor without it; your code remains unchanged.
          </div>
        )}
        {copyStatus === 'error' && (
          <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-900 text-zinc-200 text-xs" role="alert">
            Clipboard access failed. Use the export button to download the file instead.
          </div>
        )}

        {/* Compile Error Banner if any */}
        {state.compileError && (
          <div className="px-3 py-2 bg-rose-950/90 border-b border-rose-500/60 text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="select-text">{state.compileError}</span>
          </div>
        )}

        {/* Code Editor with Line Numbers */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="w-11 py-3 bg-[#080a10] border-r border-[#1a202c] text-right pr-2.5 text-[11px] leading-[1.45rem] text-zinc-600 select-none overflow-hidden">
            {Array.from({ length: Math.max(1, lineCount) }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            value={draftCode}
            onChange={(e) => {
              const next = e.target.value;
              setDraftCode(next);
              onSaveActiveCode(next);
            }}
            spellCheck={false}
            className="flex-1 h-full bg-[#05070b] text-emerald-300 p-3 text-xs leading-[1.45rem] font-mono focus:outline-none resize-none select-text overflow-y-auto"
          />
        </div>

        {/* Optional Bottom Integrated Serial Console Dock */}
        {showSerialDock && (
          <div className="h-44 border-t border-[#222836] bg-[#090c12] flex flex-col shrink-0">
            <div className="px-3 py-1 bg-[#10141f] border-b border-[#1e2433] flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold text-zinc-200">
                  UART0 SERIAL MONITOR ({state.name} @ 115200 BAUD)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => cluster.clearSerialLog(state.id)}
                  className="text-zinc-400 hover:text-white text-[9px] cursor-pointer"
                >
                  CLEAR LOG
                </button>
                <button
                  onClick={() => setShowSerialDock(false)}
                  className="text-zinc-400 hover:text-rose-400 cursor-pointer"
                  title="Close Serial Dock"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 text-[11px] space-y-0.5 select-text">
              {state.serialLog.length === 0 ? (
                <div className="text-zinc-600">-- NO SERIAL OUTPUT --</div>
              ) : (
                state.serialLog.slice(-30).map((msg) => (
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
                    <span className="text-zinc-600 mr-2">
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
                cluster.sendSerialInput(state.id, serialInput);
                setSerialInput('');
              }}
              className="flex border-t border-[#1e2433]"
            >
              <input
                type="text"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                placeholder={`Send serial command to ${state.name}...`}
                className="flex-1 bg-[#05070b] px-2.5 py-1 text-xs text-zinc-100 focus:outline-none select-text"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-emerald-500 text-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                SEND
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Optional Right Column: Live Interactive VIDI X Hardware Preview */}
      {showLivePreview && (
        <div className="w-[540px] border-l border-[#222836] bg-[#0b0e15] p-3 overflow-y-auto flex flex-col items-center shrink-0">
          <div className="w-full flex items-center justify-between mb-2 px-1 pb-1.5 border-b border-[#1d2332]">
            <span className="text-[10px] font-bold text-cyan-300 tracking-wider">
              OPTIONAL LIVE HARDWARE PREVIEW
            </span>
            <button
              onClick={() => setShowLivePreview(false)}
              className="px-2 py-0.5 bg-[#161b28] hover:bg-rose-950/60 text-zinc-300 hover:text-rose-300 border border-[#2c3347] text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              CLOSE PREVIEW
            </button>
          </div>
          <div className="scale-[0.88] origin-top">
            <VidiXBoardView
              instance={selectedBoard}
              isSelected={true}
              canRemove={false}
              pendingWirePin={null}
              onSelect={() => {}}
              onRemove={() => {}}
              onTogglePower={() => cluster.togglePower(state.id)}
              onStart={() => cluster.startBoard(state.id)}
              onStop={() => cluster.stopBoard(state.id)}
              onReset={() => cluster.resetBoard(state.id)}
              onButtonChange={(btn, pressed) =>
                cluster.setButtonState(state.id, btn, pressed)
              }
              onTouchChange={(pressed, x, y) =>
                cluster.setTouchState(state.id, { pressed, x, y, z: pressed ? 2000 : 0 })
              }
              onSensorChange={(partial) => cluster.updateSensors(state.id, partial)}
              onSendIr={(code) => cluster.sendIrCommandToBoard(state.id, code)}
              onToggleMute={() => cluster.setAudioMuted(state.id, !state.audio.muted)}
              onPinClickForWire={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
};
