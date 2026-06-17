#!/usr/bin/env bash
# Upload a release APK to production downloads (replaces Abcotronics-ERP-Mobile.apk).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${1:-$HOME/Desktop/Abcotronics-ERP-Mobile.apk}"
DEPLOY_HOST="${DEPLOY_HOST:-abco-prod}"
REMOTE_DIR="/var/www/abcotronics-erp/public/downloads"
REMOTE_NAME="Abcotronics-ERP-Mobile.apk"

if [[ ! -f "$APK" ]]; then
  echo "ERROR: APK not found: $APK"
  echo "Build first: npm run mobile:apk"
  exit 1
fi

echo "Uploading $(basename "$APK") ($(du -h "$APK" | awk '{print $1}')) to ${DEPLOY_HOST}:${REMOTE_DIR}/${REMOTE_NAME}"
scp "$APK" "${DEPLOY_HOST}:${REMOTE_DIR}/${REMOTE_NAME}.new"
ssh "$DEPLOY_HOST" "mv -f '${REMOTE_DIR}/${REMOTE_NAME}.new' '${REMOTE_DIR}/${REMOTE_NAME}' && ls -la '${REMOTE_DIR}/${REMOTE_NAME}'"
echo "✓ Production APK updated"
