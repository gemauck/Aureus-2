#!/usr/bin/env bash
# Run ON THE PRODUCTION SERVER (after SSH), not locally.
# POA Review Excel processing can take 10–15 minutes; nginx default 60–300s → 502 while Node/Python still runs.
#
# Usage:
#   sudo bash scripts/nginx-bump-poa-excel-timeout.sh
#   sudo bash scripts/nginx-bump-poa-excel-timeout.sh /etc/nginx/sites-available/abcotronics-erp

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
  exit 1
fi

echo "Using: $SITE_FILE"
cp -a "${SITE_FILE}" "${SITE_FILE}.bak.poa-excel.$(date +%Y%m%d%H%M%S)"

if grep -q 'location ~ \^/api/poa-review/process-excel\$' "${SITE_FILE}"; then
  echo "POA process-excel location block already present — bumping timeouts to 900s"
  sed -i \
    -e 's/proxy_read_timeout 300s;/proxy_read_timeout 900s;/g' \
    -e 's/proxy_send_timeout 300s;/proxy_send_timeout 900s;/g' \
    "${SITE_FILE}"
else
  echo "Inserting dedicated POA process-excel location (900s timeouts) before location /api/ ..."
  awk '
    /^[[:space:]]*location \/api\/ \{/ && !done {
      print "    # POA Review Excel — long-running pandas pipeline (10–15 min)"
      print "    location ~ ^/api/poa-review/process-excel$ {"
      print "        proxy_pass http://127.0.0.1:3000/api/poa-review/process-excel;"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        proxy_connect_timeout 30s;"
      print "        proxy_send_timeout 900s;"
      print "        proxy_read_timeout 900s;"
      print "        client_body_timeout 900s;"
      print "    }"
      print ""
      done=1
    }
    { print }
  ' "${SITE_FILE}" > "${SITE_FILE}.tmp" && mv "${SITE_FILE}.tmp" "${SITE_FILE}"
fi

nginx -t
systemctl reload nginx || service nginx reload
echo "OK: nginx reloaded. POA process-excel proxy timeout is 900s."
