#!/usr/bin/env bash
# Run ON THE PRODUCTION SERVER (after SSH), not locally.
# Fixes nginx 502 on /api/public/transcribe-audio and other long API calls when
# proxy_read_timeout is 60s but OpenAI Whisper (or heavy queries) takes longer.
#
# Usage:
#   sudo bash scripts/nginx-bump-proxy-timeouts-300s.sh
#   sudo bash scripts/nginx-bump-proxy-timeouts-300s.sh /etc/nginx/sites-available/abcotronics-erp

set -euo pipefail

SITE_FILE="${1:-}"
if [ -z "${SITE_FILE}" ]; then
  for f in /etc/nginx/sites-enabled/*; do
    if grep -qE 'proxy_pass\s+http://(127\.0\.0\.1|localhost)|abcotronics' "$f" 2>/dev/null; then
      SITE_FILE="$f"
      break
    fi
  done
fi

if [ -z "${SITE_FILE}" ] || [ ! -f "${SITE_FILE}" ]; then
  echo "Usage: $0 /path/to/nginx/site.conf"
  echo "Could not auto-detect site file. Pass the path to your ERP server block."
  exit 1
fi

echo "Using: $SITE_FILE"
cp -a "${SITE_FILE}" "${SITE_FILE}.bak.$(date +%Y%m%d%H%M%S)"

# Upgrade common short timeouts (whole file — SPA + API both benefit)
sed -i \
  -e 's/proxy_read_timeout 60s;/proxy_read_timeout 300s;/g' \
  -e 's/proxy_send_timeout 60s;/proxy_send_timeout 300s;/g' \
  -e 's/proxy_read_timeout 90s;/proxy_read_timeout 300s;/g' \
  -e 's/proxy_send_timeout 90s;/proxy_send_timeout 300s;/g' \
  "${SITE_FILE}"

nginx -t
systemctl reload nginx || service nginx reload

echo "OK: nginx reloaded. proxy read/send timeouts set to 300s where they were 60s/90s."
