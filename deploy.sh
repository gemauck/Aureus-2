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

# Keep production responsive during deploy builds.
DEPLOY_NICE_LEVEL="${DEPLOY_NICE_LEVEL:-19}"
DEPLOY_IONICE_CLASS="${DEPLOY_IONICE_CLASS:-2}"   # 2 = best-effort
DEPLOY_IONICE_LEVEL="${DEPLOY_IONICE_LEVEL:-7}"   # lowest best-effort priority
DEPLOY_LOW_PRIORITY_APPLIED="${DEPLOY_LOW_PRIORITY_APPLIED:-0}"

if [ "${DISABLE_DEPLOY_NICE:-0}" != "1" ] && [ "${DEPLOY_LOW_PRIORITY_APPLIED}" != "1" ]; then
  export DEPLOY_LOW_PRIORITY_APPLIED=1
  if command -v ionice >/dev/null 2>&1; then
    exec ionice -c "${DEPLOY_IONICE_CLASS}" -n "${DEPLOY_IONICE_LEVEL}" nice -n "${DEPLOY_NICE_LEVEL}" bash "$0" "$@"
  fi
  exec nice -n "${DEPLOY_NICE_LEVEL}" bash "$0" "$@"
fi

APP_DIR="${APP_DIR:-$(pwd)}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-abcotronics-erp}"
MIN_FREE_MB="${MIN_FREE_MB:-4096}"
MIN_FREE_INODES="${MIN_FREE_INODES:-10000}"
PRE_DEPLOY_CLEANUP="${PRE_DEPLOY_CLEANUP:-0}"
RUN_POST_DEPLOY_HEALTH_CHECK="${RUN_POST_DEPLOY_HEALTH_CHECK:-1}"

echo "=== ABCOTRONICS ERP DEPLOY START ==="
echo "App directory     : ${APP_DIR}"
echo "Git branch        : ${GIT_BRANCH}"
echo "PM2 process name  : ${PM2_PROCESS_NAME}"
echo "Node environment  : ${NODE_ENV:-not set}"
echo "===================================="

cd "${APP_DIR}"

check_disk_capacity() {
  local free_mb free_inodes
  free_mb="$(df -Pm "${APP_DIR}" | awk 'NR==2 {print $4}')"
  free_inodes="$(df -Pi "${APP_DIR}" | awk 'NR==2 {print $4}')"

  if [[ -z "${free_mb}" || -z "${free_inodes}" ]]; then
    echo "ERROR: Unable to determine free disk/inode capacity for ${APP_DIR}."
    exit 1
  fi

  echo "-> Capacity check:"
  echo "   Free disk  : ${free_mb} MB (min required: ${MIN_FREE_MB} MB)"
  echo "   Free inodes: ${free_inodes} (min required: ${MIN_FREE_INODES})"

  if (( free_mb < MIN_FREE_MB )); then
    echo "ERROR: Low disk space. Need at least ${MIN_FREE_MB} MB free before deploy."
    exit 1
  fi

  if (( free_inodes < MIN_FREE_INODES )); then
    echo "ERROR: Low free inodes. Need at least ${MIN_FREE_INODES} free before deploy."
    exit 1
  fi
}

run_pre_deploy_cleanup() {
  if [ "$PRE_DEPLOY_CLEANUP" != "1" ]; then
    return 0
  fi

  echo "-> Running pre-deploy maintenance cleanup..."
  if [ -f "${APP_DIR}/scripts/server-maintenance.sh" ]; then
    BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}" APP_DIR="${APP_DIR}" bash "${APP_DIR}/scripts/server-maintenance.sh" || true
  else
    echo "   (maintenance script not found; skipping)"
  fi
}

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is not installed or not in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed or not in PATH."
  exit 1
fi

echo
run_pre_deploy_cleanup

echo
check_disk_capacity

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

if [ -f set-progress-tracker-allowlist.sql ]; then
  echo
  echo "-> Applying migration (Progress Tracker defaults + allowlist)..."
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f set-progress-tracker-allowlist.sql 2>/dev/null && echo "  Done." || echo "  (skipped or failed; check DB)"
  else
    echo "  (psql or DATABASE_URL not available; run set-progress-tracker-allowlist.sql manually)"
  fi
fi

if [ -f backfill-jobcards-started-at.sql ]; then
  echo
  echo "-> Applying migration (backfill JobCard.startedAt from createdAt)..."
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f backfill-jobcards-started-at.sql 2>/dev/null && echo "  Done." || echo "  (skipped or failed; check DB)"
  else
    echo "  (psql or DATABASE_URL not available; run backfill-jobcards-started-at.sql manually)"
  fi
fi

echo
echo "-> Restarting process manager..."
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_PROCESS_NAME}" >/dev/null 2>&1; then
    if pm2 reload "${PM2_PROCESS_NAME}" --update-env; then
      echo "  ✓ PM2 reload completed"
    else
      echo "  (reload failed, falling back to restart)"
      pm2 restart "${PM2_PROCESS_NAME}" --update-env
    fi
  else
    echo "  (no existing PM2 process named '${PM2_PROCESS_NAME}'; starting fresh)"
    if [ -f "${APP_DIR}/ecosystem.config.js" ]; then
      pm2 start "${APP_DIR}/ecosystem.config.js" --update-env
    else
      pm2 start "${APP_DIR}/server.js" --name "${PM2_PROCESS_NAME}" --update-env
    fi
  fi
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

if [ "${RUN_POST_DEPLOY_HEALTH_CHECK}" = "1" ] && [ -f "${APP_DIR}/scripts/post-deploy-health-check.sh" ]; then
  echo
  echo "-> Running post-deploy health check..."
  PM2_PROCESS_NAME="${PM2_PROCESS_NAME}" APP_URL="${APP_URL:-http://127.0.0.1:3000}" bash "${APP_DIR}/scripts/post-deploy-health-check.sh"
fi

echo
echo "=== ABCOTRONICS ERP DEPLOY COMPLETE ==="


