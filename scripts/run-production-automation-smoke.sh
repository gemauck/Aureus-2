#!/usr/bin/env bash
# Run full production automation smoke: create temp user on server, then API + browser tests locally.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEPLOY_HOST="${DEPLOY_HOST:-abco-prod}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/abcotronics-erp}"
APP_URL="${APP_URL:-https://abcoafrica.co.za}"

echo "== Production automation smoke =="
echo "Server: ${DEPLOY_HOST}:${DEPLOY_PATH}"
echo "Target: ${APP_URL}"
echo ""

echo "-> Syncing latest scripts on server..."
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && git fetch origin main && git reset --hard origin/main && (pm2 restart abcotronics-erp 2>/dev/null || pm2 restart all 2>/dev/null || true)" >/dev/null
sleep 3

echo "-> Ensuring automation smoke user on production DB..."
CREDS_JSON="$(ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && node scripts/ensure-automation-smoke-user.mjs 2>/dev/null | tail -1")"
TEST_EMAIL="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.email||'')" "$CREDS_JSON")"
TEST_PASSWORD="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.password||'')" "$CREDS_JSON")"

if [[ -z "$TEST_EMAIL" || -z "$TEST_PASSWORD" ]]; then
  echo "ERROR: could not parse automation credentials from server"
  exit 1
fi
echo "   Using automation account: ${TEST_EMAIL}"

export APP_URL TEST_EMAIL TEST_PASSWORD

echo ""
echo "-> Public / OTA smoke..."
npm run smoke:production

echo ""
echo "-> ERP shell browser smoke..."
npm run smoke:production:ui

echo ""
echo "-> Stock-take API smoke (mobile parity)..."
node scripts/post-deploy-stock-take-api-smoke.mjs

echo ""
echo "-> Manufacturing API integration..."
node tests/manufacturing-api-integration-tests.js

echo ""
echo "✅ Production automation smoke complete."
