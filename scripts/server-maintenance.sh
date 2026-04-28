#!/usr/bin/env bash
set -euo pipefail

# Lightweight server maintenance to prevent disk pressure from logs/caches/backups.
# Intended for cron usage on production hosts.

APP_DIR="${APP_DIR:-/var/www/abcotronics-erp}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/database-backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-abcotronics-erp}"

echo "== Server maintenance start =="
echo "App dir: ${APP_DIR}"
date -u +"UTC: %Y-%m-%d %H:%M:%S"

if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
fi

echo "-> Before"
df -h /

if command -v pm2 >/dev/null 2>&1; then
  echo "-> PM2 log flush"
  pm2 flush || true
  pm2 save || true
fi

if command -v npm >/dev/null 2>&1; then
  echo "-> NPM cache cleanup"
  npm cache clean --force || true
fi

echo "-> Removing transient npm caches"
rm -rf /root/.npm/_cacache /root/.npm/_npx 2>/dev/null || true
rm -rf "${HOME}/.npm/_cacache" "${HOME}/.npm/_npx" 2>/dev/null || true

if [ -d "$BACKUP_DIR" ]; then
  if [[ "$BACKUP_RETENTION_COUNT" =~ ^[0-9]+$ ]] && [ "$BACKUP_RETENTION_COUNT" -ge 1 ]; then
    echo "-> Pruning DB backups (keep ${BACKUP_RETENTION_COUNT})"
    ls -1t "${BACKUP_DIR}"/backup_* 2>/dev/null | tail -n +"$((BACKUP_RETENTION_COUNT + 1))" | while IFS= read -r old_file; do
      [ -n "$old_file" ] || continue
      rm -f "$old_file" || true
    done
  fi
fi

echo "-> After"
df -h /
echo "== Server maintenance complete =="
