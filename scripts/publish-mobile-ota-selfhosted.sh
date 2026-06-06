#!/usr/bin/env bash
# Publish a self-hosted JS OTA bundle to public/mobile-ota/updates/ (no Expo account).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RN="$ROOT/mobile-rn"
STAMP="$(date +%s)"
TMP="$(mktemp -d)"
RETAIN="${MOBILE_OTA_RETAIN:-10}"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

read_runtime() {
  if [[ -n "${MOBILE_OTA_RUNTIME:-}" ]]; then
    echo "$MOBILE_OTA_RUNTIME"
    return
  fi
  node -e "
    const c = require('${RN}/app.config.js');
    const rv = c?.expo?.runtimeVersion || c?.expo?.extra?.runtimeVersion;
    if (!rv) process.exit(1);
    process.stdout.write(String(rv));
  "
}

RUNTIME="$(read_runtime)"
DEST="$ROOT/public/mobile-ota/updates/$RUNTIME/$STAMP"

cd "$RN"
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://abcoafrica.co.za}"

if [[ ! -d node_modules/expo ]]; then
  echo "Installing mobile-rn dependencies for OTA export…"
  npm install --include=dev
fi

echo "Exporting Android JS bundle (runtime: $RUNTIME)…"
npx expo export --platform android --output-dir "$TMP/export"

echo "Writing expoConfig.json…"
npx expo config --type public --json 2>/dev/null > "$TMP/export/expoConfig.json"

mkdir -p "$DEST"
cp -R "$TMP/export/." "$DEST/"

RUNTIME_DIR="$ROOT/public/mobile-ota/updates/$RUNTIME"
if [[ -d "$RUNTIME_DIR" ]]; then
  dirs=()
  while IFS= read -r d; do
    [[ -n "$d" ]] && dirs+=("$d")
  done < <(find "$RUNTIME_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
  remove_count=$((${#dirs[@]} - RETAIN))
  if (( remove_count > 0 )); then
    echo "Pruning $remove_count old OTA bundle(s) (keeping latest $RETAIN)…"
    for ((i = 0; i < remove_count; i++)); do
      rm -rf "${dirs[$i]}"
    done
  fi
fi

echo ""
echo "✓ OTA bundle published:"
echo "  Runtime:  $RUNTIME"
echo "  Folder:   public/mobile-ota/updates/$RUNTIME/$STAMP"
echo "  Manifest: ${EXPO_PUBLIC_API_BASE_URL}/api/public/mobile-ota/manifest"
echo ""
echo "Devices on runtime $RUNTIME will pick this up automatically on next launch or foreground."
