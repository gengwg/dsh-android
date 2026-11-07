#!/usr/bin/env bash
set -euo pipefail

: "${DSH_TEST_SERVER_URL:?missing test server URL}"
: "${DSH_TEST_LAUNCH_TOKEN:?missing launch token}"

if [[ ! "$DSH_TEST_LAUNCH_TOKEN" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Launch token does not match the app-supported format\n' >&2
  exit 1
fi

connect_url="${DSH_TEST_SERVER_URL%/}/connect?token=${DSH_TEST_LAUNCH_TOKEN}&interactions=answer"
set +e
http_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --connect-timeout 10 --max-time 20 \
  --header "Origin: ${DSH_TEST_SERVER_URL%/}" "$connect_url")"
curl_status=$?
set -e
printf 'Bootstrap preflight: curl=%d HTTP=%s\n' "$curl_status" "$http_code"
if [[ "$curl_status" -ne 0 || "$http_code" != 302 ]]; then
  exit 1
fi

function dump_ui {
  adb exec-out uiautomator dump /dev/tty
}

function redact_ui {
  python3 -c '
import html
import os
import sys

xml = sys.stdin.read()
for name in ("DSH_TEST_SERVER_URL", "DSH_TEST_LAUNCH_TOKEN"):
    value = os.environ.get(name, "")
    if value:
        xml = xml.replace(html.escape(value, quote=True), "[redacted]")
        xml = xml.replace(value, "[redacted]")
sys.stdout.write(xml)
'
}

function dump_crash_diagnostics {
  adb logcat -d -s AndroidRuntime:E ReactNativeJS:E |
    redact_ui |
    grep -Ei 'AndroidRuntime:|ReactNativeJS:|FATAL|EXCEPTION|ERROR|Caused by|^[[:space:]]+at ' |
    grep -Eiv 'cookie|authorization|token=|https?://' |
    tail -100 >&2 || true
}

function require_text {
  local expected="$1"
  if ! dump_ui | grep -Fq "$expected"; then
    printf 'Missing expected UI text: %s\n' "$expected" >&2
    dump_ui | redact_ui | head -80 >&2
    dump_crash_diagnostics
    exit 1
  fi
}

function wait_for_text {
  local expected="$1"
  local ui
  for _ in {1..30}; do
    ui="$(dump_ui)"
    if grep -Fq "$expected" <<< "$ui"; then
      return 0
    fi
    if grep -Fq "Quickstep isn't responding" <<< "$ui"; then
      tap_label "Wait"
      launch_app
    fi
    sleep 2
  done
  require_text "$expected"
}

function tap_label {
  local label="$1"
  local coordinates
  for _ in {1..30}; do
    if coordinates="$(python3 - "$label" 2>/dev/null <<'PY'
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
    raise SystemExit(1)
match = matches[-1]
left, top, right, bottom = (int(value) for value in match.groups())
print(f"{(left + right) // 2} {(top + bottom) // 2}")
PY
)"; then
      adb shell input tap "$coordinates"
      return 0
    fi
    sleep 2
  done
  printf 'Could not find UI label: %s\n' "$label" >&2
  return 1
}

function launch_app {
  adb shell am start -W -n com.anonymous.dshandroid/.MainActivity >/dev/null
}

adb wait-for-device
# shellcheck disable=SC2016
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell pm clear com.anonymous.dshandroid
adb logcat -c
launch_app

wait_for_text "Connect to DSH"
tap_label "DSH server URL"
adb shell input text "$DSH_TEST_SERVER_URL"
adb shell input keyevent KEYCODE_BACK
tap_label "DSH launch token"
adb shell input text "$DSH_TEST_LAUNCH_TOKEN"
adb shell input keyevent KEYCODE_BACK
if [[ "$DSH_TEST_SERVER_URL" == http://* ]]; then
  tap_label "Allow HTTP for development"
fi
tap_label "CONNECT"
wait_for_text "DSH Sessions"

if dump_ui | grep -Fq "INITIALIZE DEFAULT WORKSPACE"; then
  tap_label "INITIALIZE DEFAULT WORKSPACE"
  wait_for_text "NEW SESSION"
fi

tap_label "NEW SESSION"
wait_for_text "Message DSH"
tap_label "Message DSH"
adb shell input text 'Join ACCEPTANCE and OK with an underscore. Reply with that value only.'
adb shell input keyevent KEYCODE_BACK
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
wait_for_text "DSH Sessions"

tap_label "Settings"
tap_label "Sign out"
tap_label "Sign out"
wait_for_text "Connect to DSH"
printf 'Real-server acceptance passed\n'
