#!/usr/bin/env bash
# Publish a self-hosted JS OTA bundle to public/mobile-ota/updates/ (no Expo account).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RN="$ROOT/mobile-rn"
RUNTIME="${MOBILE_OTA_RUNTIME:-erp-mobile-1}"
STAMP="$(date +%s)"
DEST="$ROOT/public/mobile-ota/updates/$RUNTIME/$STAMP"
TMP="$(mktemp -d)"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

cd "$RN"
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://abcoafrica.co.za}"

echo "Exporting Android JS bundle…"
npx expo export --platform android --output-dir "$TMP/export"

echo "Writing expoConfig.json…"
npx expo config --type public --json 2>/dev/null > "$TMP/export/expoConfig.json"

mkdir -p "$DEST"
cp -R "$TMP/export/." "$DEST/"

echo ""
echo "✓ OTA bundle published:"
echo "  Runtime:  $RUNTIME"
echo "  Folder:   public/mobile-ota/updates/$RUNTIME/$STAMP"
echo ""
echo "Deploy the server (git pull + restart) so devices can fetch the update."
echo "Apps must be built with updates.url → https://abcoafrica.co.za/api/public/mobile-ota/manifest"
