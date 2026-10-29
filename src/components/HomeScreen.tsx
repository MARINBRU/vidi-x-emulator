import React, { useState } from 'react';
import {
  CookieStorageStats,
  PREMADE_PLAYABLE_PROJECTS,
  PreMadeProject,
  UserProject,
} from '../emulator/projectStorage';

interface HomeScreenProps {
  userProjects: UserProject[];
  activeProjectId: string;
  cookieStats: CookieStorageStats;
  onCreateProject: (mode: 'cpp' | 'blocks' | 'python', name?: string) => void;
  onOpenUserProject: (
    project: UserProject,
    destination: 'bench' | 'code' | 'blocks'
  ) => void;
  onRenameUserProject: (projectId: string, newName: string) => void;
  onDuplicateUserProject: (project: UserProject) => void;
  onDeleteUserProject: (projectId: string) => void;
  onPlayPreMadeProject: (premade: PreMadeProject) => void;
  onClonePreMadeToUserProjects: (
    premade: PreMadeProject,
    openInEditor: boolean
  ) => void;
  onImportProjectsJson: (projects: UserProject[]) => void;
  onGoToBench: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userProjects,
  activeProjectId,
  cookieStats,
  onCreateProject,
  onOpenUserProject,
  onRenameUserProject,
  onDuplicateUserProject,
  onDeleteUserProject,
  onPlayPreMadeProject,
  onClonePreMadeToUserProjects,
  onImportProjectsJson,
  onGoToBench,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  const handleStartRename = (proj: UserProject) => {
    setRenamingId(proj.id);
    setRenameDraft(proj.name);
  };

