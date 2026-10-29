import React, { useMemo, useState } from 'react';
import {
  Play,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FolderKanban,
  Cookie,
  Layers,
  Variable,
  Eye,
  X,
} from 'lucide-react';
import {
  BLOCK_COLORS,
  BLOCK_PALETTE,
  BlockCategory,
  BlockNode,
  BlockPaletteItem,
  BlockProgram,
  compileBlocksToArduino,
} from '../emulator/blocklyEngine';
import { BoardRuntimeInstance, VidiXClusterManager } from '../emulator/clusterManager';
import { UserProject } from '../emulator/projectStorage';
import { VidiXBoardView } from './VidiXBoardView';

interface BlockCodingStudioProps {
  cluster: VidiXClusterManager;
  boards: BoardRuntimeInstance[];
  selectedBoard: BoardRuntimeInstance;
  onSelectBoard: (boardId: string) => void;
  program: BlockProgram;
  onChangeProgram: (next: BlockProgram) => void;
  userProjects: UserProject[];
  activeProjectId: string;
  onSelectUserProject: (project: UserProject) => void;
  onCreateNewProject: (mode: 'cpp' | 'blocks' | 'python') => void;
}

const CATEGORY_LIST: Array<{ id: BlockCategory; label: string }> = [
  { id: 'display', label: 'TFT DISPLAY' },
  { id: 'controls', label: 'BUTTONS & TOUCH' },
  { id: 'leds', label: 'RGB & LEDS' },
  { id: 'audio', label: 'SPEAKER AUDIO' },
  { id: 'sensors', label: 'SENSORS & GYRO' },
  { id: 'variables', label: 'VARIABLES' },
  { id: 'logic', label: 'LOGIC & LOOPS' },
  { id: 'comms', label: 'SERIAL & ESP-NOW' },
];

const SELECT_OPTIONS_BY_KEY: Record<string, string[]> = {
  color: [
    'BLACK',
    'NAVY',
    'BLUE',
    'CYAN',
    'GREEN',
    'YELLOW',
    'ORANGE',
    'RED',
    'MAGENTA',
    'PURPLE',
    'WHITE',
  ],
  button: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'START', 'MENU'],
  state: ['HIGH', 'LOW'],
  filled: ['true', 'false'],
  sensor: ['TEMP', 'LIGHT', 'MIC', 'GYRO_ROLL', 'GYRO_PITCH', 'GYRO_YAW'],
  axis: ['ROLL', 'PITCH', 'YAW'],
  op: ['>', '<', '==', '!='],
  note: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'E5', 'G5', 'C6'],
};

