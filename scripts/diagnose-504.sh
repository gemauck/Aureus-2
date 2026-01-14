#!/usr/bin/env bash

# 504 Gateway Timeout diagnostic and repair helper
# - SSHes into the droplet from your local machine (reads .droplet_ip)
# - Checks Nginx timeout settings
# - Tests upstream response times
# - Checks for slow operations in app logs
# - Monitors system resources
# - Optional auto-fix: increases nginx timeouts for long-running operations

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()  { echo -e "${GREEN}✔${NC} $*"; }
warn(){ echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✖${NC} $*"; }
info(){ echo -e "${CYAN}ℹ${NC} $*"; }

AUTO_FIX=${AUTO_FIX:-1}   # set to 0 to disable config edits
SITE_DOMAIN=${SITE_DOMAIN:-abcoafrica.co.za}
TIMEOUT_TEST_SECONDS=${TIMEOUT_TEST_SECONDS:-70}  # Test with timeout slightly above default

if [ ! -f .droplet_ip ]; then
  err ".droplet_ip not found. Create it with your server's public IP (single line)."
  exit 1
fi
DROPLET_IP=$(cat .droplet_ip | tr -d ' \t\r')
log "Target droplet: ${DROPLET_IP}"

# Allow overriding SSH user (some images use 'ubuntu' or 'deploy')
SSH_USER=${SSH_USER:-root}
SSH="ssh -o StrictHostKeyChecking=no ${SSH_USER}@${DROPLET_IP}"

echo
echo "=================================================="
echo -e "${CYAN}504 Gateway Timeout Diagnostic${NC}"
echo "=================================================="
echo

log "Checking Nginx status and recent 504 errors..."
NGINX_STATUS=$($SSH "set -e; systemctl is-active --quiet nginx && echo ACTIVE || echo INACTIVE")
echo "Nginx status: ${NGINX_STATUS}"

log "Scanning for 504 errors in nginx logs..."
$SSH "set -e; \
  echo '--- Recent 504 errors (last 50 lines) ---'; \
  grep -i '504\|timeout' /var/log/nginx/error.log 2>/dev/null | tail -n 20 || echo 'No 504 errors found in error.log'; \
  echo ''; \
  echo '--- Recent access log entries with 504 ---'; \
  grep ' 504 ' /var/log/nginx/access.log 2>/dev/null | tail -n 10 || echo 'No 504 in access.log'"

log "Locating server block and checking timeout settings..."
SITE_FILE=$($SSH "bash -lc 'grep -R -l \"server_name\\s\+${SITE_DOMAIN}\\b\" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null | head -n1 || true'")
if [ -z "${SITE_FILE}" ]; then
  warn "No Nginx server block found for ${SITE_DOMAIN}. Using first enabled site."
  SITE_FILE=$($SSH "bash -lc 'ls -1 /etc/nginx/sites-enabled/* 2>/dev/null | head -n1 || true'")
fi
if [ -z "${SITE_FILE}" ]; then
  err "Could not find any Nginx site configuration."
  exit 1
fi
ok "Using site config: ${SITE_FILE}"

log "Extracting current timeout settings..."
TIMEOUT_INFO=$($SSH "bash -lc 'grep -E \"(proxy_connect_timeout|proxy_send_timeout|proxy_read_timeout|client_body_timeout|send_timeout)\" ${SITE_FILE} || echo \"No timeout settings found\"" )
if [ -n "${TIMEOUT_INFO}" ]; then
  echo "${TIMEOUT_INFO}"
else
  warn "No explicit timeout settings found in nginx config"
fi

PROXY_LINE=$($SSH "bash -lc 'grep -nE \"proxy_pass\\s+http\" ${SITE_FILE} | head -n1 || true'")
UPSTREAM_HOST="127.0.0.1"
UPSTREAM_PORT=""
if [ -n "${PROXY_LINE}" ]; then
  echo "${PROXY_LINE}" | awk -F: '{print "line:"$1" text:"substr($0,index($0,$3))}'
  RAW_URL=$($SSH "bash -lc 'awk \"/proxy_pass/{print \\\$2}\" ${SITE_FILE} | sed -n 1p | tr -d \";\"'" )
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

log "Checking if upstream is responding..."
UPSTREAM_RESPONSE=$($SSH "bash -lc 'timeout 5 curl -sS -w \"\\nHTTP_CODE:%{http_code}\\nTIME_TOTAL:%{time_total}s\\n\" -H \"Host: ${SITE_DOMAIN}\" http://${UPSTREAM_HOST}:${UPSTREAM_PORT}/ 2>&1 || echo \"TIMEOUT_OR_ERROR\"" )
if echo "${UPSTREAM_RESPONSE}" | grep -q "HTTP_CODE:200\|HTTP_CODE:302\|HTTP_CODE:301"; then
  RESPONSE_TIME=$(echo "${UPSTREAM_RESPONSE}" | grep "TIME_TOTAL:" | cut -d: -f2 | cut -ds -f1)
  if [ -n "${RESPONSE_TIME}" ]; then
    RESPONSE_TIME_FLOAT=$(echo "${RESPONSE_TIME}" | awk '{print $1}')
    if (( $(echo "${RESPONSE_TIME_FLOAT} > 5.0" | bc -l 2>/dev/null || echo 0) )); then
      warn "Upstream is responding but slowly (${RESPONSE_TIME}s)"
    else
      ok "Upstream is responding normally (${RESPONSE_TIME}s)"
    fi
  fi
else
  warn "Upstream may not be responding or is very slow"
fi

log "Testing upstream with longer timeout (${TIMEOUT_TEST_SECONDS}s)..."
SLOW_TEST=$($SSH "bash -lc 'timeout ${TIMEOUT_TEST_SECONDS} curl -sS -w \"\\nHTTP_CODE:%{http_code}\\nTIME_TOTAL:%{time_total}s\\n\" -m ${TIMEOUT_TEST_SECONDS} -H \"Host: ${SITE_DOMAIN}\" http://${UPSTREAM_HOST}:${UPSTREAM_PORT}/ 2>&1 || echo \"TIMEOUT_AFTER_${TIMEOUT_TEST_SECONDS}s\"" )
if echo "${SLOW_TEST}" | grep -q "TIMEOUT_AFTER"; then
  err "Upstream request timed out after ${TIMEOUT_TEST_SECONDS}s - this is likely the cause of 504 errors"
else
  TEST_TIME=$(echo "${SLOW_TEST}" | grep "TIME_TOTAL:" | cut -d: -f2 | cut -ds -f1)
  if [ -n "${TEST_TIME}" ]; then
    info "Upstream responded within ${TIMEOUT_TEST_SECONDS}s (took ${TEST_TIME}s)"
  fi
fi

log "Checking system resources..."
RESOURCES=$($SSH "bash -lc '
  echo \"CPU Load:\"; uptime | awk -F\"load average:\" \"{print \\\$2}\" || echo \"N/A\";
  echo \"Memory:\"; free -h | grep Mem | awk \"{printf \\\"Used: %s / %s (%.1f%%)\\n\\\", \\\$3, \\\$2, (\\\$3/\\\$2)*100}\" || echo \"N/A\";
  echo \"Disk I/O:\"; iostat -x 1 1 2>/dev/null | tail -n +4 | head -n 5 || echo \"iostat not available\";
  echo \"Active Connections:\"; ss -tn | grep ESTAB | wc -l || netstat -tn | grep ESTAB | wc -l || echo \"N/A\"
'")
echo "${RESOURCES}"

log "Checking for long-running processes..."
LONG_PROCESSES=$($SSH "bash -lc 'ps aux --sort=-%cpu | head -n 6 | awk \"{printf \\\"%-10s %6s%% %6s%% %s\\n\\\", \\\$1, \\\$3, \\\$4, \\\$11}\" || true'")
if [ -n "${LONG_PROCESSES}" ]; then
  echo "${LONG_PROCESSES}"
fi

log "Checking application logs for slow operations..."
APP_LOGS=$($SSH "bash -lc '
  if command -v pm2 >/dev/null 2>&1; then
    echo \"--- PM2 logs (last 30 lines) ---\";
    pm2 logs --lines 30 --nostream 2>/dev/null | grep -iE \"(slow|timeout|error|504|taking|long|processing)\" | tail -n 15 || echo \"No relevant log entries\";
  else
    echo \"PM2 not found, checking systemd logs...\";
    journalctl -u erp -u app -u node --since \"5 minutes ago\" --no-pager 2>/dev/null | grep -iE \"(slow|timeout|error|504|taking|long|processing)\" | tail -n 15 || echo \"No relevant log entries\";
  fi
'")
if [ -n "${APP_LOGS}" ] && [ "${APP_LOGS}" != "No relevant log entries" ]; then
  echo "${APP_LOGS}"
else
  info "No obvious slow operations found in recent logs"
fi

log "Checking database connection and query performance..."
DB_CHECK=$($SSH "bash -lc '
  if command -v psql >/dev/null 2>&1; then
    echo \"PostgreSQL is installed\";
    psql -U postgres -c \"SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = '\''active'\'';\" 2>/dev/null || echo \"Could not connect to database\";
  else
    echo \"PostgreSQL client not found\";
  fi
'")
echo "${DB_CHECK}"

log "Checking for file upload endpoints and their configuration..."
UPLOAD_ENDPOINTS=$($SSH "bash -lc '
  if [ -d /root/abcotronics-erp-modular ] || [ -d /home/*/abcotronics-erp-modular ]; then
    APP_DIR=\$(find /root /home -type d -name \"abcotronics-erp-modular\" 2>/dev/null | head -n1);
    if [ -n \"\\\$APP_DIR\" ]; then
      echo \"App directory: \\\$APP_DIR\";
      grep -r \"client_max_body_size\\|upload\\|multipart\" \\\$APP_DIR/server.js \\\$APP_DIR/api/*.js 2>/dev/null | head -n 5 || echo \"No upload config found\";
    fi
  else
    echo \"Could not locate app directory\";
  fi
'")
if [ -n "${UPLOAD_ENDPOINTS}" ]; then
  echo "${UPLOAD_ENDPOINTS}"
fi

# Check nginx client_max_body_size
CLIENT_MAX_BODY=$($SSH "bash -lc 'grep -E \"client_max_body_size\" ${SITE_FILE} /etc/nginx/nginx.conf 2>/dev/null | head -n1 || echo \"Not set (defaults to 1MB)\"" )
info "Nginx client_max_body_size: ${CLIENT_MAX_BODY}"

echo
log "Analyzing timeout configuration..."
CURRENT_TIMEOUTS=$($SSH "bash -lc 'grep -E \"proxy_(connect|send|read)_timeout\" ${SITE_FILE} | head -n3 || echo \"DEFAULT_60s\"" )

if echo "${CURRENT_TIMEOUTS}" | grep -q "DEFAULT_60s\|60s"; then
  warn "Current timeouts are at default (60s) - may be too short for file uploads/processing"
  if [ "${AUTO_FIX}" = "1" ]; then
    log "Attempting to increase timeouts to 300s (5 minutes) for long-running operations..."
    
    # Backup first
    $SSH "bash -lc 'cp -n ${SITE_FILE} ${SITE_FILE}.bak.$(date +%Y%m%d%H%M%S)'"
    
    # Check if location / block exists and add/update timeouts
    HAS_LOCATION=$($SSH "bash -lc 'grep -A 20 \"location /\" ${SITE_FILE} | head -n1 || echo \"NO_LOCATION\"" )
    
    if echo "${HAS_LOCATION}" | grep -q "location /"; then
      # Update existing timeouts or add them
      $SSH "bash -lc '
        # Remove existing timeout lines in location / block
        sed -i \"/location \\\\/ {/,/^[[:space:]]*}/ { /proxy_connect_timeout/d; /proxy_send_timeout/d; /proxy_read_timeout/d; }\" ${SITE_FILE}
        
        # Add new timeout settings after proxy_pass in location / block
        sed -i \"/location \\\\/ {/,/proxy_pass/ { /proxy_pass/a\\
        \\
        # Increased timeouts for file uploads and long-running operations\\
        proxy_connect_timeout 300s;\\
        proxy_send_timeout 300s;\\
        proxy_read_timeout 300s;
        }\" ${SITE_FILE}
      '"
      
      # Also check for client_max_body_size
      HAS_CLIENT_MAX=$($SSH "bash -lc 'grep \"client_max_body_size\" ${SITE_FILE} || echo \"NO_CLIENT_MAX\"" )
      if echo "${HAS_CLIENT_MAX}" | grep -q "NO_CLIENT_MAX"; then
        # Add client_max_body_size in server block
        $SSH "bash -lc 'sed -i \"/server {/a\\
        client_max_body_size 50M;\" ${SITE_FILE}'"
        info "Added client_max_body_size 50M"
      fi
      
      # Test and reload
      if $SSH "bash -lc 'nginx -t'"; then
        $SSH "bash -lc 'systemctl reload nginx'"
        ok "Updated timeouts to 300s and reloaded Nginx"
      else
        err "Nginx config test failed - restoring backup"
        $SSH "bash -lc 'cp ${SITE_FILE}.bak.* ${SITE_FILE} 2>/dev/null; nginx -t'"
      fi
    else
      warn "Could not find location / block to update"
    fi
  else
    info "Auto-fix disabled. To enable: AUTO_FIX=1 ./scripts/diagnose-504.sh"
  fi
else
  ok "Custom timeout settings found"
fi

echo
log "Final recommendations..."
echo "=================================================="
echo -e "${CYAN}Summary and Recommendations:${NC}"
echo "=================================================="
echo "- Site config: ${SITE_FILE}"
echo "- Upstream: ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
echo "- Current timeouts: Check nginx config above"
echo ""
echo -e "${YELLOW}Common causes of 504 Gateway Timeout:${NC}"
echo "1. File uploads/processing taking > 60s"
echo "2. Slow database queries"
echo "3. Heavy computation in request handlers"
echo "4. Network issues between nginx and upstream"
echo ""
echo -e "${YELLOW}Recommended fixes:${NC}"
echo "1. Increase nginx timeouts (proxy_read_timeout, proxy_send_timeout)"
echo "2. Increase client_max_body_size if uploading large files"
echo "3. Optimize slow database queries"
echo "4. Move long-running operations to background jobs"
echo "5. Add request timeouts in application code"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "- Check application logs: pm2 logs --lines 100"
echo "- Monitor slow queries: Enable query logging in database"
echo "- Test file upload with smaller files first"
echo "- Consider async processing for large file uploads"
echo "=================================================="













