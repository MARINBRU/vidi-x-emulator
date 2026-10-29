import { ILI9341Display, TFT_COLORS } from './display';
import { VIDI_X_PINS } from './pinout';
import {
  createPythonRuntimeEnv,
  isPythonCode,
  transpilePythonSketch,
} from './pythonRuntime';
import {
  PinModeType,
  RGBLedColor,
  SDFile,
  SensorState,
  TouchState,
  WirelessProtocol,
} from './types';

// Support Arduino String methods .toInt(), .toFloat(), and .indexOf(charCode)
const strProto = String.prototype as unknown as Record<string, unknown>;
if (!strProto.toInt) {
  strProto.toInt = function (this: string) {
    return parseInt(this, 10) || 0;
  };
}
if (!strProto.toFloat) {
  strProto.toFloat = function (this: string) {
    return parseFloat(this) || 0;
  };
}
if (!strProto.__vidiIndexOfPatched) {
  const origIndexOf = String.prototype.indexOf;
  strProto.__vidiIndexOfPatched = true;
  (String.prototype as unknown as { indexOf: (s: unknown, pos?: number) => number }).indexOf =
    function (this: string, search: unknown, fromIndex?: number): number {
      if (typeof search === 'number' && search >= 0 && search <= 127) {
        const ch = String.fromCharCode(search);
        const idx = origIndexOf.call(this, ch, fromIndex);
        if (idx !== -1) return idx;
      }
      return origIndexOf.call(this, String(search), fromIndex);
    };
}

export interface RuntimeCallbacks {
  boardId: string;
  boardIndex: number; // 0-based index (0 = Board #1, 1 = Board #2, etc.)
  macAddress: string;
  ipAddress: string;
  display: ILI9341Display;
  getMillis: () => number;
  isRunning: () => boolean;
  onPinMode: (gpio: number, mode: PinModeType) => void;
  onDigitalWrite: (gpio: number, val: 0 | 1) => void;
  onDigitalRead: (gpio: number) => 0 | 1;
  onAnalogRead: (gpio: number) => number;
  onAnalogWrite: (gpio: number, val: number) => void;
  onTone: (gpio: number, freq: number, duration?: number) => void;
  onNoTone: (gpio: number) => void;
  onLedcSetup: (channel: number, freq: number, resolution: number) => void;
  onLedcAttachPin: (gpio: number, channel: number) => void;
  onLedcWrite: (channel: number, duty: number) => void;
  onLedcWriteTone: (channel: number, freq: number) => void;
  onUpdateRgbLeds: (leds: RGBLedColor[]) => void;
  getTouch: () => TouchState;
  getSensors?: () => SensorState;
  onSerialPrint: (uart: 0 | 2, text: string) => void;
  onSerialAvailable: (uart: 0 | 2) => number;
  onSerialReadString: (uart: 0 | 2) => string;
  onSerialReadChar: (uart: 0 | 2) => number;
  onWifiConnect: (ssid: string) => void;
  onEspNowInit: () => void;
  onBtBegin: (name: string) => void;
  onSendWireless: (
    protocol: WirelessProtocol,
    toMacOrIp: string,
    payload: string,
    portOrIrCode?: number
  ) => void;
  onPopWirelessPacket: (
    protocol?: WirelessProtocol
  ) => { fromMac: string; fromIp: string; payload: string; irCode?: number } | null;
  onPeekWirelessCount: (protocol?: WirelessProtocol) => number;
  onGetIrCode: () => { available: boolean; code: number };
  onConsumeIrCode: () => void;
  onSdRead: (path: string) => SDFile | null;
  onSdWrite: (path: string, content: string, append: boolean) => void;
  onSdRemove: (path: string) => boolean;
}

/**
 * Transpiles an Arduino C++ (.ino) sketch into executable async JavaScript
 * supporting Adafruit_ILI9341, TFT_eSPI, LovyanGFX (LGFX / LGFX_Sprite), FastLED,
 * ESP-NOW, WiFiUDP, SD, IRremote, and C++ structs/arrays/statics.
 */
