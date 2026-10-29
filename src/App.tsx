import { useEffect, useRef, useState } from 'react';
import { VidiXClusterManager } from './emulator/clusterManager';
import { VidiXBoardView } from './components/VidiXBoardView';
import {
  MultiWindowManager,
  FloatingWindowState,
  InstrumentWindowId,
} from './components/MultiWindowManager';
import { ArduinoCodeStudio } from './components/ArduinoCodeStudio';
import { BlockCodingStudio } from './components/BlockCodingStudio';
import { HomeScreen } from './components/HomeScreen';
import {
  BlockProgram,
  compileBlocksToArduino,
} from './emulator/blocklyEngine';
import {
  CookieStorageStats,
  DEFAULT_STARTER_CPP,
  DEFAULT_STARTER_PYTHON,
  PreMadeProject,
  UserProject,
  createStarterBlockProgram,
  getActiveProjectIdFromCookie,
  getCookieStorageStats,
  loadProjectsFromCookies,
  saveProjectsToCookies,
  setActiveProjectIdCookie,
} from './emulator/projectStorage';
import { ButtonId } from './emulator/types';

export type WorkspaceTab = 'home' | 'bench' | 'code' | 'blocks';

const DEFAULT_WINDOW_LAYOUT: Record<
  InstrumentWindowId,
  { x: number; y: number; width: number; height: number }
> = {
  serial: { x: 40, y: 68, width: 490, height: 390 },
  scope: { x: 550, y: 68, width: 530, height: 410 },
  interconnect: { x: 80, y: 120, width: 520, height: 450 },
  pins: { x: 620, y: 120, width: 500, height: 440 },
  sd: { x: 140, y: 150, width: 480, height: 400 },
  extensions: { x: 660, y: 150, width: 480, height: 360 },
};

