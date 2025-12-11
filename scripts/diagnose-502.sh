#!/usr/bin/env bash

# 502 Bad Gateway end-to-end diagnostic and repair helper
# - SSHes into the droplet from your local machine (reads .droplet_ip)
# - Checks Nginx status and error logs
# - Detects proxy_pass upstream and validates the upstream app
# - Tries safe repairs: restart app, reload Nginx
# - Optional auto-fix: if proxy_pass port mismatches the actual listening port, update site config

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()  { echo -e "${GREEN}✔${NC} $*"; }
warn(){ echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✖${NC} $*"; }

AUTO_FIX=${AUTO_FIX:-1}   # set to 0 to disable config edits
SITE_DOMAIN=${SITE_DOMAIN:-abcoafrica.co.za}

if [ ! -f .droplet_ip ]; then
  err ".droplet_ip not found. Create it with your server's public IP (single line)."
  exit 1
fi
DROPLET_IP=$(cat .droplet_ip | tr -d ' \t\r')
log "Target droplet: ${DROPLET_IP}"

# Allow overriding SSH user (some images use 'ubuntu' or 'deploy')
SSH_USER=${SSH_USER:-root}
SSH="ssh -o StrictHostKeyChecking=no ${SSH_USER}@${DROPLET_IP}"

log "Checking Nginx status and recent errors..."
$SSH "set -e; \
  systemctl is-active --quiet nginx && echo ACTIVE || echo INACTIVE; \
  echo '--- error.log tail ---'; \
  tail -n 80 /var/log/nginx/error.log 2>/dev/null || true"

log "Locating server block and proxy_pass..."
SITE_FILE=$($SSH "bash -lc 'grep -R -l "server_name\\s\+${SITE_DOMAIN}\\b" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null | head -n1 || true'")
if [ -z "${SITE_FILE}" ]; then
  warn "No Nginx server block found for ${SITE_DOMAIN}. Using first enabled site."
  SITE_FILE=$($SSH "bash -lc 'ls -1 /etc/nginx/sites-enabled/* 2>/dev/null | head -n1 || true'")
fi
if [ -z "${SITE_FILE}" ]; then
  err "Could not find any Nginx site configuration."
  exit 1
fi
ok "Using site config: ${SITE_FILE}"

PROXY_LINE=$($SSH "bash -lc 'grep -nE "proxy_pass\\s+http" ${SITE_FILE} | head -n1 || true'")
UPSTREAM_HOST="127.0.0.1"
UPSTREAM_PORT=""
if [ -n "${PROXY_LINE}" ]; then
  echo "${PROXY_LINE}" | awk -F: '{print "line:"$1" text:"substr($0,index($0,$3))}'
  RAW_URL=$($SSH "bash -lc 'awk \"/proxy_pass/{print \$2}\" ${SITE_FILE} | sed -n 1p | tr -d \";\"'" )
  # Expect http://host:port or http://unix:socket
  if [[ "${RAW_URL}" =~ ^http://([^:/]+):(.*)$ ]]; then
    UPSTREAM_HOST="${BASH_REMATCH[1]}"
    UPSTREAM_PORT="${BASH_REMATCH[2]}"
  elif [[ "${RAW_URL}" =~ ^http://([^/]+)$ ]]; then
    UPSTREAM_HOST="${BASH_REMATCH[1]}"; UPSTREAM_PORT="80"
  fi
fi

if [ -z "${UPSTREAM_PORT}" ]; then
  warn "Could not parse proxy_pass port; defaulting to 3000"
  UPSTREAM_PORT=3000
fi
ok "Detected upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT}"

log "Checking listening processes for likely Node/Express ports..."
LISTEN=$($SSH "bash -lc 'ss -lntp | awk \"/:(3000|4000|8080|9000) /{print}\" || true'" )
echo "${LISTEN}"

log "Testing upstream locally via curl..."
UPSTREAM_CURL=$($SSH "bash -lc 'curl -sS -m 5 -H \"Host: ${SITE_DOMAIN}\" http://${UPSTREAM_HOST}:${UPSTREAM_PORT}/ | head -c 200 || true'" )
if [ -n "${UPSTREAM_CURL}" ]; then
  ok "Upstream responded (truncated): ${UPSTREAM_CURL}"
else
  warn "No response from upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT}. Attempting to restart app."
  $SSH "bash -lc 'pm2 ls >/dev/null 2>&1 && pm2 restart all || true; \
                 systemctl list-units --type=service --no-pager | grep -iE \"\\(node\\|app\\|erp\\)\\.service\" || true; \
                 for svc in erp app node; do systemctl restart \"\$svc\" 2>/dev/null || true; done; \
                 sleep 3'"
  # retry
  UPSTREAM_CURL=$($SSH "bash -lc 'curl -sS -m 5 -H \"Host: ${SITE_DOMAIN}\" http://${UPSTREAM_HOST}:${UPSTREAM_PORT}/ | head -c 200 || true'" )
  if [ -n "${UPSTREAM_CURL}" ]; then
    ok "Upstream responded after restart."
  else
    warn "Still no response from ${UPSTREAM_HOST}:${UPSTREAM_PORT}."
  fi
fi

log "Checking for port mismatch between proxy_pass and actual listeners..."
LISTEN_PORTS=$($SSH "bash -lc 'ss -lnt | awk \"{print \$4}\" | sed -n \"s/.*:\\\\(\\\\d\\\\+\\\\)/\\1/p\" | sort -u'" )
if ! echo "${LISTEN_PORTS}" | grep -q "^${UPSTREAM_PORT}$"; then
  warn "proxy_pass points to ${UPSTREAM_PORT}, but that port is not listening."
  NEW_PORT=$($SSH "bash -lc 'ss -lnt | awk \"/:(3000|4000|8080|9000) /{print}\" | awk -F: \"{print \\\$NF}\" | head -n1 || true'" )
  if [ -n "${NEW_PORT}" ] && [ "${AUTO_FIX}" = "1" ]; then
    warn "Auto-fixing site config to use port ${NEW_PORT} (was ${UPSTREAM_PORT})."
    $SSH "bash -lc 'cp -n ${SITE_FILE} ${SITE_FILE}.bak.$(date +%Y%m%d%H%M%S); \
                   sed -i \"s#proxy_pass\\s\+http://[^;]*#proxy_pass http://127.0.0.1:${NEW_PORT}#\" ${SITE_FILE}; \
                   nginx -t && systemctl reload nginx'"
    ok "Updated proxy_pass and reloaded Nginx."
  else
    warn "Detected mismatch but did not auto-fix (AUTO_FIX=${AUTO_FIX})."
  fi
else
  ok "proxy_pass port ${UPSTREAM_PORT} is listening."
fi

log "Final Nginx test and summary..."
$SSH "bash -lc 'nginx -t && systemctl status nginx --no-pager | sed -n \"1,12p\"'"

echo
echo "=================================================="
echo -e "${GREEN}Diagnostics complete.${NC} Key items:"
echo "- Site config: ${SITE_FILE}"
echo "- proxy_pass: ${UPSTREAM_HOST}:${UPSTREAM_PORT} (auto-fix=${AUTO_FIX})"
echo "- If 502 persists, re-check error.log and app logs (pm2 logs --lines 100)."
echo "- Re-run with AUTO_FIX=0 to disable edits: AUTO_FIX=0 ./scripts/diagnose-502.sh"
echo "=================================================="


