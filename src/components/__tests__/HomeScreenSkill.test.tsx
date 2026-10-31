// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import skill from '../../../docs/vidi-x-cpp/SKILL.md?raw';
import { HomeScreen } from '../HomeScreen';

let container: HTMLDivElement;
let root: Root;
let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

function button(label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll('button')).find((item) => item.getAttribute('aria-label') === label);
  if (!result) throw new Error(`Missing ${label} button`);
  return result;
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<HomeScreen
      userProjects={[]}
      activeProjectId=""
      cookieStats={{ projectCount: 0, cookieChunkCount: 0, totalCookieBytes: 0, lastSavedAt: null }}
      onCreateProject={() => {}}
      onOpenUserProject={() => {}}
      onRenameUserProject={() => {}}
      onDuplicateUserProject={() => {}}
      onDeleteUserProject={() => {}}
      onPlayPreMadeProject={() => {}}
      onClonePreMadeToUserProjects={() => {}}
      onImportProjectsJson={() => {}}
      onGoToBench={() => {}}
    />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreate });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevoke });
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('home screen C++ skill', () => {
  it('copies the complete canonical skill from the bottom of the page', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const footer = container.querySelector('footer')!;
    expect(footer.parentElement?.lastElementChild).toBe(footer);
    expect(footer.textContent).toContain('VIDI X C++ AI skill');
    await act(async () => button('Copy VIDI X C++ AI skill').click());
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(skill);
    expect(footer.querySelector('[role="status"]')?.textContent).toBe('Copied.');
  });

  it('offers the download when clipboard access is unavailable or denied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await act(async () => button('Copy VIDI X C++ AI skill').click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copy unavailable. Download the file instead.');
    Reflect.deleteProperty(navigator, 'clipboard');
    await act(async () => button('Copy VIDI X C++ AI skill').click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copy unavailable. Download the file instead.');
  });

  it('downloads the same Markdown with a stable filename and releases its object URL', async () => {
    const create = vi.fn().mockReturnValue('blob:skill-file');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revoke });
    let filename = '';
    let href = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
      href = this.href;
    });
    await act(async () => button('Download VIDI X C++ AI skill').click());
    expect(create).toHaveBeenCalledOnce();
    expect(filename).toBe('SKILL.md');
    expect(href).toBe('blob:skill-file');
    expect(await readBlob(create.mock.calls[0][0] as Blob)).toBe(skill);
    // Do not revoke before the browser has begun the download.
    expect(revoke).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(revoke).toHaveBeenCalledWith('blob:skill-file');
  });
});
