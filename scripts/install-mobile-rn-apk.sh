#!/usr/bin/env bash
# Install Abcotronics ERP React Native release APK via adb (USB or emulator).
set -euo pipefail

APK="${1:-$HOME/Desktop/Abcotronics-ERP-Mobile.apk}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform-tools or add ANDROID_HOME/platform-tools to PATH." >&2
  exit 1
fi

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  echo "Build first: npm run mobile:apk" >&2
  exit 1
fi

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" { print $1 }')"
if [[ -z "$DEVICES" ]]; then
  echo "No Android device/emulator connected. Plug in USB (with debugging) or start an emulator." >&2
  adb devices
  exit 1
fi

echo "Installing to: $(echo "$DEVICES" | tr '\n' ' ' | sed 's/ $//')"
adb install -r "$APK"
echo "Installed: $APK"