  const handleCommitRename = (projectId: string) => {
    if (renameDraft.trim()) {
      onRenameUserProject(projectId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const handleExportCookieBackup = () => {
    const blob = new Blob([JSON.stringify(userProjects, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vidi_x_projects.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCookieBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as UserProject[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          onImportProjectsJson(parsed);
        }
      } catch {
        // Ignore invalid JSON
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#161618] text-zinc-200 font-sans select-none">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">
              VIDI X Emulator
            </h1>
            <p className="text-xs text-zinc-400">
              Cookie storage: {userProjects.length} saved projects (
              {(cookieStats.totalCookieBytes / 1024).toFixed(1)} KB)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCookieBackup}
              className="px-3 py-1.5 bg-[#222226] hover:bg-[#2c2c32] border border-zinc-700 text-xs text-zinc-200 cursor-pointer"
            >
              Export JSON
            </button>
            <label className="px-3 py-1.5 bg-[#222226] hover:bg-[#2c2c32] border border-zinc-700 text-xs text-zinc-200 cursor-pointer">
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportCookieBackup}
                className="hidden"
              />
            </label>
            <button
              onClick={onGoToBench}
              className="px-3.5 py-1.5 bg-zinc-200 hover:bg-white text-zinc-900 font-medium text-xs cursor-pointer"
            >
              Open Hardware Bench
            </button>
          </div>
        </div>

        {/* Section 1: User Projects (Saved in Cookies) */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Saved Projects
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Optional project name..."
                className="bg-[#111113] border border-zinc-700 px-2.5 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 w-48"
              />
              <button
                onClick={() => {
                  onCreateProject('cpp', newProjectName.trim() || undefined);
                  setNewProjectName('');
                }}
                className="px-3 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-600 text-xs text-zinc-100 cursor-pointer"
              >
                + New C++ Project
              </button>
              <button
                onClick={() => {
                  onCreateProject('python', newProjectName.trim() || undefined);
                  setNewProjectName('');
                }}
                className="px-3 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-600 text-xs text-zinc-100 cursor-pointer"
              >
                + New Python Project
              </button>
              <button
                onClick={() => {
                  onCreateProject('blocks', newProjectName.trim() || undefined);
                  setNewProjectName('');
                }}
                className="px-3 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-600 text-xs text-zinc-100 cursor-pointer"
              >
                + New Block Project
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 divide-y divide-zinc-800 bg-[#1c1c1f]">
            {userProjects.map((proj) => {
              const isCurrent = proj.id === activeProjectId;
              const lines = proj.sketchCode.split('\n').length;
              return (
                <div
                  key={proj.id}
                  className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#222226]"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="px-1.5 py-0.5 bg-[#2a2a30] border border-zinc-700 text-[11px] font-mono text-zinc-300 shrink-0">
                      {proj.mode === 'cpp'
                        ? 'C++'
                        : proj.mode === 'python'
                        ? 'Python'
                        : 'Blocks'}
                    </span>

                    {renamingId === proj.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleCommitRename(proj.id);
                        }}
                        className="flex-1 max-w-xs"
                      >
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                          onBlur={() => handleCommitRename(proj.id)}
                          className="w-full bg-[#111113] border border-zinc-500 px-2 py-0.5 text-xs text-white focus:outline-none"
                        />
                      </form>
                    ) : (
                      <span className="text-sm font-medium text-zinc-100 truncate">
                        {proj.name}
                      </span>
                    )}

                    <span className="text-xs text-zinc-500 shrink-0">
                      {lines} lines
                    </span>

                    {isCurrent && (
                      <span className="text-[11px] text-zinc-400 border border-zinc-700 px-1.5 py-0.2">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onOpenUserProject(proj, 'bench')}
                      className="px-2.5 py-1 bg-zinc-200 hover:bg-white text-zinc-900 font-medium text-xs cursor-pointer"
                    >
                      Run
                    </button>
                    <button
                      onClick={() =>
                        onOpenUserProject(
                          proj,
                          proj.mode === 'blocks' ? 'blocks' : 'code'
                        )
                      }
                      className="px-2.5 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-700 text-xs text-zinc-200 cursor-pointer"
                    >
                      {proj.mode === 'blocks'
                        ? 'Edit Blocks'
                        : proj.mode === 'python'
                        ? 'Edit Python'
                        : 'Edit C++'}
                    </button>
                    <button
                      onClick={() => handleStartRename(proj)}
                      className="px-2 py-1 bg-[#222226] hover:bg-[#2c2c32] border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => onDuplicateUserProject(proj)}
                      className="px-2 py-1 bg-[#222226] hover:bg-[#2c2c32] border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      Duplicate
                    </button>
                    {userProjects.length > 1 && (
                      <button
                        onClick={() => onDeleteUserProject(proj.id)}
                        className="px-2 py-1 bg-[#222226] hover:bg-[#2c2c32] border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Pre-Made Playable Projects */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">
              Pre-Made Projects
            </h2>
            <span className="text-xs text-zinc-500">
              Controls: WASD / Arrows, Space / Z (A), X (B)
            </span>
          </div>

          <div className="border border-zinc-800 divide-y divide-zinc-800 bg-[#1c1c1f]">
            {PREMADE_PLAYABLE_PROJECTS.map((item) => (
              <div
                key={item.id}
                className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#222226]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="px-1.5 py-0.5 bg-[#2a2a30] border border-zinc-700 text-[11px] font-mono text-zinc-300 shrink-0">
                    {item.mode === 'cpp'
                      ? 'C++'
                      : item.mode === 'python'
                      ? 'Python'
                      : 'Blocks'}
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#222226] border border-zinc-800 text-[11px] text-zinc-400 shrink-0">
                    {item.boardCount === 2 ? '2 Boards' : '1 Board'}
                  </span>
                  <span className="text-sm font-medium text-zinc-100 truncate">
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onPlayPreMadeProject(item)}
                    className="px-3 py-1 bg-zinc-200 hover:bg-white text-zinc-900 font-medium text-xs cursor-pointer"
                  >
                    {item.boardCount === 2 ? 'Run (2 Boards)' : 'Run'}
                  </button>
                  <button
                    onClick={() => onClonePreMadeToUserProjects(item, true)}
                    className="px-2.5 py-1 bg-[#26262b] hover:bg-[#323238] border border-zinc-700 text-xs text-zinc-200 cursor-pointer"
                  >
                    Copy to Saved Projects
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
