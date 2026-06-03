#!/usr/bin/env bash
# Build Job Card Capacitor APK (debug by default). Requires JDK 17+ and Android SDK.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  fi
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi

if [[ -z "${JAVA_HOME:-}" ]] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -qE 'version "1[789]|version "[2-9][0-9]'; then
  echo "JDK 17+ required. Install: brew install openjdk@17"
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ANDROID_HOME not set. Install Android Studio and SDK, then export ANDROID_HOME."
  exit 1
fi

# macOS Finder sometimes drops Icon<CR> files into res/ — breaks AAPT.
find "$ROOT/node_modules/@capacitor/android" "$ROOT/android" -name $'Icon\r' -delete 2>/dev/null || true

npm run android:sync

VARIANT="${1:-debug}"
cd android
if [[ "$VARIANT" == "release" ]]; then
  ./gradlew assembleRelease
  echo ""
  echo "Release APK: android/app/build/outputs/apk/release/app-release-unsigned.apk"
else
  ./gradlew assembleDebug
  echo ""
  echo "Debug APK: android/app/build/outputs/apk/debug/app-debug.apk"
fi
