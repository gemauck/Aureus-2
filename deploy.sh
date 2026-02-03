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
#   1) Pulls latest code from origin/main
#   2) Installs production dependencies
#   3) Builds the app
#   4) Restarts the PM2 process (or prints a hint for systemd)
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
echo "-> Pulling latest code from origin/${GIT_BRANCH}..."
git fetch origin "${GIT_BRANCH}"
git pull origin "${GIT_BRANCH}"

echo
echo "-> Installing dependencies (including dev, needed for build)..."
# We install full dependencies because build tools (like Tailwind, bundlers, etc.)
# are typically in devDependencies but are required at build time. Using NODE_ENV=production
# here would cause npm to skip devDependencies, so we explicitly install with dev deps included.
npm install --include=dev

echo
echo "-> Building application..."
npm run build

echo
echo "-> Applying database schema updates (if any)..."
if [ -f scripts/safe-db-migration.sh ]; then
  NON_INTERACTIVE=1 bash scripts/safe-db-migration.sh npx prisma db push 2>/dev/null || echo "  (schema already up to date or DB not configured)"
else
  npx prisma db push 2>/dev/null || echo "  (schema already up to date or DB not configured)"
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