export const BlockCodingStudio: React.FC<BlockCodingStudioProps> = ({
  cluster,
  boards,
  selectedBoard,
  onSelectBoard,
  program,
  onChangeProgram,
  userProjects,
  activeProjectId,
  onSelectUserProject,
  onCreateNewProject,
}) => {
  const [activeCategory, setActiveCategory] = useState<BlockCategory>('display');
  const [targetContainer, setTargetContainer] = useState<{
    section: 'setup' | 'loop';
    parentBlockId: string | null;
  }>({ section: 'loop', parentBlockId: null });
  const [newVarName, setNewVarName] = useState('');
  const [rightPanelMode, setRightPanelMode] = useState<'none' | 'board'>('none');

  const generatedCpp = useMemo(() => compileBlocksToArduino(program), [program]);

  const cloneProgram = (): BlockProgram =>
    JSON.parse(JSON.stringify(program)) as BlockProgram;

  const insertBlockIntoList = (
    list: BlockNode[],
    parentId: string | null,
    newNode: BlockNode
  ): boolean => {
    if (parentId === null) {
      list.push(newNode);
      return true;
    }
    for (const item of list) {
      if (item.id === parentId && item.children) {
        item.children.push(newNode);
        return true;
      }
      if (item.children && insertBlockIntoList(item.children, parentId, newNode)) {
        return true;
      }
    }
    return false;
  };

  const handleAddBlock = (def: BlockPaletteItem) => {
    const next = cloneProgram();
    const node: BlockNode = {
      id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: def.type,
      params: { ...def.defaultParams },
      children: def.isContainer ? [] : undefined,
    };
    const list =
      targetContainer.section === 'setup' ? next.setupBlocks : next.loopBlocks;
    const inserted = insertBlockIntoList(
      list,
      targetContainer.parentBlockId,
      node
    );
    if (!inserted) {
      list.push(node);
    }
    onChangeProgram(next);
  };

  const updateParamInList = (
    list: BlockNode[],
    blockId: string,
    key: string,
    value: string | number
  ): boolean => {
    for (const item of list) {
      if (item.id === blockId) {
        item.params[key] = value;
        return true;
      }
      if (item.children && updateParamInList(item.children, blockId, key, value)) {
        return true;
      }
    }
    return false;
  };

  const handleUpdateParam = (
    blockId: string,
    key: string,
    value: string | number
  ) => {
    const next = cloneProgram();
    if (!updateParamInList(next.setupBlocks, blockId, key, value)) {
      updateParamInList(next.loopBlocks, blockId, key, value);
    }
    onChangeProgram(next);
  };

  const removeFromList = (list: BlockNode[], blockId: string): boolean => {
    const idx = list.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    for (const item of list) {
      if (item.children && removeFromList(item.children, blockId)) {
        return true;
      }
    }
    return false;
  };

  const handleDeleteBlock = (blockId: string) => {
    const next = cloneProgram();
    if (!removeFromList(next.setupBlocks, blockId)) {
      removeFromList(next.loopBlocks, blockId);
    }
    if (targetContainer.parentBlockId === blockId) {
      setTargetContainer({ section: targetContainer.section, parentBlockId: null });
    }
    onChangeProgram(next);
  };

  const moveInList = (
    list: BlockNode[],
    blockId: string,
    dir: -1 | 1
  ): boolean => {
    const idx = list.findIndex((b) => b.id === blockId);
    if (idx !== -1) {
      const targetIdx = idx + dir;
      if (targetIdx >= 0 && targetIdx < list.length) {
        const [item] = list.splice(idx, 1);
        list.splice(targetIdx, 0, item);
      }
      return true;
    }
    for (const item of list) {
      if (item.children && moveInList(item.children, blockId, dir)) {
        return true;
      }
    }
    return false;
  };

  const handleMoveBlock = (blockId: string, dir: -1 | 1) => {
    const next = cloneProgram();
    if (!moveInList(next.setupBlocks, blockId, dir)) {
      moveInList(next.loopBlocks, blockId, dir);
    }
    onChangeProgram(next);
  };

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newVarName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!clean) return;
    if (program.variables.includes(clean)) return;
    const next = cloneProgram();
    next.variables.push(clean);
    onChangeProgram(next);
    setNewVarName('');
  };

  const handleDeleteVariable = (name: string) => {
    const next = cloneProgram();
    next.variables = next.variables.filter((v) => v !== name);
    onChangeProgram(next);
  };

  const renderBlockNode = (
    node: BlockNode,
    section: 'setup' | 'loop',
    depth = 0
  ): React.ReactNode => {
    const def = BLOCK_PALETTE.find((d) => d.type === node.type);
    if (!def) return null;
    const colors = BLOCK_COLORS[def.category];
    const isContainerSelected =
      targetContainer.section === section &&
      targetContainer.parentBlockId === node.id;

    return (
      <div
        key={node.id}
        style={{ marginLeft: depth * 18 }}
        className="mb-1.5 select-none"
      >
        <div
          className={`border ${colors.border} ${colors.bg} px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 transition ${
            isContainerSelected ? 'ring-2 ring-amber-400' : ''
          }`}
        >
          {/* Left: Block Label + Inline Parameter Editors */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`font-bold tracking-tight mr-1 ${colors.text}`}>
              {def.label}
            </span>

            {Object.entries({ ...def.defaultParams, ...node.params }).map(([key, val]) => {
              const allVarNames = Array.from(
                new Set([...program.variables, 'touchX', 'touchY'])
              );
              const selectOpts =
                key === 'var' || key === 'varName' || key === 'xVar' || key === 'yVar'
                  ? allVarNames
                  : SELECT_OPTIONS_BY_KEY[key];
              const isNumber = typeof def.defaultParams[key] === 'number';

              return (
                <label
                  key={key}
                  className="inline-flex items-center gap-1 bg-[#07090e]/90 border border-[#2d364d] px-1.5 py-0.5 text-[10px]"
                >
                  <span className="text-zinc-400">{key}:</span>
                  {selectOpts ? (
                    <select
                      value={String(val)}
                      onChange={(e) =>
                        handleUpdateParam(node.id, key, e.target.value)
                      }
                      className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer"
                    >
                      {selectOpts.map((opt) => (
                        <option
                          key={opt}
                          value={opt}
                          className="bg-[#0b0e15] text-zinc-100"
                        >
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={String(val)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        handleUpdateParam(
                          node.id,
                          key,
                          isNumber && !Number.isNaN(num) && raw.trim() !== ''
                            ? num
                            : raw
                        );
                      }}
                      className="w-16 bg-transparent text-cyan-300 font-bold focus:outline-none select-text"
                    />
                  )}
                </label>
              );
            })}
          </div>

          {/* Right: Container Target / Move Up / Move Down / Delete */}
          <div className="flex items-center gap-1">
            {def.isContainer && (
              <button
                onClick={() =>
                  setTargetContainer(
                    isContainerSelected
                      ? { section, parentBlockId: null }
                      : { section, parentBlockId: node.id }
                  )
                }
                className={`px-1.5 py-0.5 text-[9px] font-bold border cursor-pointer ${
                  isContainerSelected
                    ? 'bg-amber-400 text-black border-amber-300'
                    : 'bg-[#0b0e15] text-amber-300 border-amber-500/40 hover:border-amber-400'
                }`}
                title="Click to insert new blocks inside this IF/REPEAT container"
              >
                {isContainerSelected ? 'INSERTING INSIDE ✓' : '+ INSERT INSIDE'}
              </button>
            )}
            <button
              onClick={() => handleMoveBlock(node.id, -1)}
              className="p-0.5 text-zinc-400 hover:text-white cursor-pointer"
              title="Move Block Up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleMoveBlock(node.id, 1)}
              className="p-0.5 text-zinc-400 hover:text-white cursor-pointer"
              title="Move Block Down"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteBlock(node.id)}
              className="p-0.5 text-zinc-400 hover:text-rose-400 cursor-pointer"
              title="Delete Block"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Nested Children for Container Blocks */}
        {def.isContainer && (
          <div className="ml-3 pl-2 pt-1.5 pb-1 border-l-2 border-dashed border-amber-400/50 bg-[#070a10]/50">
            {node.children && node.children.length > 0 ? (
              node.children.map((ch) => renderBlockNode(ch, section, depth + 1))
            ) : (
              <div
                onClick={() =>
                  setTargetContainer({ section, parentBlockId: node.id })
                }
                className="text-[10px] text-zinc-500 italic py-1 px-2 cursor-pointer hover:text-amber-300"
              >
                Empty container — click "+ INSERT INSIDE" then click any block on the left palette
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const filteredBlocks = BLOCK_PALETTE.filter(
    (b) => b.category === activeCategory
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-[#07090e] font-mono text-zinc-100 select-none">
      {/* Left Column: Block Categories + Click-to-Insert Palette + Variable Manager */}
      <div className="w-80 border-r border-[#222836] bg-[#0b0e15] flex flex-col shrink-0">
        {/* User's Self Projects Saved in Browser Cookies */}
        <div className="p-2.5 border-b border-[#222836] bg-[#10141f]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold text-amber-300 tracking-wider flex items-center gap-1">
              <FolderKanban className="w-3 h-3" />
              MY SAVED BLOCK PROJECTS ({userProjects.filter((p) => p.mode === 'blocks').length})
            </span>
            <button
              onClick={() => onCreateNewProject('blocks')}
              className="px-1.5 py-0.5 bg-cyan-400 hover:bg-cyan-300 text-black font-black text-[9px] flex items-center gap-0.5 cursor-pointer"
              title="Create a new Visual Block project in browser cookies"
            >
              <Plus className="w-2.5 h-2.5 stroke-[3]" />
              <span>NEW</span>
            </button>
          </div>
          <select
            value={
              userProjects.some((p) => p.id === activeProjectId && p.mode === 'blocks')
                ? activeProjectId
                : ''
            }
            onChange={(e) => {
              const picked = userProjects.find((p) => p.id === e.target.value);
              if (picked) {
                onSelectUserProject(picked);
              }
            }}
            className="w-full bg-[#07090e] border border-[#2a3144] px-2 py-1.5 text-[11px] text-zinc-100 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="" disabled>
              Select My Saved Block Project...
            </option>
            {userProjects
              .filter((p) => p.mode === 'blocks')
              .map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
          </select>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-2 gap-1 p-2 border-b border-[#222836] bg-[#090c12]">
          {CATEGORY_LIST.map((cat) => {
            const active = activeCategory === cat.id;
            const colors = BLOCK_COLORS[cat.id];
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2 py-1.5 text-left text-[10px] font-bold border transition cursor-pointer ${
                  active
                    ? `${colors.bg} ${colors.border} text-white ring-1 ring-white/20`
                    : 'bg-[#0f131d] border-[#232a3b] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Block Palette List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          <div className="text-[9px] text-zinc-400 mb-1 flex items-center justify-between">
            <span>CLICK BLOCK TO INSERT INTO:</span>
            <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-300 font-bold">
              {targetContainer.section.toUpperCase()}
              {targetContainer.parentBlockId ? ' (NESTED)' : ''}
            </span>
          </div>

          {filteredBlocks.map((def) => {
            const colors = BLOCK_COLORS[def.category];
            return (
              <button
                key={def.type}
                onClick={() => handleAddBlock(def)}
                className={`w-full text-left p-2 border ${colors.border} ${colors.bg} hover:brightness-125 transition flex items-center justify-between group cursor-pointer`}
              >
                <div>
                  <div
                    className={`text-xs font-bold flex items-center gap-1 ${colors.text}`}
                  >
                    <span>{def.label}</span>
                    {def.isContainer && (
                      <span className="text-[8px] px-1 bg-black/50 text-amber-300 border border-amber-400/40">
                        CONTAINER
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    {def.description}
                  </div>
                </div>
                <Plus className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Global Integer Variables Manager */}
        <div className="p-2.5 border-t border-[#222836] bg-[#0e121b]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-300 mb-1.5">
            <Variable className="w-3.5 h-3.5" />
            <span>GLOBAL VARIABLES (INT)</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-950/60 border border-cyan-500/40 text-[10px] text-cyan-200"
              title="Built-in Screen Touch X Coordinate (0..319)"
            >
              <strong>touchX</strong>
              <span className="text-[8px] text-cyan-400">TOUCH</span>
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-950/60 border border-cyan-500/40 text-[10px] text-cyan-200"
              title="Built-in Screen Touch Y Coordinate (0..239)"
            >
              <strong>touchY</strong>
              <span className="text-[8px] text-cyan-400">TOUCH</span>
            </span>
            {program.variables.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-950/60 border border-orange-500/40 text-[10px] text-orange-200"
              >
                <strong>{v}</strong>
                <button
                  onClick={() => handleDeleteVariable(v)}
                  className="text-orange-400 hover:text-rose-300 ml-0.5 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddVariable} className="flex gap-1">
            <input
              type="text"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="New variable name..."
              className="flex-1 min-w-0 bg-[#07090e] border border-[#283044] px-2 py-1 text-[10px] text-zinc-100 select-text"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-orange-400 hover:bg-orange-300 text-black font-bold text-[10px] cursor-pointer"
            >
              +VAR
            </button>
          </form>
        </div>
      </div>

      {/* Center Column: Visual Block Canvas (SETUP Stack + LOOP Stack) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#07090e] overflow-hidden">
        {/* Top Action Bar */}
        <div className="h-11 px-3 bg-[#0e121b] border-b border-[#222836] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-zinc-100">
              {program.name}
            </span>
            <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[9px] hidden sm:flex items-center gap-1">
              <Cookie className="w-3 h-3" />
              SAVED IN COOKIES
            </span>
            <select
              value={selectedBoard.state.id}
              onChange={(e) => onSelectBoard(e.target.value)}
              className="bg-[#07090e] border border-[#2a3144] px-2 py-1 text-[10px] text-amber-300 font-bold"
            >
              {boards.map((b) => (
                <option key={b.state.id} value={b.state.id}>
                  TARGET: {b.state.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const newId = cluster.addBoard(generatedCpp, program.name, true);
                onSelectBoard(newId);
              }}
              className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              title="Add another VIDI X board"
            >
              <Plus className="w-3 h-3" />
              <span>ADD UNIT</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                cluster.updateSketch(
                  selectedBoard.state.id,
                  generatedCpp,
                  program.name
                );
                cluster.startBoard(selectedBoard.state.id);
              }}
              className="px-3.5 py-1 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-[10px] flex items-center gap-1.5 shadow-[0_0_15px_rgba(52,211,153,0.3)] cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              COMPILE BLOCKS & FLASH
            </button>

            {/* Optional Live Hardware Preview Toggle */}
            <button
              onClick={() =>
                setRightPanelMode((m) => (m === 'board' ? 'none' : 'board'))
              }
              className={`px-2.5 py-1 text-[10px] font-bold border flex items-center gap-1 cursor-pointer ${
                rightPanelMode === 'board'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                  : 'bg-[#151a28] text-zinc-400 border-[#283044] hover:text-zinc-200'
              }`}
              title="Toggle optional Live VIDI X Hardware Preview panel"
            >
              <Eye className="w-3 h-3" />
              <span>
                {rightPanelMode === 'board' ? 'HIDE BOARD' : 'PREVIEW BOARD'}
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Block Stacks */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 1. void setup() Block Hat */}
          <div className="border border-[#263044] bg-[#0b0f17] p-3">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#1f2738]">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-cyan-500 text-black font-black text-[10px]">
                  WHEN VIDI X BOOTS — void setup()
                </span>
                <span className="text-[10px] text-zinc-400">
                  Runs once at power-on (TFT + FastLED + Pin init automatic)
                </span>
              </div>
              <button
                onClick={() =>
                  setTargetContainer({ section: 'setup', parentBlockId: null })
                }
                className={`px-2 py-0.5 text-[10px] font-bold border cursor-pointer ${
                  targetContainer.section === 'setup' &&
                  targetContainer.parentBlockId === null
                    ? 'bg-amber-400 text-black border-amber-300'
                    : 'bg-[#141a26] text-zinc-300 border-[#2c354d]'
                }`}
              >
                {targetContainer.section === 'setup' &&
                targetContainer.parentBlockId === null
                  ? 'ACTIVE TARGET ✓'
                  : 'TARGET SETUP'}
              </button>
            </div>

            {program.setupBlocks.length === 0 ? (
              <div
                onClick={() =>
                  setTargetContainer({ section: 'setup', parentBlockId: null })
                }
                className="py-4 text-center text-xs text-zinc-500 border border-dashed border-[#242c3f] cursor-pointer hover:border-cyan-400/50"
              >
                Click "TARGET SETUP" and pick blocks from the left palette to run on startup
              </div>
            ) : (
              program.setupBlocks.map((b) => renderBlockNode(b, 'setup', 0))
            )}
          </div>

          {/* 2. void loop() Block Hat */}
          <div className="border border-[#263044] bg-[#0b0f17] p-3">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#1f2738]">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-400 text-black font-black text-[10px]">
                  FOREVER HARDWARE LOOP — void loop()
                </span>
                <span className="text-[10px] text-zinc-400">
                  Repeats continuously at 60 FPS
                </span>
              </div>
              <button
                onClick={() =>
                  setTargetContainer({ section: 'loop', parentBlockId: null })
                }
                className={`px-2 py-0.5 text-[10px] font-bold border cursor-pointer ${
                  targetContainer.section === 'loop' &&
                  targetContainer.parentBlockId === null
                    ? 'bg-amber-400 text-black border-amber-300'
                    : 'bg-[#141a26] text-zinc-300 border-[#2c354d]'
                }`}
              >
                {targetContainer.section === 'loop' &&
                targetContainer.parentBlockId === null
                  ? 'ACTIVE TARGET ✓'
                  : 'TARGET LOOP'}
              </button>
            </div>

            {program.loopBlocks.length === 0 ? (
              <div
                onClick={() =>
                  setTargetContainer({ section: 'loop', parentBlockId: null })
                }
                className="py-6 text-center text-xs text-zinc-500 border border-dashed border-[#242c3f] cursor-pointer hover:border-emerald-400/50"
              >
                Click "TARGET LOOP" and pick blocks from the left palette to run every frame
              </div>
            ) : (
              program.loopBlocks.map((b) => renderBlockNode(b, 'loop', 0))
            )}
          </div>
        </div>
      </div>

      {/* Optional Right Column: Live Interactive VIDI X Tester */}
      {rightPanelMode === 'board' && (
        <div className="w-[540px] border-l border-[#222836] bg-[#0b0e15] flex flex-col shrink-0">
          <div className="h-11 px-3 border-b border-[#222836] bg-[#10141f] flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-300">
              LIVE VIDI X UNIT ({selectedBoard.state.name})
            </span>

            <button
              onClick={() => setRightPanelMode('none')}
              className="px-2 py-1 bg-[#161c2a] hover:bg-rose-950/60 text-zinc-300 hover:text-rose-300 border border-[#2c354d] text-[10px] flex items-center gap-1 cursor-pointer"
              title="Close optional preview panel"
            >
              <X className="w-3 h-3" />
              CLOSE
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center">
            <div className="scale-[0.88] origin-top">
              <VidiXBoardView
                instance={selectedBoard}
                isSelected={true}
                canRemove={false}
                pendingWirePin={null}
                onSelect={() => {}}
                onRemove={() => {}}
                onTogglePower={() => cluster.togglePower(selectedBoard.state.id)}
                onStart={() => cluster.startBoard(selectedBoard.state.id)}
                onStop={() => cluster.stopBoard(selectedBoard.state.id)}
                onReset={() => cluster.resetBoard(selectedBoard.state.id)}
                onButtonChange={(btn, pressed) =>
                  cluster.setButtonState(selectedBoard.state.id, btn, pressed)
                }
                onTouchChange={(pressed, x, y) =>
                  cluster.setTouchState(selectedBoard.state.id, {
                    pressed,
                    x,
                    y,
                    z: pressed ? 2000 : 0,
                  })
                }
                onSensorChange={(partial) =>
                  cluster.updateSensors(selectedBoard.state.id, partial)
                }
                onSendIr={(code) =>
                  cluster.sendIrCommandToBoard(selectedBoard.state.id, code)
                }
                onToggleMute={() =>
                  cluster.setAudioMuted(
                    selectedBoard.state.id,
                    !selectedBoard.state.audio.muted
                  )
                }
                onPinClickForWire={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
