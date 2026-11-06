#!/usr/bin/env bash
set -euo pipefail

: "${DSH_TEST_SERVER_URL:?missing test server URL}"
: "${DSH_TEST_LAUNCH_TOKEN:?missing launch token}"

function dump_ui {
  adb exec-out uiautomator dump /dev/tty
}

function require_text {
  local expected="$1"
  if ! dump_ui | grep -Fq "$expected"; then
    printf 'Missing expected UI text: %s\n' "$expected" >&2
    dump_ui | head -80 >&2
    exit 1
  fi
}

function tap_label {
  local label="$1"
  local coordinates
  coordinates=$(python3 - "$label" <<'PY'
import re
import subprocess
import sys

label = sys.argv[1]
xml = subprocess.check_output(
    ["adb", "exec-out", "uiautomator", "dump", "/dev/tty"], text=True
)
pattern = re.compile(
    r'(?:text|content-desc)="'
    + re.escape(label)
    + r'"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
)
matches = list(pattern.finditer(xml))
if not matches:
    raise SystemExit(f"Could not find UI label: {label}")
match = matches[-1]
left, top, right, bottom = (int(value) for value in match.groups())
print(f"{(left + right) // 2} {(top + bottom) // 2}")
PY
)
  adb shell input tap "$coordinates"
}

function launch_app {
  adb shell am start -W -n com.anonymous.dshandroid/.MainActivity >/dev/null
  sleep 3
}

adb wait-for-device
# shellcheck disable=SC2016
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell pm clear com.anonymous.dshandroid
launch_app

require_text "Connect to DSH"
tap_label "DSH server URL"
adb shell input text "$DSH_TEST_SERVER_URL"
tap_label "DSH launch token"
adb shell input text "$DSH_TEST_LAUNCH_TOKEN"
if [[ "$DSH_TEST_SERVER_URL" == http://* ]]; then
  tap_label "Allow HTTP for development"
fi
tap_label "CONNECT"
sleep 5
require_text "DSH Sessions"

if dump_ui | grep -Fq "Initialize default workspace"; then
  tap_label "Initialize default workspace"
  sleep 2
fi

tap_label "New session"
sleep 2
require_text "Message DSH"
tap_label "Message DSH"
adb shell input text 'Reply with ACCEPTANCE_OK only.'
tap_label "Send"

for _ in {1..30}; do
  if dump_ui | grep -Fq "ACCEPTANCE_OK"; then
    break
  fi
  sleep 2
done
require_text "ACCEPTANCE_OK"

adb shell am force-stop com.anonymous.dshandroid
launch_app
require_text "DSH Sessions"

tap_label "Settings"
tap_label "Sign out"
tap_label "Sign out"
require_text "Connect to DSH"
printf 'Real-server acceptance passed\n'
