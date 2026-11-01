import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { transpileArduinoSketch } from '../arduinoRuntime';
import { VidiXClusterManager } from '../clusterManager';

const declarations = [
  'const char* names[] = {"one", "two"};',
  'const char *names[] = {"one", "two"};',
  'const char * const names[] = {"one", "two"};',
  'const char*const names[] = {"one", "two"};',
  'static const char* names[] = {"one", "two"};',
  'static const char *names[] = {"one", "two"};',
  'constexpr const char *names[] = {"one", "two"};',
  'const char *names[2] PROGMEM = {"one", "two"};',
  'const char* greeting = "hello";',
  'const char *greeting = "hello";',
  'const char*const greeting = "hello";',
  'static const char* greeting = "hello";',
  'static const char *greeting = "hello";',
];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type Board = ReturnType<VidiXClusterManager['getBoards']>[number];

async function waitForSerial(board: Board, expected: string): Promise<string> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (board.state.compileError) throw new Error(board.state.compileError);
    const output = board.state.serialLog.filter((entry) => entry.direction === 'tx').map((entry) => entry.text).join('');
    if (output.includes(expected)) return output;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for serial output: ${expected}`);
}

describe('C++ const pointer declarations', () => {
  it.each(declarations)('compiles %s', (declaration) => {
    const { jsCode } = transpileArduinoSketch(`${declaration}\nvoid setup() {}\nvoid loop() {}`);
    expect(() => new Function(jsCode), jsCode).not.toThrow();
  });

  it('also compiles the full representative Sandbox-style sketch with star-adjacent names', () => {
    const fixture = readFileSync(new URL('./fixtures/SandboxCompatibility.ino', import.meta.url), 'utf8');
    const modified = fixture.replace(/const char \*const\s+(\w+)/g, 'const char *$1');
    expect(modified).not.toBe(fixture);
    const { jsCode } = transpileArduinoSketch(modified);
    expect(() => new Function(jsCode), jsCode).not.toThrow();
  });

  it('runs string-pointer arrays, return types and function parameters without changing strings', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const code = `
      const char *names[] = {"one", "two"};
      const char *greeting = "char *text stays unchanged";
      const char *pick(int i);
      const char *pick(int i) { return names[i]; }
      void printName(const char *name) { Serial.print(name); }
      void setup() {
        printName(greeting);
        Serial.print("|");
        printName(pick(1));
        Serial.printf("|%d", sizeof(names) / sizeof(names[0]));
      }
      void loop() { delay(20); }
    `;
    try {
      cluster.updateSketch(board.state.id, code, 'Pointer declarations');
      cluster.startBoard(board.state.id);
      const output = await waitForSerial(board, 'char *text stays unchanged|two|2');
      expect(board.state.compileError).toBeNull();
      expect(output).toContain('char *text stays unchanged|two|2');
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('keeps numeric pointer increments and dereferences working without a space', async () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    const code = `
      uint16_t line[3];
      void fillLine() {
        uint16_t *p = line;
        *p++ = 7;
        *p++ = 11;
        *p = 13;
      }
      void setup() {
        fillLine();
        const uint16_t *r = line;
        int first = *r++;
        int second = *r;
        Serial.printf("%d,%d,%d|%d,%d", line[0], line[1], line[2], first, second);
      }
      void loop() { delay(20); }
    `;
    try {
      cluster.updateSketch(board.state.id, code, 'Numeric pointer');
      cluster.startBoard(board.state.id);
      const output = await waitForSerial(board, '7,11,13|7,11');
      expect(board.state.compileError).toBeNull();
      expect(output).toContain('7,11,13|7,11');
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });

  it('shows a translated-code excerpt for any other unsupported const declaration', () => {
    const cluster = new VidiXClusterManager();
    const board = cluster.getBoards()[0];
    try {
      cluster.updateSketch(board.state.id, 'const UnsupportedType palette = 42;\nvoid setup() {}\nvoid loop() {}');
      cluster.startBoard(board.state.id);
      expect(board.state.running).toBe(false);
      expect(board.state.compileError).toContain('Syntax / Compile Error:');
      expect(board.state.compileError).toContain('Near translated code: const UnsupportedType palette = 42;');
    } finally {
      cluster.stopBoard(board.state.id);
    }
  });
});
