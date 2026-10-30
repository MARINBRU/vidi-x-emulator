import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../apt-lock.sh', import.meta.url));
const tempDirs = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runApt(mode, args = ['update', '-y'], settings = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'vidix-apt-lock-test-'));
  tempDirs.push(directory);
  const count = path.join(directory, 'count');
  const calls = path.join(directory, 'calls');
  const sudo = path.join(directory, 'sudo');
  const apt = path.join(directory, 'apt-get');
  writeFileSync(sudo, '#!/usr/bin/env bash\nexec "$@"\n');
  writeFileSync(apt, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$APT_MOCK_CALLS"
count=0
if [[ -f "$APT_MOCK_COUNT" ]]; then count=$(cat "$APT_MOCK_COUNT"); fi
count=$((count + 1))
printf '%s' "$count" > "$APT_MOCK_COUNT"
case "$APT_MOCK_MODE" in
  lock-twice)
    if (( count <= 2 )); then
      echo 'E: Could not get lock /var/lib/apt/lists/lock. It is held by process 123 (unattended-upgr)' >&2
      exit 100
    fi
    ;;
  always-locked)
    echo 'E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 123 (unattended-upgr)' >&2
    exit 100
    ;;
  other-error)
    echo 'E: Failed to fetch a package from the repository' >&2
    exit 42
    ;;
  warning-then-error)
    echo 'Waiting for cache lock: Could not get lock /var/lib/dpkg/lock-frontend' >&2
    echo 'E: Failed to fetch a package from the repository' >&2
    exit 42
    ;;
esac
echo 'Package operation completed'
`);
  chmodSync(sudo, 0o755);
  chmodSync(apt, 0o755);
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', 'source "$HELPER"; apt_get_with_lock_wait "$@"', '--', ...args], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      PATH: directory + path.delimiter + process.env.PATH,
      HELPER: helper,
      APT_MOCK_CALLS: calls,
      APT_MOCK_COUNT: count,
      APT_MOCK_MODE: mode,
      VIDIX_APT_LOCK_TIMEOUT_SECONDS: '10',
      VIDIX_APT_LOCK_RETRY_SECONDS: '0',
      ...settings,
    },
  });
  return {
    ...result,
    attempts: (() => { try { return Number(readFileSync(count, 'utf8')); } catch { return 0; } })(),
    calls: (() => { try { return readFileSync(calls, 'utf8'); } catch { return ''; } })(),
  };
}

describe('VM setup package lock handling', () => {
  it('retries a temporary apt lock and preserves the apt arguments', () => {
    const result = runApt('lock-twice');
    expect(result.status).toBe(0);
    expect(result.attempts).toBe(3);
    expect(result.calls).toMatch(/DPkg::Lock::Timeout=\d+ update -y/);
    expect(result.stderr).toContain('Another package process is running');
    expect(result.stdout).toContain('Package operation completed');
  });

  it('does not retry or hide unrelated package-manager errors', () => {
    const result = runApt('other-error');
    expect(result.status).toBe(42);
    expect(result.attempts).toBe(1);
    expect(result.stdout).toContain('Failed to fetch a package');
    expect(result.stderr).not.toContain('Another package process is running');
  });

  it('does not mistake an earlier lock warning for the final failure', () => {
    const result = runApt('warning-then-error');
    expect(result.status).toBe(42);
    expect(result.attempts).toBe(1);
    expect(result.stdout).toContain('Failed to fetch a package');
    expect(result.stderr).not.toContain('Another package process is running');
  });

  it('stops with an explanation if the lock wait expires', () => {
    const result = runApt('always-locked', ['upgrade', '-y'], { VIDIX_APT_LOCK_TIMEOUT_SECONDS: '0' });
    expect(result.status).toBe(100);
    expect(result.attempts).toBe(1);
    expect(result.stderr).toContain('Timed out waiting for the package manager');
    expect(result.calls).toContain('DPkg::Lock::Timeout=0 upgrade -y');
  });

  it('passes local package paths to apt with the same lock protection', () => {
    const result = runApt('success', ['install', '-y', '/tmp/cloudflared.deb']);
    expect(result.status).toBe(0);
    expect(result.calls).toContain('install -y /tmp/cloudflared.deb');
    expect(result.calls).toContain('DPkg::Lock::Timeout=');
  });

  it('rejects an invalid lock timeout before invoking apt', () => {
    const result = runApt('success', ['update'], { VIDIX_APT_LOCK_TIMEOUT_SECONDS: 'invalid' });
    expect(result.status).toBe(2);
    expect(result.attempts).toBe(0);
  });
});