export function transpileArduinoSketch(sourceCode: string): {
  jsCode: string;
  userFunctions: string[];
} {
  if (isPythonCode(sourceCode)) {
    return transpilePythonSketch(sourceCode);
  }

  let code = sourceCode.replace(/\r\n/g, '\n');

  // 1. Strip block and line comments (preserving string literals)
  code = stripCommentsPreservingStrings(code);

  // 1b. Strip LovyanGFX boilerplate class definitions: `class LGFX : public lgfx::LGFX_Device { ... };`
  code = stripClassDefinition(code, 'LGFX');

  // 2. Process #include and #define directives
  const defines: Array<{ name: string; params: string[] | null; body: string }> = [];
  const lines = code.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#include')) {
      processedLines.push('// ' + trimmed);
      continue;
    }
    if (
      trimmed.startsWith('#ifdef') ||
      trimmed.startsWith('#ifndef') ||
      trimmed.startsWith('#endif') ||
      trimmed.startsWith('#else') ||
      trimmed.startsWith('#pragma')
    ) {
      processedLines.push('// ' + trimmed);
      continue;
    }
    const defineMatch = trimmed.match(/^#define\s+([A-Za-z_]\w*)(\(([^)]*)\))?\s*(.*)$/);
    if (defineMatch) {
      const name = defineMatch[1];
      const params = defineMatch[2]
        ? defineMatch[3]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
      const body = defineMatch[4].trim();
      if (body.length > 0) {
        defines.push({ name, params, body });
      }
      processedLines.push(`// #define ${name}`);
      continue;
    }
    processedLines.push(lines[i]);
  }

  code = processedLines.join('\n');

  // Strip real-hardware LovyanGFX class LGFX : public lgfx::LGFX_Device { ... }; boilerplate if present
  code = code.replace(
    /class\s+LGFX\s*:\s*public\s+[^{]+\{(?:[^{}]|\{[^{}]*\})*\}\s*;/g,
    '// [emulator] class LGFX hardware bus config handled natively'
  );

  // Strip C++ float literal suffix `20.0f` -> `20.0`, unsigned/long suffixes `1000UL` -> `1000`, and `::` -> `.`
  code = replaceOutsideStrings(code, (seg) =>
    seg
      .replace(/::/g, '.')
      .replace(/\b(\d+\.\d+)[fF]\b/g, '$1')
      .replace(/\b(\d+)[uUlL]+\b/g, '$1')
  );

  // Apply macros outside string literals
  for (const def of defines) {
    if (!def.params) {
      const regex = new RegExp(`\\b${def.name}\\b`, 'g');
      code = replaceOutsideStrings(code, (segment) => segment.replace(regex, `(${def.body})`));
    }
  }

  // 3. Collect struct definitions and transform them into factory helpers
  const structNames = new Set<string>();
  const structArrayVars = new Set<string>();

  code = code.replace(
    /\b(?:typedef\s+)?struct\s+([A-Za-z_]\w*)?\s*\{([\s\S]*?)\}\s*([A-Za-z_]\w*)?\s*;/g,
    (_match, name1, body, name2) => {
      const structName = (name2 || name1 || 'AnonStruct').trim();
      structNames.add(structName);
      const fields: Array<{ name: string; isArray: boolean; len: string }> = [];
      const fieldLines = body.split(';');
      for (const fl of fieldLines) {
        const clean = fl.trim();
        if (!clean) continue;
        // Strip leading type keywords to get comma-separated field names (e.g. `float x, y;`)
        const withoutType = clean.replace(
          /^(?:(?:const|static|volatile|unsigned|signed)\s+)*[A-Za-z_]\w*\s+/,
          ''
        );
        const parts = withoutType.split(',');
        for (const p of parts) {
          const m = p.trim().match(/^([A-Za-z_]\w*)(?:\s*\[([^\]]+)\])?$/);
          if (m) {
            fields.push({ name: m[1], isArray: Boolean(m[2]), len: m[2] || '0' });
          }
        }
      }
      const fieldAssigns = fields
        .map((f, idx) => {
          const defVal = f.isArray ? `new Array(${f.len}).fill(0)` : '0';
          return `${f.name}: (__init && __init[${idx}] !== undefined) ? __init[${idx}] : ((__init && __init.${f.name} !== undefined) ? __init.${f.name} : ${defVal})`;
        })
        .join(', ');
      return `function __make_${structName}(__init) { return { ${fieldAssigns} }; }`;
    }
  );

  // 4. Normalize known library object constructors (Adafruit_ILI9341, TFT_eSPI, LGFX, LGFX_Sprite, FastLED, etc.)
  code = code.replace(
    /\b(?:static\s+)?(?:Adafruit_ILI9341|TFT_eSPI|LGFX)\s+([A-Za-z_]\w*)\s*(?:=\s*(?:Adafruit_ILI9341|TFT_eSPI|LGFX)\s*\([^)]*\)|\([^)]*\))?\s*;/g,
    'var $1 = __tft;'
  );
  code = code.replace(
    /\b(?:static\s+)?LGFX_Sprite\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*;/g,
    'var $1 = __tft;'
  );
  code = code.replace(
    /\bXPT2046_Touchscreen\s+([A-Za-z_]\w*)\s*(?:=\s*XPT2046_Touchscreen\s*\([^)]*\)|\([^)]*\))?\s*;/g,
    'var $1 = __ts;'
  );
  code = code.replace(
    /\bWiFiUDP\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*;/g,
    'var $1 = __udp;'
  );
  code = code.replace(
    /\bBluetoothSerial\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*;/g,
    'var $1 = SerialBT;'
  );
  code = code.replace(
    /\bCRGB\s+([A-Za-z_]\w*)\s*\[([^\]]+)\]\s*;/g,
    'var $1 = __createCrgbArray($2);'
  );
  code = code.replace(
    /\bFastLED\.addLeds\s*<[^>]+>\s*\(/g,
    'FastLED.addLeds('
  );
  code = code.replace(
    /\besp_now_peer_info_t\s+([A-Za-z_]\w*)\s*;/g,
    'let $1 = { peer_addr: [0xff,0xff,0xff,0xff,0xff,0xff], channel: 0, encrypt: false };'
  );
  code = code.replace(
    /\b(?:Adafruit_MPU6050|MPU6050)\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*;/g,
    'var $1 = __mpu;'
  );
  code = code.replace(
    /\bsensors_event_t\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*;/g,
    (_m, names: string) =>
      'let ' +
      names
        .split(',')
        .map(
          (n) =>
            `${n.trim()} = { acceleration: { x: 0, y: 0, z: 9.81 }, gyro: { x: 0, y: 0, z: 0 }, temperature: 24.5 }`
        )
        .join(', ') +
      ';'
  );

  const baseTypes = [
    'unsigned\\s+long\\s+long',
    'unsigned\\s+long',
    'unsigned\\s+int',
    'unsigned\\s+short',
    'unsigned\\s+char',
    'signed\\s+char',
    'long\\s+long',
    'uint8_t',
    'int8_t',
    'uint16_t',
    'int16_t',
    'uint32_t',
    'int32_t',
    'uint64_t',
    'int64_t',
    'size_t',
    'boolean',
    'bool',
    'byte',
    'word',
    'float',
    'double',
    'short',
    'long',
    'int',
    'char',
    'String',
    'void',
    'File',
    'TS_Point',
    'IPAddress',
    'CRGB',
    ...Array.from(structNames),
  ];
  const typePattern = `(?:(?:const|static|volatile|PROGMEM|inline)\\s+)*(?:${baseTypes.join('|')})(?:\\s*\\*+)?`;

  // 4b. Strip C++ function forward declarations / prototypes: e.g. `void initGame();` or `void drawMeteor(Meteor &m);`
  const funcProtoRegex = new RegExp(
    `(^|[\\n;{}])\\s*${typePattern}\\s+([A-Za-z_]\\w*)\\s*\\([^;{}]*\\)\\s*;`,
    'gm'
  );
  code = replaceOutsideStrings(code, (seg) => seg.replace(funcProtoRegex, '$1'));

  // 5. Identify user functions and convert them to async functions
  const userFunctions = new Set<string>();
  const funcDeclRegex = new RegExp(
    `(^|[\\n;{}])\\s*${typePattern}\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{`,
    'gm'
  );

  code = code.replace(funcDeclRegex, (_match, prefix, fnName, rawParams) => {
    userFunctions.add(fnName);
    const cleanedParams = cleanParameterList(rawParams, typePattern);
    return `${prefix}\nasync function ${fnName}(${cleanedParams}) {`;
  });

  // 6. Convert C++ cast expressions outside strings: (int)x, (int)(a + b), (float)y, etc.
  code = replaceOutsideStrings(code, (seg) => replaceCStyleCasts(seg));

  // 7. Convert 2D and 1D array declarations
  const arr2dInitRegex = new RegExp(
    `\\b${typePattern}\\s+([A-Za-z_]\\w*)\\s*\\[([^\\]]*)\\]\\s*\\[([^\\]]*)\\]\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
    'g'
  );
  code = code.replace(arr2dInitRegex, (_m, name, _d1, _d2, initBody) => {
    const converted = initBody.replace(/\{/g, '[').replace(/\}/g, ']');
    return `let ${name} = [${converted}];`;
  });

  const arr2dRegex = new RegExp(
    `\\b${typePattern}\\s+([A-Za-z_]\\w*)\\s*\\[([^\\]]+)\\]\\s*\\[([^\\]]+)\\]\\s*;`,
    'g'
  );
  code = code.replace(arr2dRegex, (_m, name, d1, d2) => {
    return `let ${name} = Array.from({ length: ${d1} }, () => new Array(${d2}).fill(0));`;
  });

  // 1D array with initializer: int arr[] = {1, 2, 3};
  const arr1dInitRegex = new RegExp(
    `\\b${typePattern}\\s+([A-Za-z_]\\w*)\\s*\\[[^\\]]*\\]\\s*(?:PROGMEM\\s*)?=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
    'g'
  );
  code = code.replace(arr1dInitRegex, (_m, name, initBody) => {
    const converted = initBody.replace(/\{/g, '[').replace(/\}/g, ']');
    return `let ${name} = [${converted}];`;
  });

  // char str[32] = "hello";
  const charArrStrRegex = new RegExp(
    `\\b(?:const\\s+)?char\\s+([A-Za-z_]\\w*)\\s*\\[[^\\]]*\\]\\s*=\\s*("[^"]*");`,
    'g'
  );
  code = code.replace(charArrStrRegex, 'let $1 = $2;');

  // Uninitialized 1D array: int arr[10]; or StructName items[10];
  const arr1dRegex = new RegExp(
    `\\b(${typePattern})\\s+([A-Za-z_]\\w*)\\s*\\[([^\\]]+)\\]\\s*;`,
    'g'
  );
  code = code.replace(arr1dRegex, (_m, rawType, name, len) => {
    const cleanType = rawType.replace(/\b(?:const|static|volatile|PROGMEM|inline)\b/g, '').trim();
    if (structNames.has(cleanType)) {
      structArrayVars.add(name);
      return `let ${name} = Array.from({ length: ${len} }, () => __make_${cleanType}());`;
    }
    return `let ${name} = new Array(${len}).fill(0);`;
  });

  // Ensure struct array element assignment `meteors[i] = m;` clones the struct value like C++
  for (const sArr of structArrayVars) {
    const assignRegex = new RegExp(`\\b(${sArr}\\s*\\[[^\\]]+\\])\\s*=\\s*([^;=]+);`, 'g');
    code = replaceOutsideStrings(code, (seg) =>
      seg.replace(assignRegex, '$1 = __cloneStruct($2);')
    );
  }

  // 8. Convert struct variable declarations: StructName s = {1, 2}; or StructName s;
  for (const sName of structNames) {
    const structInitRegex = new RegExp(
      `\\b${sName}\\s+([A-Za-z_]\\w*)\\s*=\\s*\\{([^}]*)\\}\\s*;`,
      'g'
    );
    code = code.replace(structInitRegex, `let $1 = __make_${sName}([$2]);`);

    const structBareRegex = new RegExp(`\\b${sName}\\s+([A-Za-z_]\\w*)\\s*;`, 'g');
    code = code.replace(structBareRegex, `let $1 = __make_${sName}();`);
  }

  // 9. Convert inside for(...) loop initializers: for (int i = 0; ...)
  const forLoopTypeRegex = new RegExp(`\\bfor\\s*\\(\\s*${typePattern}\\s+`, 'g');
  code = code.replace(forLoopTypeRegex, 'for (let ');

  // 9b. Handle `static <type> <var> = <init>;` so static variables retain state across loop() calls
  const staticInitializers: string[] = [];
  const staticVarRegex = new RegExp(
    `(^|[\\n;{}])(\\s*)static\\s+(?:${baseTypes.join('|')})\\s+([A-Za-z_]\\w*)\\s*=\\s*([^;]+);`,
    'g'
  );
  code = replaceOutsideStrings(code, (seg) =>
    seg.replace(staticVarRegex, (_m, prefix, indent, varName, initExpr) => {
      staticInitializers.push(`let ${varName} = ${initExpr};`);
      return `${prefix}${indent}/* static ${varName} */`;
    })
  );

  // 10. Convert remaining typed variable declarations
  const uninitVarDeclRegex = new RegExp(
    `(^|[\\n;{}])(\\s*)(${typePattern})\\s+([A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*)\\s*;`,
    'g'
  );
  code = replaceOutsideStrings(code, (seg) =>
    seg.replace(uninitVarDeclRegex, (fullMatch, prefix, indent, rawType, varNames) => {
      if (/\b(?:function|return)\b/.test(fullMatch)) return fullMatch;
      const isString = /\bString\b/.test(rawType);
      const isBool = /\b(?:bool|boolean)\b/.test(rawType);
      const initVal = isString ? '""' : isBool ? 'false' : '0';
      const parts = varNames
        .split(',')
        .map((v: string) => `${v.trim()} = ${initVal}`)
        .join(', ');
      return `${prefix}${indent}let ${parts};`;
    })
  );

  const initVarDeclRegex = new RegExp(
    `(^|[\\n;{}])(\\s*)(${typePattern})\\s+(?=[A-Za-z_]\\w*\\s*=)`,
    'g'
  );
  code = replaceOutsideStrings(code, (seg) =>
    seg.replace(initVarDeclRegex, (fullMatch, prefix, indent) => {
      if (/\b(?:function|return)\b/.test(fullMatch)) return fullMatch;
      return `${prefix}${indent}let `;
    })
  );

  // 11. Handle sizeof(x), pointer-based touch coordinates: lcd.getTouch(&tx, &ty), and mpu.getEvent(&a, &g, &temp)
  code = replaceOutsideStrings(code, (seg) =>
    seg
      .replace(/\bsizeof\s*\(\s*([A-Za-z_]\w*)\s*\)/g, '__sizeof($1)')
      .replace(
        /\b([A-Za-z_]\w*)\.getTouch\s*\(\s*&\s*([A-Za-z_]\w*)\s*,\s*&\s*([A-Za-z_]\w*)\s*\)/g,
        '($1.getTouch() ? ($2 = $1.getTouchX(), $3 = $1.getTouchY(), true) : false)'
      )
      .replace(
        /\b([A-Za-z_]\w*)\.getEvent\s*\(\s*&\s*([A-Za-z_]\w*)\s*,\s*&\s*([A-Za-z_]\w*)\s*,\s*&\s*([A-Za-z_]\w*)\s*\)/g,
        '$1.getEvent($2, $3, $4)'
      )
  );

  // 12. Inject low-overhead cooperative loop guard into while(...) and for(...) loops
  code = replaceOutsideStrings(code, (seg) => {
    let s = seg;
    s = s.replace(/\b(while\s*\([^)]*\)\s*\{)/g, '$1 if ((++__step & 32767) === 0) await __loopTick(); ');
    s = s.replace(/\b(for\s*\([^)]*\)\s*\{)/g, '$1 if ((++__step & 32767) === 0) await __loopTick(); ');
    return s;
  });

  // 13. Automatically await async functions: delay, delayMicroseconds, yield, and all user functions
  code = replaceOutsideStrings(code, (seg) =>
    seg.replace(/\byield\s*\(/g, 'await __arduinoYield(')
  );
  const asyncFuncs = ['delay', 'delayMicroseconds', ...Array.from(userFunctions)];
  for (const fn of asyncFuncs) {
    if (fn === 'setup' || fn === 'loop') continue;
    const callRegex = new RegExp(`(?<!function\\s+|await\\s+)\\b(${fn})\\s*\\(`, 'g');
    code = replaceOutsideStrings(code, (seg) => seg.replace(callRegex, 'await $1('));
  }

  const headerLines = ['let __step = 0;', ...staticInitializers];
  code = `${headerLines.join('\n')}\n${code}`;

  return {
    jsCode: code,
    userFunctions: Array.from(userFunctions),
  };
}

