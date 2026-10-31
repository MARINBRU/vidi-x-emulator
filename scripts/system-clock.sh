#!/usr/bin/env bash
# Try to synchronize time before apt validates signed repository metadata.
# Never disable apt's date/signature checks or set a clock from untrusted data.

vidix_sync_system_clock() {
  local synced timeout elapsed
  if ! command -v timedatectl >/dev/null 2>&1; then
    echo "Automatic clock synchronization is unavailable; apt will check repository dates." >&2
    return 0
  fi
  if ! synced=$(timedatectl show --property=NTPSynchronized --value 2>/dev/null); then
    echo "Could not inspect the system clock; apt will check repository dates." >&2
    return 0
  fi
  if [[ "$synced" == "yes" ]]; then
    echo "System clock is synchronized."
    return 0
  fi

  timeout="${VIDIX_CLOCK_SYNC_TIMEOUT_SECONDS:-20}"
  if [[ ! "$timeout" =~ ^[0-9]+$ ]]; then
    echo "Clock synchronization timeout must be a whole number of seconds." >&2
    return 2
  fi
  timeout=$((10#$timeout))

  echo "System clock is not synchronized. Enabling network time..."
  if ! sudo timedatectl set-ntp true; then
    echo "Could not enable network time; apt will check repository dates." >&2
    return 0
  fi
  for ((elapsed = 0; ; elapsed++)); do
    if synced=$(timedatectl show --property=NTPSynchronized --value 2>/dev/null) && [[ "$synced" == "yes" ]]; then
      echo "System clock is synchronized."
      return 0
    fi
    if (( elapsed >= timeout )); then break; fi
    sleep 1
  done

  # Lack of NTP does not prove the clock is wrong. Let apt decide.
  echo "Network time has not synchronized yet. Continuing; apt will check repository dates." >&2
}
