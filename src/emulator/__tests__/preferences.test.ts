// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('simulated Preferences / NVS', () => {
  it('persists typed values across reloads, isolates boards and namespaces, and enforces read-only mode', async () => {
    const { SimulatedPreferences } = await import('../preferences');
    const first = new SimulatedPreferences('board-1');
    expect(first.begin('sand', false)).toBe(true);
    expect(first.putUChar('color', 258)).toBe(1);
    expect(first.putString('label', 'hello')).toBe(5);
    expect(first.putBool('flag', true)).toBe(1);
    expect(first.getUChar('flag')).toBe(1);
    expect(first.putULong('count', 42)).toBe(4);
    expect(first.getUInt('count')).toBe(42);
    expect(first.getUChar('color', 9)).toBe(2);
    expect(first.getInt('color', 9)).toBe(9); // types do not alias
    first.end();
    expect(window.localStorage.getItem('vidix.nvs.v1.board-1')).toContain('color');

    // A new module instance has no in-memory cache, as after a page reload.
    vi.resetModules();
    const reloaded = await import('../preferences');
    const again = new reloaded.SimulatedPreferences('board-1');
    expect(again.begin('sand', true)).toBe(true);
    expect(again.getUChar('color', 0)).toBe(2);
    expect(again.getString('label', '')).toBe('hello');
    expect(again.isKey('color')).toBe(true);
    expect(again.putUChar('color', 3)).toBe(0);
    expect(again.remove('color')).toBe(false);
    expect(again.clear()).toBe(false);
    again.end();
    expect(again.begin('different', true)).toBe(true);
    expect(again.getUChar('color', 7)).toBe(7);
    again.end();
    const otherBoard = new reloaded.SimulatedPreferences('board-2');
    otherBoard.begin('sand', true);
    expect(otherBoard.getUChar('color', 7)).toBe(7);
    otherBoard.end();
    again.begin('sand');
    expect(again.remove('color')).toBe(true);
    expect(again.isKey('color')).toBe(false);
    expect(again.clear()).toBe(true);
    again.end();
  });

  it('keeps a session-only fallback when browser storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('storage blocked'); },
      setItem() { throw new Error('storage blocked'); },
    });
    const { SimulatedPreferences } = await import('../preferences');
    const first = new SimulatedPreferences('blocked-board');
    first.begin('prefs');
    expect(first.putUChar('value', 42)).toBe(1);
    first.end();
    const second = new SimulatedPreferences('blocked-board');
    second.begin('prefs', true);
    expect(second.getUChar('value', 0)).toBe(42);
    second.end();
  });
});
