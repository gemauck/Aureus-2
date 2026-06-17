#!/usr/bin/env bash
# Build standalone Abcotronics ERP React Native APK (JS bundle embedded; no Metro required).
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

if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  cp .env.example .env
fi

if [[ ! -d android ]]; then
  npx expo prebuild --platform android --no-install
fi

find "$RN/node_modules" "$RN/android" -name $'Icon\r' -delete 2>/dev/null || true

# Bake API URL into the release bundle (Expo inlines EXPO_PUBLIC_* at bundle time).
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://abcoafrica.co.za}"
echo "API base for bundle: $EXPO_PUBLIC_API_BASE_URL"
echo "OTA manifest: ${EXPO_PUBLIC_API_BASE_URL}/api/public/mobile-ota/manifest"

cd "$RN"
npx expo prebuild --platform android --no-install

# react-native-webrtc requires Android API 24+
GRADLE_PROPS="$RN/android/gradle.properties"
if ! grep -q '^android.minSdkVersion=24' "$GRADLE_PROPS" 2>/dev/null; then
  echo 'android.minSdkVersion=24' >> "$GRADLE_PROPS"
fi
ROOT_GRADLE="$RN/android/build.gradle"
if [[ -f "$ROOT_GRADLE" ]]; then
  sed -i '' "s|findProperty('android.minSdkVersion') ?: '23'|findProperty('android.minSdkVersion') ?: '24'|" "$ROOT_GRADLE" 2>/dev/null \
    || sed -i "s|findProperty('android.minSdkVersion') ?: '23'|findProperty('android.minSdkVersion') ?: '24'|" "$ROOT_GRADLE"
fi

# Phone ABIs only — skip x86/x86_64 emulator slices in standalone APKs.
PHONE_ABIS='armeabi-v7a,arm64-v8a'
if grep -q '^reactNativeArchitectures=' "$GRADLE_PROPS" 2>/dev/null; then
  sed -i '' "s|^reactNativeArchitectures=.*|reactNativeArchitectures=$PHONE_ABIS|" "$GRADLE_PROPS" 2>/dev/null \
    || sed -i "s|^reactNativeArchitectures=.*|reactNativeArchitectures=$PHONE_ABIS|" "$GRADLE_PROPS"
else
  echo "reactNativeArchitectures=$PHONE_ABIS" >> "$GRADLE_PROPS"
fi

APP_GRADLE="$RN/android/app/build.gradle"
if ! grep -q 'abiFilters' "$APP_GRADLE" 2>/dev/null; then
  sed -i '' '/versionName /a\
        ndk {\
            abiFilters "arm64-v8a", "armeabi-v7a"\
        }
' "$APP_GRADLE" 2>/dev/null \
    || sed -i '/versionName /a\        ndk {\n            abiFilters "arm64-v8a", "armeabi-v7a"\n        }' "$APP_GRADLE"
fi

COLORS="$RN/android/app/src/main/res/values/colors.xml"
if ! grep -q splashscreen_background "$COLORS" 2>/dev/null; then
  sed -i '' 's|</resources>|  <color name="splashscreen_background">#1d4ed8</color>\n</resources>|' "$COLORS" 2>/dev/null \
    || sed -i 's|</resources>|  <color name="splashscreen_background">#1d4ed8</color>\n</resources>|' "$COLORS"
fi

cd "$RN/android"
chmod +x ./gradlew
# Release embeds the JS bundle; debug APK expects Metro on localhost:8081.
./gradlew assembleRelease -PEXPO_PUBLIC_API_BASE_URL="$EXPO_PUBLIC_API_BASE_URL"

APK="$RN/android/app/build/outputs/apk/release/app-release.apk"
DEST="${1:-$HOME/Desktop/Abcotronics-ERP-Mobile.apk}"
cp "$APK" "$DEST"
echo ""
echo "Standalone APK (no Metro): $DEST"