function replaceCStyleCasts(input: string): string {
  let s = input.replace(/\(\s*(?:const\s+)?(?:uint8_t|char|byte|void)\s*\*\s*\)/g, '');
  const castRegex =
    /\(\s*(int|long|short|int8_t|int16_t|int32_t|uint8_t|uint16_t|uint32_t|byte|word|size_t|unsigned\s+int|unsigned\s+long|float|double)\s*\)\s*/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = castRegex.exec(s)) !== null) {
    result += s.slice(lastIndex, match.index);
    const castType = match[1];
    const fn = /^(?:float|double)$/.test(castType) ? 'Number' : 'Math.trunc';
    let idx = castRegex.lastIndex;

    if (s[idx] === '(') {
      // Find matching closing parenthesis so `(int)(a + b * c)` becomes `Math.trunc((a + b * c))`
      let depth = 1;
      let j = idx + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')') depth--;
        j++;
      }
      const inner = replaceCStyleCasts(s.slice(idx + 1, j - 1));
      result += `${fn}(${inner})`;
      lastIndex = j;
      castRegex.lastIndex = j;
    } else {
      // Match identifier/number/call immediately following the cast: e.g. `(int)rx` or `(float)col`
      const rest = s.slice(idx);
      const atomMatch = rest.match(/^[A-Za-z0-9_.]+(?:\s*\([^)]*\))?/);
      if (atomMatch) {
        result += `${fn}(${atomMatch[0]})`;
        lastIndex = idx + atomMatch[0].length;
        castRegex.lastIndex = lastIndex;
      } else {
        result += match[0];
        lastIndex = idx;
      }
    }
  }

  result += s.slice(lastIndex);
  return result;
}

