#!/usr/bin/env bash
# Wait for unattended-upgrades or another apt process without deleting lock files.

apt_get_with_lock_wait() (
  set -o pipefail

  local timeout="${VIDIX_APT_LOCK_TIMEOUT_SECONDS:-900}"
  local retry="${VIDIX_APT_LOCK_RETRY_SECONDS:-5}"
  if [[ ! "$timeout" =~ ^[0-9]+$ || ! "$retry" =~ ^[0-9]+$ ]]; then
    echo "Package lock timeout and retry interval must be whole numbers of seconds." >&2
    return 2
  fi
  timeout=$((10#$timeout))
  retry=$((10#$retry))

  local deadline=$((SECONDS + timeout))
  local remaining status pause log
  log=$(mktemp) || return 1
  trap 'rm -f "$log"' EXIT

  while :; do
    remaining=$((deadline - SECONDS))
    if (( remaining < 0 )); then remaining=0; fi

    # apt waits for the dpkg frontend lock itself. Its lists lock does not
    # support that timeout, so retry only when apt specifically reports a lock.
    if sudo env LC_ALL=C apt-get -o "DPkg::Lock::Timeout=$remaining" "$@" 2>&1 | tee "$log"; then
      return 0
    else
      status=${PIPESTATUS[0]}
    fi
    if (( status == 0 )); then status=1; fi # e.g. tee failed

    # A transient lock warning can precede an unrelated error after apt
    # acquires the lock. Retry only a terminal lock error, not that warning.
    if ! LC_ALL=C grep -Eq '(^|[[:cntrl:]])E: Could not get lock[[:space:]]' "$log"; then
      return "$status"
    fi

    remaining=$((deadline - SECONDS))
    if (( remaining <= 0 )); then
      echo "Timed out waiting for the package manager. Let automatic updates finish, then run setup again." >&2
      return "$status"
    fi
    echo "Another package process is running. Waiting for it to finish..." >&2
    pause=$retry
    if (( pause > remaining )); then pause=$remaining; fi
    if (( pause > 0 )); then sleep "$pause"; fi
  done
)
