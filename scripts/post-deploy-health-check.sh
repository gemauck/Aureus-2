#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
PM2_PROCESS_NAME="${PM2_PROCESS_NAME:-abcotronics-erp}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-8}"

echo "== Post-deploy health check =="
echo "Target URL: ${APP_URL}"
echo "PM2 app   : ${PM2_PROCESS_NAME}"

check_endpoint() {
  local path="$1"
  local label="$2"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time "${HEALTH_TIMEOUT_SECONDS}" "${APP_URL}${path}" 2>/dev/null || echo "000")"
  if [ "$code" = "200" ]; then
    echo "  ✓ ${label}: HTTP ${code}"
  else
    echo "  ✗ ${label}: HTTP ${code}"
    return 1
  fi
}

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_PROCESS_NAME}" >/dev/null 2>&1; then
    status="$(pm2 jlist | node -e "
      const fs = require('fs');
      const n = process.argv[1];
      const list = JSON.parse(fs.readFileSync(0, 'utf8'));
      const app = list.find(x => x.name === n);
      process.stdout.write(app?.pm2_env?.status || 'unknown');
    " "${PM2_PROCESS_NAME}")"
    if [ "${status}" = "online" ]; then
      echo "  ✓ PM2 status: ${status}"
    else
      echo "  ✗ PM2 status: ${status}"
      exit 1
    fi
  else
    echo "  ✗ PM2 process not found: ${PM2_PROCESS_NAME}"
    exit 1
  fi
fi

check_endpoint "/health" "Health endpoint"
check_endpoint "/version" "Version endpoint"

check_mobile_error_report() {
  local code
  code="$(
    curl -s -o /dev/null -w "%{http_code}" --max-time "${HEALTH_TIMEOUT_SECONDS}" \
      -X POST "${APP_URL}/api/public/mobile-error-report" \
      -H "Content-Type: application/json" \
      -H "X-Mobile-Error-Probe: 1" \
      -d '{"message":"Deploy probe","pageUrl":"mobile://Test","meta":{"context":"deploy-probe","probe":true}}' \
      2>/dev/null || echo "000"
  )"
  if [ "$code" = "200" ]; then
    echo "  ✓ Mobile error report endpoint: HTTP ${code} (probe, not stored)"
  else
    echo "  ✗ Mobile error report endpoint: HTTP ${code}"
    return 1
  fi
}

check_mobile_error_report

check_web_error_report() {
  local code
  code="$(
    curl -s -o /dev/null -w "%{http_code}" --max-time "${HEALTH_TIMEOUT_SECONDS}" \
      -X POST "${APP_URL}/api/public/web-error-report" \
      -H "Content-Type: application/json" \
      -H "X-Web-Error-Probe: 1" \
      -d '{"message":"Deploy probe","pageUrl":"web://Test","meta":{"context":"deploy-probe","probe":true}}' \
      2>/dev/null || echo "000"
  )"
  if [ "$code" = "200" ]; then
    echo "  ✓ Web error report endpoint: HTTP ${code} (probe, not stored)"
  else
    echo "  ✗ Web error report endpoint: HTTP ${code}"
    return 1
  fi
}

check_web_error_report

echo "== Health check passed =="
