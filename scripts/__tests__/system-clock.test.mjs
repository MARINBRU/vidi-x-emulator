import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../system-clock.sh', import.meta.url));
const tempDirs = [];
afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runClock(mode, settings = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'vidix-clock-test-'));
  tempDirs.push(directory);
  const calls = path.join(directory, 'calls');
  const count = path.join(directory, 'count');
  const writeExecutable = (name, text) => {
    const file = path.join(directory, name);
    writeFileSync(file, text);
    chmodSync(file, 0o755);
  };
  writeExecutable('sudo', '#!/usr/bin/env bash\nexec "$@"\n');
  writeExecutable('sleep', '#!/usr/bin/env bash\nexit 0\n');
  if (mode !== 'missing') writeExecutable('timedatectl', `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CLOCK_MOCK_CALLS"
if [[ "$1" == 'show' ]]; then
  count=0
  if [[ -f "$CLOCK_MOCK_COUNT" ]]; then count=$(cat "$CLOCK_MOCK_COUNT"); fi
  count=$((count + 1))
  printf '%s' "$count" > "$CLOCK_MOCK_COUNT"
  case "$CLOCK_MOCK_MODE" in
    no-systemd) exit 1 ;;
    synchronized) echo yes ;;
    synchronize) if (( count >= 3 )); then echo yes; else echo no; fi ;;
    *) echo no ;;
  esac
elif [[ "$1" == 'set-ntp' ]]; then
  if [[ "$CLOCK_MOCK_MODE" == 'unsupported' ]]; then echo 'NTP not supported' >&2; exit 1; fi
else
  exit 2
fi
`);
  const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', 'source "$HELPER"; vidix_sync_system_clock'], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      PATH: mode === 'missing' ? directory : directory + path.delimiter + process.env.PATH,
      HELPER: helper,
      CLOCK_MOCK_CALLS: calls,
      CLOCK_MOCK_COUNT: count,
      CLOCK_MOCK_MODE: mode,
      VIDIX_CLOCK_SYNC_TIMEOUT_SECONDS: '2',
      ...settings,
    },
  });
  return {
    ...result,
    calls: (() => { try { return readFileSync(calls, 'utf8'); } catch { return ''; } })(),
  };
}

describe('VM setup clock synchronization', () => {
  it('leaves an already-synchronized clock and its service alone', () => {
    const result = runClock('synchronized');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('System clock is synchronized');
    expect(result.calls).not.toContain('set-ntp');
  });

  it('enables network time and waits for a newly synchronized clock', () => {
    const result = runClock('synchronize');
    expect(result.status).toBe(0);
    expect(result.calls).toContain('set-ntp true');
    expect(result.calls.match(/show --property=NTPSynchronized --value/g)).toHaveLength(3);
    expect(result.stdout).toContain('System clock is synchronized');
  });

  it('does not block apt when network time is slow or blocked', () => {
    const result = runClock('never');
    expect(result.status).toBe(0);
    expect(result.calls).toContain('set-ntp true');
    expect(result.stderr).toContain('Network time has not synchronized yet');
    expect(result.calls.match(/show --property=NTPSynchronized --value/g)).toHaveLength(4);
  });

  it('continues when the NTP service is unsupported', () => {
    const result = runClock('unsupported');
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Could not enable network time');
    expect(result.calls).toContain('set-ntp true');
  });

  it('continues if systemd is unavailable or timedatectl is missing', () => {
    const noSystemd = runClock('no-systemd');
    expect(noSystemd.status).toBe(0);
    expect(noSystemd.stderr).toContain('Could not inspect the system clock');
    expect(noSystemd.calls).not.toContain('set-ntp');
    const missing = runClock('missing');
    expect(missing.status).toBe(0);
    expect(missing.stderr).toContain('Automatic clock synchronization is unavailable');
  });

  it('validates a configured timeout before changing clock services', () => {
    const result = runClock('never', { VIDIX_CLOCK_SYNC_TIMEOUT_SECONDS: 'invalid' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('whole number of seconds');
    expect(result.calls).not.toContain('set-ntp');
  });
});