function stripClassDefinition(code: string, className: string): string {
  const regex = new RegExp(`\\bclass\\s+${className}\\b[^{]*\\{`);
  const match = regex.exec(code);
  if (!match) return code;
  const startIdx = match.index;
  let i = startIdx + match[0].length;
  let depth = 1;
  while (i < code.length && depth > 0) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') depth--;
    i++;
  }
  while (i < code.length && (code[i] === ' ' || code[i] === '\t' || code[i] === ';')) {
    i++;
  }
  return code.slice(0, startIdx) + `// class ${className} stripped` + code.slice(i);
}

function stripCommentsPreservingStrings(input: string): string {
  let out = '';
  let i = 0;
  const len = input.length;
  while (i < len) {
    const ch = input[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const c = input[i];
        out += c;
        i++;
        if (c === '\\' && i < len) {
          out += input[i];
          i++;
        } else if (c === quote) {
          break;
        }
      }
    } else if (ch === '/' && input[i + 1] === '/') {
      while (i < len && input[i] !== '\n') i++;
    } else if (ch === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < len && !(input[i] === '*' && input[i + 1] === '/')) {
        if (input[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function replaceOutsideStrings(input: string, replacer: (seg: string) => string): string {
  let out = '';
  let lastIdx = 0;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];
    if (ch === '"' || ch === "'") {
      if (i > lastIdx) {
        out += replacer(input.slice(lastIdx, i));
      }
      const quote = ch;
      let strLiteral = ch;
      i++;
      while (i < len) {
        const c = input[i];
        strLiteral += c;
        i++;
        if (c === '\\' && i < len) {
          strLiteral += input[i];
          i++;
        } else if (c === quote) {
          break;
        }
      }
      if (quote === "'" && strLiteral.length >= 3) {
        const inner = strLiteral.slice(1, -1);
        if (inner === '\\n') out += '10';
        else if (inner === '\\r') out += '13';
        else if (inner === '\\t') out += '9';
        else if (inner === '\\0') out += '0';
        else if (inner.length === 1) out += String(inner.charCodeAt(0));
        else out += strLiteral;
      } else {
        out += strLiteral;
      }
      lastIdx = i;
    } else {
      i++;
    }
  }
  if (lastIdx < len) {
    out += replacer(input.slice(lastIdx));
  }
  return out;
}

function cleanParameterList(rawParams: string, typePattern: string): string {
  const trimmed = rawParams.trim();
  if (!trimmed || trimmed === 'void') return '';
  const parts = splitTopLevelCommas(trimmed);
  const paramTypeRegex = new RegExp(
    `^${typePattern}\\s*(?:&\\s*)?([A-Za-z_]\\w*)(?:\\s*\\[[^\\]]*\\])?(?:\\s*=\\s*(.+))?$`
  );
  return parts
    .map((p) => {
      const clean = p.trim();
      const m = clean.match(paramTypeRegex);
      if (m) {
        return m[2] ? `${m[1]} = ${m[2]}` : m[1];
      }
      const tokens = clean.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/);
      const last = tokens[tokens.length - 1]?.replace(/^[&*]+/, '') || 'arg';
      return last;
    })
    .join(', ');
}

function splitTopLevelCommas(str: string): string[] {
  const res: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      res.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) res.push(current);
  return res;
}

function formatPrintf(fmt: string, args: unknown[]): string {
  let argIdx = 0;
  return String(fmt).replace(/%(-?\d+)?(?:\.(\d+))?([diuoxXfsc%])/g, (_match, width, prec, spec) => {
    if (spec === '%') return '%';
    const val = args[argIdx++];
    let out = '';
    switch (spec) {
      case 'd':
      case 'i':
      case 'u':
        out = String(Math.trunc(Number(val) || 0));
        break;
      case 'x':
        out = (Math.trunc(Number(val) || 0) >>> 0).toString(16);
        break;
      case 'X':
        out = (Math.trunc(Number(val) || 0) >>> 0).toString(16).toUpperCase();
        break;
      case 'f':
        out = (Number(val) || 0).toFixed(prec !== undefined ? Number(prec) : 2);
        break;
      case 'c':
        out = typeof val === 'number' ? String.fromCharCode(val) : String(val ?? '')[0] || '';
        break;
      case 's':
      default:
        out = String(val ?? '');
        break;
    }
    if (width) {
      const w = parseInt(width, 10);
      const padChar = width.startsWith('0') ? '0' : ' ';
      if (w > 0 && out.length < w) {
        out = out.padStart(w, padChar);
      } else if (w < 0 && out.length < -w) {
        out = out.padEnd(-w, ' ');
      }
    }
    return out;
  });
}

export class ArduinoSketchVM {
  private callbacks: RuntimeCallbacks;
  private running = false;
  private abortController: AbortController | null = null;
  private loopStepCounter = 0;
  private espNowRecvCb: ((mac: number[], data: string, len: number) => void) | null = null;

  constructor(callbacks: RuntimeCallbacks) {
    this.callbacks = callbacks;
  }

