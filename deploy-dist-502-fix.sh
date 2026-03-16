#!/usr/bin/env bash
# Fix 502 and ERR_HTTP2_PROTOCOL_ERROR for /dist/* and API under load.
# Run on the production server: sudo bash deploy-dist-502-fix.sh
# Or from repo root: ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && bash deploy-dist-502-fix.sh'

set -e

APP_NAME="${APP_NAME:-abcotronics-erp}"
APP_PORT="${APP_PORT:-3000}"
SITE_FILE="/etc/nginx/sites-available/${APP_NAME}"

echo "=== Deploy /dist/ 502 and HTTP/2 fix ==="
echo "Site config: ${SITE_FILE}"
echo ""

if [ ! -f "${SITE_FILE}" ]; then
  echo "ERROR: Nginx site config not found: ${SITE_FILE}"
  exit 1
fi

# Backup
cp "${SITE_FILE}" "${SITE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "Backup created."

# Check if we already have the dedicated /dist/ location (idempotent)
if grep -q 'location /dist/ {' "${SITE_FILE}"; then
  echo "Already has location /dist/ block. Skipping insert."
else
  # Insert dedicated /dist/ block before "location / {" (main catch-all).
  BLOCK_FILE=$(mktemp)
  cat << BLOCK_EOF > "${BLOCK_FILE}"
    # Dedicated /dist/ to avoid 502 and ERR_HTTP2_PROTOCOL_ERROR for lazy-loaded JS
    location /dist/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Accept-Encoding "";
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
        proxy_busy_buffers_size 16k;
    }

BLOCK_EOF
  # Insert block before first "location / {" in the file
  awk -v blockfile="${BLOCK_FILE}" '
    /location \/ \{/ && !inserted { while ((getline line < blockfile) > 0) print line; close(blockfile); inserted = 1 }
    { print }
  ' "${SITE_FILE}" > "${SITE_FILE}.new" && mv "${SITE_FILE}.new" "${SITE_FILE}"
  rm -f "${BLOCK_FILE}"
  echo "Inserted location /dist/ block."
fi

# Optionally bump timeouts in the main location / block (if they are 60s we leave them; if lower, increase)
if grep -q 'proxy_read_timeout 60s' "${SITE_FILE}"; then
  sed -i 's/proxy_read_timeout 60s/proxy_read_timeout 120s/g' "${SITE_FILE}"
  sed -i 's/proxy_send_timeout 60s/proxy_send_timeout 120s/g' "${SITE_FILE}"
  echo "Increased main location timeouts to 120s."
fi

echo ""
echo "Testing nginx config..."
if nginx -t 2>/dev/null; then
  echo "Reloading nginx..."
  systemctl reload nginx
  echo "Done. /dist/ and API should be more stable."
else
  echo "ERROR: nginx -t failed. Restore backup: cp ${SITE_FILE}.backup.* ${SITE_FILE}"
  exit 1
fi
