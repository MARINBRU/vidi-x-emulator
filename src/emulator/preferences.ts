/**
 * A small browser-backed approximation of Arduino-ESP32 Preferences (NVS).
 * Each simulated board has its own namespaces. This is not the real board's
 * flash and does not affect physical hardware.
 */
type StoredValue = { type: string; value: number | string | boolean };
const memoryStores = new Map<string, Map<string, StoredValue>>();
const storageKey = (boardId: string) => `vidix.nvs.v1.${boardId}`;

function getStore(boardId: string): Map<string, StoredValue> {
  if (memoryStores.has(boardId)) return memoryStores.get(boardId)!;
  const store = new Map<string, StoredValue>();
  try {
    const serialized = globalThis.localStorage?.getItem(storageKey(boardId));
    if (serialized) {
      const entries: unknown = JSON.parse(serialized);
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] &&
              typeof entry[1].type === 'string' &&
              ['number', 'string', 'boolean'].includes(typeof entry[1].value)) {
            store.set(entry[0], entry[1] as StoredValue);
          }
        }
      }
    }
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts;
    // retain the values in memory for this page's lifetime instead.
  }
  memoryStores.set(boardId, store);
  return store;
}

function persistStore(boardId: string, store: Map<string, StoredValue>): void {
  try {
    globalThis.localStorage?.setItem(storageKey(boardId), JSON.stringify([...store]));
  } catch {
    // Keep the in-memory copy if persistent storage is denied or full.
  }
}

export class SimulatedPreferences {
  private namespace: string | null = null;
  private readOnly = false;
  private readonly store: Map<string, StoredValue>;

  constructor(private readonly boardId: string) {
    this.store = getStore(boardId);
  }

  public begin(namespace: string, readOnly = false): boolean {
    if (this.namespace !== null || !namespace || String(namespace).includes('\0')) return false;
    this.namespace = String(namespace);
    this.readOnly = Boolean(readOnly);
    return true;
  }

  public end(): void {
    this.namespace = null;
    this.readOnly = false;
  }

  private fullKey(key: string): string | null {
    if (this.namespace === null || !key || String(key).includes('\0')) return null;
    return `${this.namespace}\0${String(key)}`;
  }

  private put(key: string, type: string, value: StoredValue['value'], bytes: number): number {
    const fullKey = this.fullKey(key);
    if (fullKey === null || this.readOnly) return 0;
    this.store.set(fullKey, { type, value });
    persistStore(this.boardId, this.store);
    return bytes;
  }

  private get(key: string, type: string, fallback: StoredValue['value']): StoredValue['value'] {
    const fullKey = this.fullKey(key);
    const value = fullKey === null ? undefined : this.store.get(fullKey);
    return value?.type === type ? value.value : fallback;
  }

  public isKey(key: string): boolean {
    const fullKey = this.fullKey(key);
    return fullKey !== null && this.store.has(fullKey);
  }

  public remove(key: string): boolean {
    const fullKey = this.fullKey(key);
    if (fullKey === null || this.readOnly || !this.store.delete(fullKey)) return false;
    persistStore(this.boardId, this.store);
    return true;
  }

  public clear(): boolean {
    if (this.namespace === null || this.readOnly) return false;
    const prefix = `${this.namespace}\0`;
    for (const key of this.store.keys()) if (key.startsWith(prefix)) this.store.delete(key);
    persistStore(this.boardId, this.store);
    return true;
  }

  public putUChar(key: string, value: number): number { return this.put(key, 'UChar', Number(value) & 0xff, 1); }
  public getUChar(key: string, fallback = 0): number { return Number(this.get(key, 'UChar', Number(fallback) & 0xff)); }
  public putChar(key: string, value: number): number { return this.put(key, 'Char', (Number(value) << 24) >> 24, 1); }
  public getChar(key: string, fallback = 0): number { return Number(this.get(key, 'Char', (Number(fallback) << 24) >> 24)); }
  public putUShort(key: string, value: number): number { return this.put(key, 'UShort', Number(value) & 0xffff, 2); }
  public getUShort(key: string, fallback = 0): number { return Number(this.get(key, 'UShort', Number(fallback) & 0xffff)); }
  public putShort(key: string, value: number): number { return this.put(key, 'Short', (Number(value) << 16) >> 16, 2); }
  public getShort(key: string, fallback = 0): number { return Number(this.get(key, 'Short', (Number(fallback) << 16) >> 16)); }
  public putUInt(key: string, value: number): number { return this.put(key, 'UInt', Number(value) >>> 0, 4); }
  public getUInt(key: string, fallback = 0): number { return Number(this.get(key, 'UInt', Number(fallback) >>> 0)); }
  public putInt(key: string, value: number): number { return this.put(key, 'Int', Number(value) | 0, 4); }
  public getInt(key: string, fallback = 0): number { return Number(this.get(key, 'Int', Number(fallback) | 0)); }
  public putULong(key: string, value: number): number { return this.putUInt(key, value); }
  public getULong(key: string, fallback = 0): number { return this.getUInt(key, fallback); }
  public putLong(key: string, value: number): number { return this.putInt(key, value); }
  public getLong(key: string, fallback = 0): number { return this.getInt(key, fallback); }
  public putBool(key: string, value: boolean): number { return this.putUChar(key, value ? 1 : 0); }
  public getBool(key: string, fallback = false): boolean { return this.getUChar(key, fallback ? 1 : 0) === 1; }
  public putFloat(key: string, value: number): number { return this.put(key, 'Float', Math.fround(Number(value)), 4); }
  public getFloat(key: string, fallback = 0): number { return Number(this.get(key, 'Float', Number(fallback))); }
  public putDouble(key: string, value: number): number { return this.put(key, 'Double', Number(value), 8); }
  public getDouble(key: string, fallback = 0): number { return Number(this.get(key, 'Double', Number(fallback))); }
  public putString(key: string, value: string): number {
    const text = String(value).split('\0')[0];
    return this.put(key, 'String', text, new TextEncoder().encode(text).length);
  }
  public getString(key: string, fallback = ''): string { return String(this.get(key, 'String', String(fallback))); }
}