export function App() {
  // Load user projects from browser cookies on boot
  const [userProjects, setUserProjects] = useState<UserProject[]>(() =>
    loadProjectsFromCookies()
  );
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const fromCookie = getActiveProjectIdFromCookie();
    const initialList = loadProjectsFromCookies();
    if (fromCookie && initialList.some((p) => p.id === fromCookie)) {
      return fromCookie;
    }
    return initialList[0]?.id || '';
  });
  const [cookieStats, setCookieStats] = useState<CookieStorageStats>(() =>
    getCookieStorageStats(loadProjectsFromCookies().length)
  );

  const clusterRef = useRef<VidiXClusterManager | null>(null);
  if (!clusterRef.current) {
    const mgr = new VidiXClusterManager();
    const firstBoard = mgr.getBoards()[0];
    const initialProjects = loadProjectsFromCookies();
    const initialActive =
      initialProjects.find((p) => p.id === getActiveProjectIdFromCookie()) ||
      initialProjects[0];
    if (firstBoard && initialActive) {
      mgr.updateSketch(
        firstBoard.state.id,
        initialActive.sketchCode,
        initialActive.name
      );
      mgr.startBoard(firstBoard.state.id);
    }
    clusterRef.current = mgr;
  }
  const cluster = clusterRef.current;

  const [, setTick] = useState(0);
  const boards = cluster.getBoards();

  const [selectedBoardId, setSelectedBoardId] = useState<string>(
    () => boards[0]?.state.id || ''
  );
  // Start on the Home Screen by default
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('home');

  // Pending 60-pin jumper wire click state on the hardware bench
  const [pendingWirePin, setPendingWirePin] = useState<{
    boardId: string;
    gpio: number;
  } | null>(null);

  // Multi-window state: multiple floating windows can be open simultaneously
  const [openWindows, setOpenWindows] = useState<FloatingWindowState[]>([]);
  const topZRef = useRef<number>(100);

  // Active Block Studio program state synced with the active user block project
  const [blockProgram, setBlockProgram] = useState<BlockProgram>(() => {
    const initialProjects = loadProjectsFromCookies();
    const blockProj =
      initialProjects.find((p) => p.id === activeProjectId && p.blockProgram) ||
      initialProjects.find((p) => p.mode === 'blocks' && p.blockProgram);
    return blockProj?.blockProgram
      ? (JSON.parse(JSON.stringify(blockProj.blockProgram)) as BlockProgram)
      : createStarterBlockProgram('My Block Game');
  });

  useEffect(() => {
    return cluster.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, [cluster]);

  const selectedBoard =
    boards.find((b) => b.state.id === selectedBoardId) || boards[0];

  const activeUserProject =
    userProjects.find((p) => p.id === activeProjectId) || userProjects[0];

  // Helper to persist user projects into browser cookies and refresh cookie stats
  const commitProjectsToCookies = (
    nextProjects: UserProject[],
    nextActiveId = activeProjectId
  ) => {
    setUserProjects(nextProjects);
    setActiveProjectId(nextActiveId);
    const stats = saveProjectsToCookies(nextProjects, nextActiveId);
    setCookieStats(stats);
  };

  // Keyboard shortcuts: when 2+ boards exist, WASD+Z/Space controls Unit #1 and Arrows+J/Enter controls Unit #2 simultaneously!
  useEffect(() => {
    const singleBoardMap: Record<string, ButtonId> = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      KeyW: 'UP',
      KeyS: 'DOWN',
      KeyA: 'LEFT',
      KeyD: 'RIGHT',
      KeyZ: 'A',
      Space: 'A',
      KeyJ: 'A',
      KeyX: 'B',
      KeyK: 'B',
      Enter: 'START',
      ShiftRight: 'SELECT',
      KeyM: 'MENU',
    };

    const p1KeyMap: Record<string, ButtonId> = {
      KeyW: 'UP',
      KeyS: 'DOWN',
      KeyA: 'LEFT',
      KeyD: 'RIGHT',
      KeyZ: 'A',
      Space: 'A',
      KeyX: 'B',
      KeyQ: 'START',
    };

    const p2KeyMap: Record<string, ButtonId> = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      KeyJ: 'A',
      Enter: 'A',
      KeyK: 'B',
      ShiftRight: 'START',
    };

    const handleKey = (e: KeyboardEvent, pressed: boolean) => {
      if (activeTab === 'home') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const currentBoards = cluster.getBoards();

      if (currentBoards.length >= 2) {
        const b1 = p1KeyMap[e.code];
        if (b1 && currentBoards[0]) {
          e.preventDefault();
          cluster.setButtonState(currentBoards[0].state.id, b1, pressed);
          return;
        }
        const b2 = p2KeyMap[e.code];
        if (b2 && currentBoards[1]) {
          e.preventDefault();
          cluster.setButtonState(currentBoards[1].state.id, b2, pressed);
          return;
        }
      }

      const btn = singleBoardMap[e.code];
      if (btn && selectedBoard) {
        e.preventDefault();
        cluster.setButtonState(selectedBoard.state.id, btn, pressed);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => handleKey(e, true);
    const handleKeyUp = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [cluster, selectedBoard, activeTab]);

  // ============================================================================
  // Cookie-Saved User Project Actions & Pre-Made Playable Project Launcher
  // ============================================================================
  const loadProjectOntoBoards = (
    sketchCode: string,
    sketchName: string,
    boardCount: 1 | 2
  ) => {
    if (boardCount === 2) {
      while (cluster.getBoards().length < 2) {
        cluster.addBoard(sketchCode, sketchName, true);
      }
      cluster.loadSketchToAllBoards(sketchCode, sketchName);
    } else {
      const target = selectedBoard || cluster.getBoards()[0];
      if (target) {
        cluster.updateSketch(target.state.id, sketchCode, sketchName);
        cluster.startBoard(target.state.id);
      }
    }
  };

  const handleCreateProject = (
    mode: 'cpp' | 'blocks' | 'python',
    customName?: string
  ) => {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const name =
      customName ||
      (mode === 'cpp'
        ? `My VIDI X Sketch #${userProjects.length + 1}`
        : mode === 'python'
        ? `My Python Gyro App #${userProjects.length + 1}`
        : `My Block Project #${userProjects.length + 1}`);
    const starterBlockProg =
      mode === 'blocks' ? createStarterBlockProgram(name) : undefined;
    const sketchCode =
      mode === 'blocks' && starterBlockProg
        ? compileBlocksToArduino(starterBlockProg)
        : mode === 'python'
        ? DEFAULT_STARTER_PYTHON
        : DEFAULT_STARTER_CPP;

    const newProj: UserProject = {
      id,
      name,
      description:
        mode === 'cpp'
          ? 'Custom Arduino C++ (.ino) project saved in browser cookies'
          : mode === 'python'
          ? 'Custom CircuitPython (.py) + Gyro project saved in browser cookies'
          : 'Custom Visual Block project saved in browser cookies',
      mode,
      sketchCode,
      blockProgram: starterBlockProg,
      boardCount: 1,
      updatedAt: Date.now(),
    };

    const next = [newProj, ...userProjects];
    commitProjectsToCookies(next, newProj.id);

    if (starterBlockProg) {
      setBlockProgram(starterBlockProg);
    }
    loadProjectOntoBoards(newProj.sketchCode, newProj.name, 1);
    setActiveTab(mode === 'blocks' ? 'blocks' : 'code');
  };

  const handleOpenUserProject = (
    proj: UserProject,
    destination: 'bench' | 'code' | 'blocks'
  ) => {
    setActiveProjectId(proj.id);
    setActiveProjectIdCookie(proj.id);
    if (proj.blockProgram) {
      setBlockProgram(JSON.parse(JSON.stringify(proj.blockProgram)) as BlockProgram);
    }
    loadProjectOntoBoards(proj.sketchCode, proj.name, proj.boardCount || 1);
    setActiveTab(destination);
  };

  const handleSelectUserProjectInEditor = (proj: UserProject) => {
    setActiveProjectId(proj.id);
    setActiveProjectIdCookie(proj.id);
    if (proj.blockProgram) {
      setBlockProgram(JSON.parse(JSON.stringify(proj.blockProgram)) as BlockProgram);
    }
    loadProjectOntoBoards(proj.sketchCode, proj.name, proj.boardCount || 1);
    setActiveTab(proj.mode === 'blocks' ? 'blocks' : 'code');
  };

  const handleSaveActiveCode = (nextCode: string) => {
    const next = userProjects.map((p) =>
      p.id === activeProjectId
        ? { ...p, sketchCode: nextCode, updatedAt: Date.now() }
        : p
    );
    commitProjectsToCookies(next, activeProjectId);
  };

  const handleUpdateBlockProgram = (nextProg: BlockProgram) => {
    setBlockProgram(nextProg);
    const compiled = compileBlocksToArduino(nextProg);
    const targetBlockProj =
      userProjects.find((p) => p.id === activeProjectId && p.mode === 'blocks') ||
      userProjects.find((p) => p.mode === 'blocks');

    if (targetBlockProj) {
      const next = userProjects.map((p) =>
        p.id === targetBlockProj.id
          ? {
              ...p,
              name: nextProg.name || p.name,
              blockProgram: nextProg,
              sketchCode: compiled,
              updatedAt: Date.now(),
            }
          : p
      );
      commitProjectsToCookies(next, targetBlockProj.id);
    }
  };

  const handleRenameUserProject = (projectId: string, newName: string) => {
    const next = userProjects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            name: newName,
            blockProgram: p.blockProgram
              ? { ...p.blockProgram, name: newName }
              : undefined,
            updatedAt: Date.now(),
          }
        : p
    );
    commitProjectsToCookies(next, activeProjectId);
  };

  const handleDuplicateUserProject = (proj: UserProject) => {
    const copy: UserProject = {
      ...JSON.parse(JSON.stringify(proj)),
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${proj.name} (Copy)`,
      updatedAt: Date.now(),
    };
    const next = [copy, ...userProjects];
    commitProjectsToCookies(next, copy.id);
  };

  const handleDeleteUserProject = (projectId: string) => {
    if (userProjects.length <= 1) return;
    const next = userProjects.filter((p) => p.id !== projectId);
    const nextActive =
      activeProjectId === projectId ? next[0].id : activeProjectId;
    commitProjectsToCookies(next, nextActive);
  };

  const handlePlayPreMadeProject = (premade: PreMadeProject) => {
    loadProjectOntoBoards(premade.sketchCode, premade.name, premade.boardCount);
    setActiveTab('bench');
  };

  const handleClonePreMadeToUserProjects = (
    premade: PreMadeProject,
    openInEditor: boolean
  ) => {
    const clonedBlockProg = premade.blockProgram
      ? (JSON.parse(JSON.stringify(premade.blockProgram)) as BlockProgram)
      : undefined;
    const newProj: UserProject = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${premade.name} (My Copy)`,
      description: premade.description,
      mode: premade.mode,
      sketchCode: premade.sketchCode,
      blockProgram: clonedBlockProg,
      boardCount: premade.boardCount,
      updatedAt: Date.now(),
    };
    const next = [newProj, ...userProjects];
    commitProjectsToCookies(next, newProj.id);

    if (clonedBlockProg) {
      setBlockProgram(clonedBlockProg);
    }
    loadProjectOntoBoards(newProj.sketchCode, newProj.name, newProj.boardCount);
    if (openInEditor) {
      setActiveTab(newProj.mode === 'blocks' ? 'blocks' : 'code');
    } else {
      setActiveTab('bench');
    }
  };

  const handleImportProjectsJson = (imported: UserProject[]) => {
    commitProjectsToCookies(imported, imported[0].id);
    loadProjectOntoBoards(
      imported[0].sketchCode,
      imported[0].name,
      imported[0].boardCount || 1
    );
  };

  const handleAddBoard = () => {
    const currentBoards = cluster.getBoards();
    const activeSource = selectedBoard || currentBoards[0];
    const sketchCode = activeSource
      ? activeSource.state.sketchCode
      : activeUserProject?.sketchCode || DEFAULT_STARTER_CPP;
    const sketchName = activeSource
      ? activeSource.state.sketchName
      : activeUserProject?.name || 'My VIDI X Sketch';
    const newId = cluster.addBoard(sketchCode, sketchName, true);
    setSelectedBoardId(newId);
  };

  const handleRemoveBoard = (id: string) => {
    if (boards.length <= 1) return;
    cluster.removeBoard(id);
    const remaining = cluster.getBoards();
    if (selectedBoardId === id && remaining[0]) {
      setSelectedBoardId(remaining[0].state.id);
    }
  };

  const handlePinClickForWire = (boardId: string, gpio: number) => {
    if (!pendingWirePin) {
      setPendingWirePin({ boardId, gpio });
      return;
    }
    if (pendingWirePin.boardId === boardId && pendingWirePin.gpio === gpio) {
      setPendingWirePin(null);
      return;
    }
    cluster.addWireConnection(
      pendingWirePin.boardId,
      pendingWirePin.gpio,
      boardId,
      gpio
    );
    setPendingWirePin(null);
  };

  // Multi-Window Controls
  const toggleWindow = (id: InstrumentWindowId) => {
    setOpenWindows((prev) => {
      const exists = prev.find((w) => w.id === id);
      if (exists) {
        return prev.filter((w) => w.id !== id);
      }
      topZRef.current += 1;
      const def = DEFAULT_WINDOW_LAYOUT[id];
      const offset = (prev.length % 4) * 24;
      return [
        ...prev,
        {
          id,
          x: Math.max(16, Math.min(window.innerWidth - def.width - 20, def.x + offset)),
          y: Math.max(52, Math.min(window.innerHeight - def.height - 40, def.y + offset)),
          width: def.width,
          height: def.height,
          minimized: false,
          maximized: false,
          zIndex: topZRef.current,
        },
      ];
    });
  };

  const focusWindow = (id: InstrumentWindowId) => {
    topZRef.current += 1;
    const nextZ = topZRef.current;
    setOpenWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
    );
  };

  const moveWindow = (id: InstrumentWindowId, x: number, y: number) => {
    setOpenWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, x, y } : w))
    );
  };

  const toggleMinimizeWindow = (id: InstrumentWindowId) => {
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, minimized: !w.minimized, maximized: false } : w
      )
    );
  };

  const toggleMaximizeWindow = (id: InstrumentWindowId) => {
    topZRef.current += 1;
    const nextZ = topZRef.current;
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, maximized: !w.maximized, minimized: false, zIndex: nextZ }
          : w
      )
    );
  };

  const tileOpenWindows = () => {
    setOpenWindows((prev) => {
      const cols = Math.min(3, Math.max(1, prev.length));
      const colW = Math.floor((window.innerWidth - 36) / cols);
      return prev.map((w, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return {
          ...w,
          minimized: false,
          maximized: false,
          x: 12 + col * colW,
          y: 54 + row * 380,
          width: Math.min(540, colW - 12),
          height: 365,
        };
      });
    });
  };

  const isWindowOpen = (id: InstrumentWindowId) =>
    openWindows.some((w) => w.id === id);

  const wires = cluster.getWireConnections();
  const wirelessPackets = cluster.getWirelessPackets();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#141416] text-zinc-200 font-sans select-none">
      {/* Top Global Header Bar (Shown in Workbench / Editors, hidden on Home Screen) */}
      {activeTab !== 'home' && (
        <header className="h-10 px-3 bg-[#18181b] border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0 z-30">
          {/* Left: Brand + Top-Level Workspace Tabs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 pr-2 border-r border-zinc-800 cursor-pointer text-left font-semibold text-xs text-zinc-100"
              title="Return to Home Screen"
            >
              VIDI X
            </button>

            {/* Workspace Tabs */}
            <nav className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('home')}
                className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                Home
              </button>

              <button
                onClick={() => setActiveTab('bench')}
                className={`px-2.5 py-1 text-xs cursor-pointer ${
                  activeTab === 'bench'
                    ? 'bg-zinc-200 text-zinc-900 font-medium'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Bench ({boards.length})
              </button>

              {activeUserProject?.mode === 'blocks' ? (
                <button
                  onClick={() => setActiveTab('blocks')}
                  className={`px-2.5 py-1 text-xs cursor-pointer ${
                    activeTab === 'blocks'
                      ? 'bg-zinc-200 text-zinc-900 font-medium'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Blocks
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab('code')}
                  className={`px-2.5 py-1 text-xs cursor-pointer ${
                    activeTab === 'code'
                      ? 'bg-zinc-200 text-zinc-900 font-medium'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {activeUserProject?.mode === 'python'
                    ? 'Python (.py)'
                    : 'C++ (.ino)'}
                </button>
              )}
            </nav>

            <button
              onClick={handleAddBoard}
              className="px-2.5 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-700 text-zinc-100 text-xs cursor-pointer"
              title="Add another VIDI X board to the simulation bench"
            >
              + Add Board ({boards.length})
            </button>
          </div>

          {/* Right: Multi-Window Floating Instrument Dock */}
          <div className="flex items-center gap-1">
            {(
              [
                ['serial', 'Serial'],
                ['scope', 'Scope'],
                ['interconnect', 'Patch / RF'],
                ['pins', 'GPIO'],
                ['sd', 'SD Card'],
                ['extensions', 'Extensions'],
              ] as Array<[InstrumentWindowId, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => toggleWindow(id)}
                className={`px-2 py-1 text-xs border cursor-pointer ${
                  isWindowOpen(id)
                    ? 'bg-zinc-200 text-zinc-900 border-zinc-300 font-medium'
                    : 'bg-[#222226] hover:bg-[#2c2c32] text-zinc-300 border-zinc-700'
                }`}
              >
                {label}
              </button>
            ))}

            {openWindows.length >= 2 && (
              <button
                onClick={tileOpenWindows}
                className="px-2 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-600 text-zinc-200 text-xs cursor-pointer ml-1"
                title="Tile all open floating instrument windows side-by-side"
              >
                Tile ({openWindows.length})
              </button>
            )}
          </div>
        </header>
      )}

      {/* Main Active Tab View */}
      <main className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {activeTab === 'home' && (
          <HomeScreen
            userProjects={userProjects}
            activeProjectId={activeProjectId}
            cookieStats={cookieStats}
            onCreateProject={handleCreateProject}
            onOpenUserProject={handleOpenUserProject}
            onRenameUserProject={handleRenameUserProject}
            onDuplicateUserProject={handleDuplicateUserProject}
            onDeleteUserProject={handleDeleteUserProject}
            onPlayPreMadeProject={handlePlayPreMadeProject}
            onClonePreMadeToUserProjects={handleClonePreMadeToUserProjects}
            onImportProjectsJson={handleImportProjectsJson}
            onGoToBench={() => setActiveTab('bench')}
          />
        )}

        {activeTab === 'bench' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center relative">
            {/* Hardware Bench Action Bar */}
            <div className="w-full max-w-[1600px] mb-4 px-3 py-2 bg-[#1c1c1f] border border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAddBoard}
                  className="px-3 py-1 bg-zinc-200 hover:bg-white text-zinc-900 font-medium text-xs cursor-pointer"
                >
                  + Add VIDI X Board ({boards.length})
                </button>

                <div className="flex items-center gap-1.5 bg-[#141416] border border-zinc-700 px-2.5 py-1">
                  <span className="text-xs text-zinc-400">Project:</span>
                  <select
                    value={activeProjectId}
                    onChange={(e) => {
                      const picked = userProjects.find((p) => p.id === e.target.value);
                      if (picked) {
                        handleOpenUserProject(picked, 'bench');
                      }
                    }}
                    className="bg-transparent text-xs text-zinc-100 focus:outline-none cursor-pointer"
                  >
                    {userProjects.map((proj) => (
                      <option
                        key={proj.id}
                        value={proj.id}
                        className="bg-[#18181b] text-zinc-100"
                      >
                        {proj.name} (
                        {proj.mode === 'blocks'
                          ? 'Blocks'
                          : proj.mode === 'python'
                          ? 'Python'
                          : 'C++'}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                {activeUserProject && (
                  <button
                    onClick={() =>
                      setActiveTab(
                        activeUserProject.mode === 'blocks' ? 'blocks' : 'code'
                      )
                    }
                    className="px-2.5 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-700 text-zinc-200 text-xs cursor-pointer"
                  >
                    {activeUserProject.mode === 'blocks'
                      ? 'Edit Blocks'
                      : activeUserProject.mode === 'python'
                      ? 'Edit Python'
                      : 'Edit C++'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-zinc-400">
                  Running: <strong className="text-zinc-200">{selectedBoard?.state.sketchName}</strong>
                </span>
                <button
                  onClick={() => setActiveTab('home')}
                  className="px-3 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-700 text-zinc-200 text-xs cursor-pointer"
                >
                  All Projects
                </button>
              </div>
            </div>

            {/* Active 60-Pin Jumper Wire Banner when multiple boards are patched */}
            {wires.length > 0 && (
              <div className="mb-4 px-3 py-1 bg-[#0b0e15] border border-cyan-500/40 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="text-cyan-400 font-bold">
                  60-PIN JUMPER HARNESS ACTIVE:
                </span>
                {wires.map((w) => {
                  const bFrom = boards.find((b) => b.state.id === w.fromBoardId);
                  const bTo = boards.find((b) => b.state.id === w.toBoardId);
                  const high =
                    bFrom?.state.pins[w.fromGpio]?.digitalValue === 1;
                  return (
                    <span
                      key={w.id}
                      className="px-1.5 py-0.5 bg-[#121723] border border-[#252c3f] flex items-center gap-1"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          high
                            ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                            : 'bg-zinc-600'
                        }`}
                      />
                      <span>
                        {bFrom?.state.name}:IO{w.fromGpio} → {bTo?.state.name}:IO
                        {w.toGpio}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Simulated VIDI X Hardware Units */}
            <div className="flex flex-wrap items-center justify-center gap-8 max-w-[1750px]">
              {boards.map((board) => (
                <VidiXBoardView
                  key={board.state.id}
                  instance={board}
                  isSelected={board.state.id === selectedBoard?.state.id}
                  canRemove={boards.length > 1}
                  pendingWirePin={pendingWirePin}
                  onSelect={() => setSelectedBoardId(board.state.id)}
                  onRemove={() => handleRemoveBoard(board.state.id)}
                  onTogglePower={() => cluster.togglePower(board.state.id)}
                  onStart={() => cluster.startBoard(board.state.id)}
                  onStop={() => cluster.stopBoard(board.state.id)}
                  onReset={() => cluster.resetBoard(board.state.id)}
                  onButtonChange={(btn, pressed) =>
                    cluster.setButtonState(board.state.id, btn, pressed)
                  }
                  onTouchChange={(pressed, x, y) =>
                    cluster.setTouchState(board.state.id, {
                      pressed,
                      x,
                      y,
                      z: pressed ? 2000 : 0,
                    })
                  }
                  onSensorChange={(partial) =>
                    cluster.updateSensors(board.state.id, partial)
                  }
                  onSendIr={(code) =>
                    cluster.sendIrCommandToBoard(board.state.id, code)
                  }
                  onToggleMute={() =>
                    cluster.setAudioMuted(
                      board.state.id,
                      !board.state.audio.muted
                    )
                  }
                  onPinClickForWire={handlePinClickForWire}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'code' && selectedBoard && (
          <ArduinoCodeStudio
            cluster={cluster}
            boards={boards}
            selectedBoard={selectedBoard}
            onSelectBoard={(id) => setSelectedBoardId(id)}
            userProjects={userProjects}
            activeProjectId={activeProjectId}
            onSelectUserProject={handleSelectUserProjectInEditor}
            onSaveActiveCode={handleSaveActiveCode}
            onCreateNewProject={handleCreateProject}
          />
        )}

        {activeTab === 'blocks' && selectedBoard && (
          <BlockCodingStudio
            cluster={cluster}
            boards={boards}
            selectedBoard={selectedBoard}
            onSelectBoard={(id) => setSelectedBoardId(id)}
            program={blockProgram}
            onChangeProgram={handleUpdateBlockProgram}
            userProjects={userProjects}
            activeProjectId={activeProjectId}
            onSelectUserProject={handleSelectUserProjectInEditor}
            onCreateNewProject={handleCreateProject}
          />
        )}
      </main>

      {/* Bottom Status Bar (Hidden on Home Screen) */}
      {activeTab !== 'home' && (
        <footer className="h-6 px-3 bg-[#18181b] border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400 shrink-0 z-30">
          <div className="flex items-center gap-4">
            <span>
              Board: <strong className="text-zinc-200">{selectedBoard?.state.name}</strong>
            </span>
            <span className="hidden md:inline">
              {boards.length >= 2
                ? 'Controls — P1: WASD + Z/Space | P2: Arrows + Enter/J'
                : 'Controls — D-Pad: WASD / Arrows | A: Z / Space | B: X / K'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>Saved in cookies: {cookieStats.projectCount} projects</span>
            {openWindows.length > 0 && <span>Windows: {openWindows.length}</span>}
          </div>
        </footer>
      )}

      {/* Multi-Window Floating Instrument Manager */}
      {selectedBoard && (
        <MultiWindowManager
          openWindows={openWindows}
          onCloseWindow={(id) =>
            setOpenWindows((prev) => prev.filter((w) => w.id !== id))
          }
          onFocusWindow={focusWindow}
          onMoveWindow={moveWindow}
          onToggleMinimize={toggleMinimizeWindow}
          onToggleMaximize={toggleMaximizeWindow}
          boards={boards}
          selectedBoard={selectedBoard}
          onSelectBoard={(id) => setSelectedBoardId(id)}
          wires={wires}
          wirelessPackets={wirelessPackets}
          onAddWire={(b1, g1, b2, g2) =>
            cluster.addWireConnection(b1, g1, b2, g2)
          }
          onRemoveWire={(wId) => cluster.removeWireConnection(wId)}
          onAutoWireBoards={(b1, b2) => cluster.autoWireTwoBoards(b1, b2)}
          onClearWireless={() => cluster.clearWirelessPackets()}
          onSendSerial={(bId, text) => cluster.sendSerialInput(bId, text)}
          onClearSerial={(bId) => cluster.clearSerialLog(bId)}
          onWriteSdFile={(bId, name, content) =>
            cluster.writeSdFile(bId, name, content)
          }
          onDeleteSdFile={(bId, name) => cluster.deleteSdFile(bId, name)}
          onAttachExtension={(bId, extId) => cluster.attachExtension(bId, extId)}
          onDetachExtension={(bId, extId) => cluster.detachExtension(bId, extId)}
        />
      )}
    </div>
  );
}
export default App;