  public compileAndStart(sketchCode: string, onError: (err: string) => void): boolean {
    this.stop();

    let transpiled: { jsCode: string; userFunctions: string[] };
    try {
      transpiled = transpileArduinoSketch(sketchCode);
    } catch (err) {
      onError(`Transpile error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    this.running = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const cb = this.callbacks;

    const sleepMs = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (!this.running || signal.aborted || !cb.isRunning()) {
          reject(new Error('__ABORTED__'));
          return;
        }
        const t = setTimeout(() => {
          if (!this.running || signal.aborted || !cb.isRunning()) {
            reject(new Error('__ABORTED__'));
          } else {
            resolve();
          }
        }, Math.max(0, ms));
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new Error('__ABORTED__'));
          },
          { once: true }
        );
      });

    const __loopTick = async () => {
      if (!this.running || signal.aborted || !cb.isRunning()) {
        throw new Error('__ABORTED__');
      }
      this.loopStepCounter++;
      if (this.loopStepCounter % 4000 === 0) {
        await sleepMs(1);
      }
    };

    // Build TFT wrapper object supporting Adafruit_ILI9341, TFT_eSPI, and LovyanGFX (LGFX / LGFX_Sprite)
    const disp = cb.display;
    const __tft = {
      begin: () => disp.begin(),
      init: () => disp.init(),
      setRotation: (r: number) => disp.setRotation(r),
      fillScreen: (c: number) => disp.fillScreen(c),
      clear: (c = 0) => disp.fillScreen(c),
      clearDisplay: () => disp.fillScreen(0),
      drawPixel: (x: number, y: number, c: number) => disp.drawPixel(x, y, c),
      readPixel: (x: number, y: number) => disp.readPixel(x, y),
      drawLine: (x0: number, y0: number, x1: number, y1: number, c: number) =>
        disp.drawLine(x0, y0, x1, y1, c),
      drawFastHLine: (x: number, y: number, w: number, c: number) => disp.drawFastHLine(x, y, w, c),
      drawFastVLine: (x: number, y: number, h: number, c: number) => disp.drawFastVLine(x, y, h, c),
      drawRect: (x: number, y: number, w: number, h: number, c: number) =>
        disp.drawRect(x, y, w, h, c),
      fillRect: (x: number, y: number, w: number, h: number, c: number) =>
        disp.fillRect(x, y, w, h, c),
      drawRoundRect: (x: number, y: number, w: number, h: number, r: number, c: number) =>
        disp.drawRoundRect(x, y, w, h, r, c),
      fillRoundRect: (x: number, y: number, w: number, h: number, r: number, c: number) =>
        disp.fillRoundRect(x, y, w, h, r, c),
      drawCircle: (x: number, y: number, r: number, c: number) => disp.drawCircle(x, y, r, c),
      fillCircle: (x: number, y: number, r: number, c: number) => disp.fillCircle(x, y, r, c),
      drawEllipse: (x: number, y: number, rx: number, ry: number, c: number) =>
        disp.drawEllipse(x, y, rx, ry, c),
      fillEllipse: (x: number, y: number, rx: number, ry: number, c: number) =>
        disp.fillEllipse(x, y, rx, ry, c),
      drawTriangle: (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        c: number
      ) => disp.drawTriangle(x0, y0, x1, y1, x2, y2, c),
      fillTriangle: (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        c: number
      ) => disp.fillTriangle(x0, y0, x1, y1, x2, y2, c),
      setCursor: (x: number, y: number) => disp.setCursor(x, y),
      setTextColor: (fg: number, bg?: number) => disp.setTextColor(fg, bg),
      setTextSize: (s: number) => disp.setTextSize(s),
      setTextFont: (f: number) => disp.setTextFont(f),
      setTextWrap: (w: boolean) => disp.setTextWrap(w),
      print: (val: unknown) => disp.print(val),
      println: (val?: unknown) => disp.println(val),
      printf: (fmt: string, ...args: unknown[]) => disp.print(formatPrintf(fmt, args)),
      drawString: (str: unknown, x: number, y: number, font = 1) =>
        disp.drawString(str, x, y, font),
      drawCentreString: (str: unknown, x: number, y: number, font = 1) =>
        disp.drawCentreString(str, x, y, font),
      drawRightString: (str: unknown, x: number, y: number, font = 1) =>
        disp.drawRightString(str, x, y, font),
      drawNumber: (num: number, x: number, y: number, font = 1) =>
        disp.drawString(String(Math.trunc(num)), x, y, font),
      drawFloat: (num: number, dp: number, x: number, y: number, font = 1) =>
        disp.drawString(Number(num).toFixed(dp), x, y, font),
      drawBitmap: (
        x: number,
        y: number,
        bitmap: number[],
        w: number,
        h: number,
        color: number,
        bg?: number
      ) => disp.drawBitmap(x, y, bitmap, w, h, color, bg),
      pushImage: (x: number, y: number, w: number, h: number, data: number[]) =>
        disp.pushImage(x, y, w, h, data),
      color565: (r: number, g: number, b: number) => disp.color565(r, g, b),
      width: () => disp.width(),
      height: () => disp.height(),
      invertDisplay: (i: boolean) => disp.invertDisplay(i),
      setPsram: (b: boolean) => disp.setPsram(b),
      setColorDepth: (_bits: number) => {},
      createSprite: (w = 320, h = 240) => disp.createSprite(w, h),
      deleteSprite: () => {},
      pushSprite: (x = 0, y = 0) => disp.pushSprite(x, y),
      getTouch: () => cb.getTouch().pressed,
      getTouchX: () => cb.getTouch().x,
      getTouchY: () => cb.getTouch().y,
    };

    const __ts = {
      begin: () => true,
      setRotation: (_r: number) => {},
      touched: () => cb.getTouch().pressed,
      getPoint: () => {
        const t = cb.getTouch();
        return { x: t.x, y: t.y, z: t.pressed ? t.z : 0 };
      },
    };

    // FastLED emulation for VIDI X 5x WS2812B RGB LEDs on GPIO 26
    let boundLeds: RGBLedColor[] = Array.from({ length: 5 }, () => ({ r: 0, g: 0, b: 0 }));
    const makeCrgb = (r = 0, g?: number, b?: number): RGBLedColor => {
      if (g === undefined && b === undefined) {
        const hex = Number(r) || 0;
        return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
      }
      return { r: (r || 0) & 0xff, g: (g || 0) & 0xff, b: (b || 0) & 0xff };
    };
    const CRGB = Object.assign(makeCrgb, {
      Black: { r: 0, g: 0, b: 0 },
      Red: { r: 255, g: 0, b: 0 },
      Green: { r: 0, g: 255, b: 0 },
      Blue: { r: 0, g: 120, b: 255 },
      Yellow: { r: 255, g: 220, b: 0 },
      Cyan: { r: 0, g: 255, b: 255 },
      Magenta: { r: 255, g: 0, b: 255 },
      White: { r: 255, g: 255, b: 255 },
      Orange: { r: 255, g: 140, b: 0 },
      Purple: { r: 160, g: 32, b: 240 },
    });

    const normalizeLedItem = (item: unknown): RGBLedColor => {
      if (typeof item === 'number') {
        return { r: (item >> 16) & 0xff, g: (item >> 8) & 0xff, b: item & 0xff };
      }
      if (item && typeof item === 'object' && 'r' in item) {
        const o = item as RGBLedColor;
        return { r: o.r & 0xff, g: o.g & 0xff, b: o.b & 0xff };
      }
      return { r: 0, g: 0, b: 0 };
    };

    const FastLED = {
      addLeds: (arr: RGBLedColor[]) => {
        if (Array.isArray(arr)) {
          boundLeds = arr;
        }
      },
      show: () => {
        cb.onUpdateRgbLeds(boundLeds.slice(0, 5).map(normalizeLedItem));
      },
      clear: () => {
        for (let i = 0; i < boundLeds.length; i++) {
          boundLeds[i] = { r: 0, g: 0, b: 0 };
        }
        cb.onUpdateRgbLeds(boundLeds.slice(0, 5));
      },
      setBrightness: (_b: number) => {},
    };

    const makeSerial = (uart: 0 | 2) => ({
      begin: (_baud = 115200) => {},
      print: (val: unknown) => cb.onSerialPrint(uart, String(val ?? '')),
      println: (val?: unknown) => cb.onSerialPrint(uart, `${val !== undefined ? String(val) : ''}\n`),
      printf: (fmt: string, ...args: unknown[]) =>
        cb.onSerialPrint(uart, formatPrintf(fmt, args)),
      write: (val: number | string) =>
        cb.onSerialPrint(
          uart,
          typeof val === 'number' ? String.fromCharCode(val & 0xff) : String(val)
        ),
      available: () => cb.onSerialAvailable(uart),
      read: () => cb.onSerialReadChar(uart),
      readString: () => cb.onSerialReadString(uart),
      readStringUntil: (_term: string) => cb.onSerialReadString(uart).trim(),
      parseInt: () => parseInt(cb.onSerialReadString(uart), 10) || 0,
      parseFloat: () => parseFloat(cb.onSerialReadString(uart)) || 0,
      flush: () => {},
    });

    const Serial = makeSerial(0);
    const Serial2 = makeSerial(2);

    const WiFi = {
      mode: (_m: unknown) => {},
      begin: (ssid = 'VIDI-X-MESH', _pass = '') => {
        cb.onWifiConnect(String(ssid));
      },
      status: () => 3,
      localIP: () => cb.ipAddress,
      macAddress: () => cb.macAddress,
      RSSI: () => -42 - Math.floor(Math.random() * 6),
      scanNetworks: () => 3,
      SSID: (i: number) => ['VIDI-X-MESH', 'VIDI-LAB-5G', 'ESP-NOW-NET'][i] || 'VIDI-X',
      disconnect: () => {},
    };

    let udpTargetIp = '255.255.255.255';
    let udpTargetPort = 4210;
    let udpTxBuffer = '';
    let lastUdpPacket: { fromMac: string; fromIp: string; payload: string } | null = null;

    const __udp = {
      begin: (_port: number) => 1,
      beginPacket: (ip: string, port: number) => {
        udpTargetIp = String(ip);
        udpTargetPort = Number(port) || 4210;
        udpTxBuffer = '';
        return 1;
      },
      print: (val: unknown) => {
        udpTxBuffer += String(val ?? '');
      },
      println: (val?: unknown) => {
        udpTxBuffer += `${val !== undefined ? String(val) : ''}\n`;
      },
      write: (val: unknown) => {
        udpTxBuffer += String(val ?? '');
      },
      endPacket: () => {
        if (udpTxBuffer.length > 0) {
          cb.onSendWireless('WIFI-UDP', udpTargetIp, udpTxBuffer, udpTargetPort);
          udpTxBuffer = '';
        }
        return 1;
      },
      parsePacket: () => {
        const pkt = cb.onPopWirelessPacket('WIFI-UDP');
        if (pkt) {
          lastUdpPacket = pkt;
          return pkt.payload.length;
        }
        return 0;
      },
      readString: () => {
        const s = lastUdpPacket?.payload || '';
        lastUdpPacket = null;
        return s;
      },
      remoteIP: () => lastUdpPacket?.fromIp || '0.0.0.0',
    };

    let lastNetPacket: { fromMac: string; fromIp: string; payload: string } | null = null;
    const VidiNetwork = {
      begin: () => {
        cb.onEspNowInit();
        return true;
      },
      getBoardNumber: () => cb.boardIndex + 1,
      boardIndex: () => cb.boardIndex,
      getBoardIndex: () => cb.boardIndex,
      getMac: () => cb.macAddress,
      getIP: () => cb.ipAddress,
      broadcast: (payload: unknown) => {
        cb.onEspNowInit();
        cb.onSendWireless('ESP-NOW', 'FF:FF:FF:FF:FF:FF', String(payload ?? ''));
      },
      send: (targetMac: string, payload: unknown) => {
        cb.onEspNowInit();
        cb.onSendWireless('ESP-NOW', String(targetMac), String(payload ?? ''));
      },
      available: () => {
        if (lastNetPacket) return lastNetPacket.payload.length;
        const pkt = cb.onPopWirelessPacket('ESP-NOW') || cb.onPopWirelessPacket('WIFI-UDP');
        if (pkt) {
          lastNetPacket = pkt;
          return pkt.payload.length;
        }
        return 0;
      },
      readString: () => {
        if (!lastNetPacket) {
          lastNetPacket = cb.onPopWirelessPacket('ESP-NOW') || cb.onPopWirelessPacket('WIFI-UDP');
        }
        const msg = lastNetPacket?.payload || '';
        lastNetPacket = null;
        return msg;
      },
      readMessage: () => {
        if (!lastNetPacket) {
          lastNetPacket = cb.onPopWirelessPacket('ESP-NOW') || cb.onPopWirelessPacket('WIFI-UDP');
        }
        const msg = lastNetPacket?.payload || '';
        lastNetPacket = null;
        return msg;
      },
      lastSenderMac: () => lastNetPacket?.fromMac || '00:00:00:00:00:00',
    };

    let lastBtPacket: { fromMac: string; fromIp: string; payload: string } | null = null;
    const SerialBT = {
      begin: (name = 'VIDI-X-BT') => {
        cb.onBtBegin(String(name));
        return true;
      },
      available: () => {
        if (lastBtPacket) return lastBtPacket.payload.length;
        const pkt = cb.onPopWirelessPacket('BLUETOOTH');
        if (pkt) {
          lastBtPacket = pkt;
          return pkt.payload.length;
        }
        return 0;
      },
      readString: () => {
        if (!lastBtPacket) {
          lastBtPacket = cb.onPopWirelessPacket('BLUETOOTH');
        }
        const s = lastBtPacket?.payload || '';
        lastBtPacket = null;
        return s;
      },
      print: (val: unknown) =>
        cb.onSendWireless('BLUETOOTH', 'FF:FF:FF:FF:FF:FF', String(val ?? '')),
      println: (val?: unknown) =>
        cb.onSendWireless('BLUETOOTH', 'FF:FF:FF:FF:FF:FF', `${val ?? ''}`),
    };

    const IrReceiver = {
      begin: (_pin = VIDI_X_PINS.IR_PIN) => {},
      decode: () => {
        const ir = cb.onGetIrCode();
        if (ir.available) {
          IrReceiver.decodedIRData.command = ir.code & 0xff;
          IrReceiver.decodedIRData.decodedRawData = ir.code;
          return true;
        }
        return false;
      },
      resume: () => {
        cb.onConsumeIrCode();
      },
      decodedIRData: {
        command: 0,
        address: 0x01,
        decodedRawData: 0,
      },
    };

    const IrSender = {
      begin: (_pin = VIDI_X_PINS.IR_TX_PIN) => {},
      sendNEC: (_address: number, command: number, _repeats = 0) => {
        cb.onSendWireless(
          'IR',
          'FF:FF:FF:FF:FF:FF',
          `IR:0x${command.toString(16).toUpperCase()}`,
          command
        );
      },
    };

    const SD = {
      begin: (_cs = VIDI_X_PINS.SD_CS) => true,
      exists: (path: string) => cb.onSdRead(path) !== null,
      remove: (path: string) => cb.onSdRemove(path),
      open: (path: string, mode = 'r') => {
        const isWrite =
          mode === 'w' || mode === 'FILE_WRITE' || mode === 'a' || mode === 'FILE_APPEND';
        const isAppend = mode === 'a' || mode === 'FILE_APPEND';
        let writeBuf = '';
        const existing = cb.onSdRead(path);
        let readContent = existing ? existing.content : '';
        return {
          print: (v: unknown) => {
            writeBuf += String(v ?? '');
          },
          println: (v?: unknown) => {
            writeBuf += `${v !== undefined ? String(v) : ''}\n`;
          },
          available: () => readContent.length,
          readString: () => {
            const s = readContent;
            readContent = '';
            return s;
          },
          close: () => {
            if (isWrite) {
              cb.onSdWrite(path, writeBuf, isAppend);
            }
          },
        };
      },
    };

    let activeI2cAddress = 0x68;
    const Wire = {
      begin: (_sda = 33, _scl = 32) => {},
      beginTransmission: (addr: number) => {
        activeI2cAddress = Number(addr) || 0;
      },
      write: (val: unknown) => {
        cb.onSerialPrint(2, String(val ?? ''));
      },
      endTransmission: () => (activeI2cAddress === 0x68 ? 0 : 2),
      requestFrom: (_addr: number, _len: number) => 0,
      available: () => cb.onSerialAvailable(2),
      read: () => cb.onSerialReadChar(2),
    };

    const getGyroAccel = () => {
      const s = cb.getSensors?.();
      const roll = s?.gyroRoll ?? 0;
      const pitch = s?.gyroPitch ?? 0;
      const yaw = s?.gyroYaw ?? 0;
      const rollRad = (roll * Math.PI) / 180;
      const pitchRad = (pitch * Math.PI) / 180;
      const ax = +(9.81 * Math.sin(rollRad)).toFixed(2);
      const ay = +(9.81 * Math.sin(pitchRad)).toFixed(2);
      const az = +(9.81 * Math.cos(rollRad) * Math.cos(pitchRad)).toFixed(2);
      const gx = +(s?.gyroRateX ?? 0).toFixed(2);
      const gy = +(s?.gyroRateY ?? 0).toFixed(2);
      const gz = +(s?.gyroRateZ ?? 0).toFixed(2);
      const temp = +(s?.temperatureC ?? 24.5).toFixed(1);
      return { roll, pitch, yaw, ax, ay, az, gx, gy, gz, temp };
    };

    const __mpu = {
      begin: () => true,
      setAccelerometerRange: () => {},
      setGyroRange: () => {},
      setFilterBandwidth: () => {},
      getEvent: (
        a?: { acceleration: { x: number; y: number; z: number } },
        g?: { gyro: { x: number; y: number; z: number } },
        t?: { temperature: number }
      ) => {
        const m = getGyroAccel();
        if (a && a.acceleration) {
          a.acceleration.x = m.ax;
          a.acceleration.y = m.ay;
          a.acceleration.z = m.az;
        }
        if (g && g.gyro) {
          g.gyro.x = m.gx;
          g.gyro.y = m.gy;
          g.gyro.z = m.gz;
        }
        if (t) {
          t.temperature = m.temp;
        }
        return true;
      },
      getRoll: () => getGyroAccel().roll,
      getPitch: () => getGyroAccel().pitch,
      getYaw: () => getGyroAccel().yaw,
      getAccX: () => getGyroAccel().ax,
      getAccY: () => getGyroAccel().ay,
      getAccZ: () => getGyroAccel().az,
      getGyroX: () => getGyroAccel().gx,
      getGyroY: () => getGyroAccel().gy,
      getGyroZ: () => getGyroAccel().gz,
      getTemperature: () => getGyroAccel().temp,
    };

    const env: Record<string, unknown> = {
      HIGH: 1,
      LOW: 0,
      INPUT: 'INPUT',
      OUTPUT: 'OUTPUT',
      INPUT_PULLUP: 'INPUT_PULLUP',
      INPUT_PULLDOWN: 'INPUT_PULLDOWN',
      WIFI_STA: 1,
      WIFI_AP: 2,
      WIFI_AP_STA: 3,
      WL_CONNECTED: 3,
      ESP_OK: 0,
      FILE_READ: 'r',
      FILE_WRITE: 'w',
      FILE_APPEND: 'a',
      PI: Math.PI,
      HALF_PI: Math.PI / 2,
      TWO_PI: Math.PI * 2,
      DEG_TO_RAD: Math.PI / 180,
      RAD_TO_DEG: 180 / Math.PI,
      A0: 26,
      WS2812B: 1,
      WS2812: 1,
      NEOPIXEL: 1,
      GRB: 1,
      RGB: 1,

      ...VIDI_X_PINS,
      ...TFT_COLORS,

      pinMode: (pin: number, mode: PinModeType) => cb.onPinMode(Number(pin), mode),
      digitalWrite: (pin: number, val: number | boolean) =>
        cb.onDigitalWrite(Number(pin), val ? 1 : 0),
      digitalRead: (pin: number) => cb.onDigitalRead(Number(pin)),
      analogRead: (pin: number) => cb.onAnalogRead(Number(pin)),
      analogWrite: (pin: number, val: number) => cb.onAnalogWrite(Number(pin), Number(val)),
      dacWrite: (pin: number, val: number) => cb.onAnalogWrite(Number(pin), Number(val) * 16),
      tone: (pin: number, freq: number, duration?: number) =>
        cb.onTone(Number(pin), Number(freq), duration ? Number(duration) : undefined),
      noTone: (pin = VIDI_X_PINS.SPEAKER_PIN) => cb.onNoTone(Number(pin)),
      ledcSetup: (ch: number, freq: number, res: number) =>
        cb.onLedcSetup(Number(ch), Number(freq), Number(res)),
      ledcAttachPin: (pin: number, ch: number) => cb.onLedcAttachPin(Number(pin), Number(ch)),
      ledcWrite: (ch: number, duty: number) => cb.onLedcWrite(Number(ch), Number(duty)),
      ledcWriteTone: (ch: number, freq: number) => cb.onLedcWriteTone(Number(ch), Number(freq)),

      millis: () => cb.getMillis(),
      micros: () => cb.getMillis() * 1000,
      delay: async (ms: number) => {
        await sleepMs(Math.max(1, Number(ms) || 1));
      },
      delayMicroseconds: async (us: number) => {
        if (us >= 1000) {
          await sleepMs(Math.floor(us / 1000));
        } else {
          await __loopTick();
        }
      },
      __arduinoYield: async () => {
        await sleepMs(1);
      },
      __loopTick,

      min: Math.min,
      max: Math.max,
      abs: Math.abs,
      fabs: Math.abs,
      fmod: (a: number, b: number) => a % b,
      constrain: (x: number, a: number, b: number) => Math.min(Math.max(x, a), b),
      map: (x: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
        if (inMax === inMin) return outMin;
        return Math.trunc(((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin);
      },
      sq: (x: number) => x * x,
      sqrt: Math.sqrt,
      pow: Math.pow,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      asin: Math.asin,
      acos: Math.acos,
      atan: Math.atan,
      atan2: Math.atan2,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      radians: (deg: number) => (deg * Math.PI) / 180,
      degrees: (rad: number) => (rad * 180) / Math.PI,
      random: (a?: number, b?: number) => {
        if (a === undefined) return Math.floor(Math.random() * 0x7fffffff);
        if (b === undefined) return Math.floor(Math.random() * a);
        return Math.floor(Math.random() * (b - a)) + a;
      },
      randomSeed: (_seed: number) => {},
      bitRead: (x: number, n: number) => (x >> n) & 1,
      bitSet: (x: number, n: number) => x | (1 << n),
      bitClear: (x: number, n: number) => x & ~(1 << n),
      lowByte: (x: number) => x & 0xff,
      highByte: (x: number) => (x >> 8) & 0xff,
      String: (val: unknown, base?: number) => {
        if (typeof val === 'number' && base === 16) {
          return Math.trunc(val).toString(16).toUpperCase();
        }
        if (typeof val === 'number' && base !== undefined && base < 10) {
          return val.toFixed(base);
        }
        return String(val ?? '');
      },
      __sizeof: (v: unknown) => (Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : 4),
      __cloneStruct: <T>(obj: T): T => {
        if (!obj || typeof obj !== 'object') return obj;
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          copy[k] = Array.isArray(v) ? [...v] : v;
        }
        return copy as T;
      },
      __createCrgbArray: (len: number) => {
        const arr = Array.from({ length: len }, () => ({ r: 0, g: 0, b: 0 }));
        boundLeds = arr;
        return arr;
      },
      snprintf: (_buf: unknown, _size: number, fmt: string, ...args: unknown[]) => {
        const s = formatPrintf(fmt, args);
        if (_buf && typeof _buf === 'object') {
          (_buf as { toString: () => string }).toString = () => s;
        }
        return s.length;
      },
      sprintf: (_buf: unknown, fmt: string, ...args: unknown[]) => {
        const s = formatPrintf(fmt, args);
        if (_buf && typeof _buf === 'object') {
          (_buf as { toString: () => string }).toString = () => s;
        }
        return s.length;
      },
      atoi: (s: unknown) => parseInt(String(s), 10) || 0,
      atof: (s: unknown) => parseFloat(String(s)) || 0,

      __tft,
      tft: __tft,
      TFT: __tft,
      lcd: __tft,
      canvas: __tft,
      zaslon: __tft,
      display: __tft,
      __ts,
      ts: __ts,
      __mpu,
      mpu: __mpu,
      CRGB,
      FastLED,
      Serial,
      Serial2,
      WiFi,
      __udp,
      VidiNetwork,
      SerialBT,
      IrReceiver,
      IrSender,
      SD,
      Wire,

      esp_now_init: () => {
        cb.onEspNowInit();
        return 0;
      },
      esp_now_add_peer: () => 0,
      esp_now_register_send_cb: () => 0,
      esp_now_register_recv_cb: (fn: (mac: number[], data: string, len: number) => void) => {
        this.espNowRecvCb = fn;
        return 0;
      },
      esp_now_send: (_peer: unknown, data: unknown) => {
        cb.onSendWireless('ESP-NOW', 'FF:FF:FF:FF:FF:FF', String(data ?? ''));
        return 0;
      },
    };

    if (isPythonCode(sketchCode)) {
      const pyRuntime = createPythonRuntimeEnv(cb, __loopTick, async (sec: number) => {
        await sleepMs(Math.max(1, Math.round((Number(sec) || 0.01) * 1000)));
      });
      Object.assign(env, pyRuntime.env);
    }

    const envKeys = Object.keys(env);
    const envValues = envKeys.map((k) => env[k]);

    const runnerBody = `
      "use strict";
      return (function() {
        ${transpiled.jsCode}
        return {
          setup: typeof setup === 'function' ? setup : null,
          loop: typeof loop === 'function' ? loop : null
        };
      })();
    `;

    let hooks: { setup: (() => Promise<void>) | null; loop: (() => Promise<void>) | null };
    try {
      const factory = new Function(...envKeys, runnerBody);
      hooks = factory(...envValues);
    } catch (err) {
      this.running = false;
      onError(`Syntax / Compile Error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    if (!hooks.setup && !hooks.loop) {
      this.running = false;
      onError('Sketch must define void setup() and/or void loop().');
      return false;
    }

    (async () => {
      try {
        if (hooks.setup) {
          await hooks.setup();
        }
        while (this.running && !signal.aborted && cb.isRunning()) {
          if (this.espNowRecvCb) {
            const pkt = cb.onPopWirelessPacket('ESP-NOW');
            if (pkt) {
              const macBytes = pkt.fromMac.split(':').map((h) => parseInt(h, 16) || 0);
              this.espNowRecvCb(macBytes, pkt.payload, pkt.payload.length);
            }
          }
          if (hooks.loop) {
            await hooks.loop();
          }
          await sleepMs(16);
        }
      } catch (err) {
        if (err instanceof Error && err.message === '__ABORTED__') {
          return;
        }
        this.running = false;
        onError(`Runtime Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    return true;
  }

  public stop(): void {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.espNowRecvCb = null;
  }

  public isRunning(): boolean {
    return this.running;
  }
}
