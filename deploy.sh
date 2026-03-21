#!/usr/bin/env bash

###############################################################################
# ABCOTRONICS ERP - Simple Deployment Script
#
# Usage (on the server):
#   cd /var/www/abcotronics-erp-modular   # or your actual deploy path
#   chmod +x deploy.sh                    # first time only
#   ./deploy.sh
#
# What it does:
#   1) Fetches and resets to origin/<branch> (server always matches remote; no merge)
#   2) Installs production dependencies
#   3) Builds the app
#   4) Applies DB migrations (if any)
#   5) Restarts the PM2 process
#
# Release summary (in-app “update available” banner):
#   Set RELEASE_SUMMARY before running this script to override. Otherwise the server
#   exports RELEASE_SUMMARY from the latest git commit subject (same default as build-jsx).
###############################################################################

set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-abcotronics-erp}"

echo "=== ABCOTRONICS ERP DEPLOY START ==="
echo "App directory     : ${APP_DIR}"
echo "Git branch        : ${GIT_BRANCH}"
echo "PM2 process name  : ${PM2_PROCESS_NAME}"
echo "Node environment  : ${NODE_ENV:-not set}"
echo "===================================="

cd "${APP_DIR}"

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is not installed or not in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed or not in PATH."
  exit 1
fi

echo
echo "-> Syncing to origin/${GIT_BRANCH} (fetch + reset --hard)..."
# Prune stale refs to avoid "cannot lock ref" / inconsistent ref errors
git fetch origin --prune "${GIT_BRANCH}" 2>/dev/null || {
  echo "  (fetch with prune failed, retrying after clearing stale ref)..."
  git update-ref -d "refs/remotes/origin/${GIT_BRANCH}" 2>/dev/null || true
  git fetch origin --prune "${GIT_BRANCH}" || { echo "ERROR: git fetch failed."; exit 1; }
}
if ! git rev-parse --verify "origin/${GIT_BRANCH}" >/dev/null 2>&1; then
  echo "ERROR: origin/${GIT_BRANCH} not found after fetch."
  exit 1
fi
git reset --hard "origin/${GIT_BRANCH}"

echo
echo "-> Installing dependencies (including dev, needed for build)..."
# We install full dependencies because build tools (like Tailwind, bundlers, etc.)
# are typically in devDependencies but are required at build time. Using NODE_ENV=production
# here would cause npm to skip devDependencies, so we explicitly install with dev deps included.
npm install --include=dev

echo
echo "-> Building application..."
# Embed deploy summary for /version + dist/build-version.json (override with RELEASE_SUMMARY=... deploy.sh)
if [ -z "${RELEASE_SUMMARY:-}" ] && [ -z "${DEPLOY_SUMMARY:-}" ]; then
  export RELEASE_SUMMARY="$(git log -1 --pretty=%s 2>/dev/null || true)"
  if [ -n "${RELEASE_SUMMARY}" ]; then
    echo "  (RELEASE_SUMMARY from git: ${RELEASE_SUMMARY})"
  fi
fi
npm run build

# Ensure Vite projects bundle exists (avoids 502 on /vite-projects/projects-module.js)
if [ ! -f "${APP_DIR}/dist/vite-projects/projects-module.js" ]; then
  echo "ERROR: dist/vite-projects/projects-module.js missing after build. Run: npm run build:vite-projects"
  exit 1
fi
echo "  ✓ Vite projects bundle present"

echo
echo "-> Applying database schema updates (if any)..."
if [ -f scripts/safe-db-migration.sh ]; then
  NON_INTERACTIVE=1 bash scripts/safe-db-migration.sh npx prisma db push 2>/dev/null || echo "  (schema already up to date or DB not configured)"
else
  npx prisma db push 2>/dev/null || echo "  (schema already up to date or DB not configured)"
fi

if [ -f add-document-request-email-received-migration.sql ]; then
  echo
  echo "-> Applying manual SQL migration (DocumentRequestEmailReceived)..."
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f add-document-request-email-received-migration.sql 2>/dev/null || echo "  (already applied or skipped)"
  else
    echo "  (psql or DATABASE_URL not available; run the SQL migration manually)"
  fi
fi

if [ -f add-engagement-stage-aida-status-migration.sql ]; then
  echo
  echo "-> Applying manual SQL migration (engagementStage/aidaStatus on Client, ClientSite, Opportunity)..."
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f add-engagement-stage-aida-status-migration.sql 2>/dev/null || echo "  (already applied or skipped)"
  else
    echo "  (psql or DATABASE_URL not available; run add-engagement-stage-aida-status-migration.sql manually)"
  fi
fi

if [ -f migrate-remove-on-hold-qualified-engagement.sql ]; then
  echo
  echo "-> Applying migration (set On Hold/Qualified/Inactive engagement stage to Potential)..."
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f migrate-remove-on-hold-qualified-engagement.sql 2>/dev/null && echo "  Done." || echo "  (skipped or already applied)"
  fi
fi

echo
echo "-> Restarting process manager..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "${PM2_PROCESS_NAME}" --update-env || {
    echo "WARNING: pm2 restart failed. Check that the process name '${PM2_PROCESS_NAME}' is correct."
    exit 1
  }
  pm2 save 2>/dev/null || true
else
  echo "NOTE: pm2 not found. If you use systemd, try:"
  echo "  sudo systemctl restart abcotronics-erp.service"
fi

echo
echo "-> Reloading nginx..."
if command -v nginx >/dev/null 2>&1; then
  nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || true
elif systemctl is-active nginx >/dev/null 2>&1; then
  systemctl reload nginx 2>/dev/null || true
fi

echo
echo "=== ABCOTRONICS ERP DEPLOY COMPLETE ==="


