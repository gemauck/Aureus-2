#!/usr/bin/env bash
# Build Abcotronics ERP React Native debug APK (Path B job cards app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RN="$ROOT/mobile-rn"

if [[ -z "${JAVA_HOME:-}" ]] && [[ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
fi
if [[ -z "${ANDROID_HOME:-}" ]] && [[ -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

cd "$RN"
npm install

if [[ ! -d android ]]; then
  npx expo prebuild --platform android --no-install
fi

COLORS="$RN/android/app/src/main/res/values/colors.xml"
if ! grep -q splashscreen_background "$COLORS" 2>/dev/null; then
  sed -i '' 's|</resources>|  <color name="splashscreen_background">#0284c7</color>\n</resources>|' "$COLORS" 2>/dev/null \
    || sed -i 's|</resources>|  <color name="splashscreen_background">#0284c7</color>\n</resources>|' "$COLORS"
fi

find "$RN/node_modules" "$RN/android" -name $'Icon\r' -delete 2>/dev/null || true

cd "$RN/android"
chmod +x ./gradlew
./gradlew assembleDebug

APK="$RN/android/app/build/outputs/apk/debug/app-debug.apk"
DEST="${1:-$HOME/Desktop/Abcotronics-ERP-Mobile-debug.apk}"
cp "$APK" "$DEST"
echo ""
echo "APK: $DEST"
