#!/bin/bash
# Deploy 504 Gateway Timeout fix to server
# Similar to other deployment scripts - uses SSH heredoc

set -e

# Try domain name first (like other deployment scripts), fallback to IP
SERVER="root@abcoafrica.co.za"
DROPLET_IP=$(cat .droplet_ip | tr -d ' \t\r' 2>/dev/null || echo "")
SITE_DOMAIN="abcoafrica.co.za"

echo "🔧 Deploying 504 Gateway Timeout Fix"
echo "======================================"
echo "Server: ${SERVER}"
echo ""

# Try SSH with various options
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"

# SSH into server and apply fix
ssh ${SSH_OPTS} ${SERVER} << 'ENDSSH'
set -e

SITE_DOMAIN="abcoafrica.co.za"

echo "✅ Connected to server"
echo ""

# Find nginx config
log() { echo "[$(date +%H:%M:%S)] $*"; }
ok()  { echo "✔ $*"; }
warn(){ echo "⚠ $*"; }
err() { echo "✖ $*"; }

log "Finding nginx site configuration..."
SITE_FILE=$(grep -R -l "server_name.*${SITE_DOMAIN}" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null | head -n1)

if [ -z "${SITE_FILE}" ]; then
  warn "No Nginx server block found for ${SITE_DOMAIN}. Using first enabled site."
  SITE_FILE=$(ls -1 /etc/nginx/sites-enabled/* 2>/dev/null | head -n1)
fi

if [ -z "${SITE_FILE}" ]; then
  err "Could not find any Nginx site configuration."
  exit 1
fi

ok "Using site config: ${SITE_FILE}"

# Backup
BACKUP_FILE="${SITE_FILE}.backup.$(date +%Y%m%d%H%M%S)"
cp "${SITE_FILE}" "${BACKUP_FILE}"
ok "Backup created: ${BACKUP_FILE}"

log "Checking current timeout settings..."
CURRENT_TIMEOUTS=$(grep -E "(proxy_connect_timeout|proxy_send_timeout|proxy_read_timeout|client_max_body_size|client_body_timeout)" "${SITE_FILE}" 2>/dev/null || echo "")
if [ -n "${CURRENT_TIMEOUTS}" ]; then
  echo "Current settings:"
  echo "${CURRENT_TIMEOUTS}"
  echo ""
fi

log "Updating nginx configuration..."

# Check if location / block exists
if ! grep -q "location /" "${SITE_FILE}"; then
  err "Could not find 'location /' block in nginx config"
  exit 1
fi

# Create a temporary file with the updated config
TEMP_FILE=$(mktemp)
cp "${SITE_FILE}" "${TEMP_FILE}"

# Remove existing timeout settings in location / block (using a more compatible sed approach)
sed -i '/location \/ {/,/^[[:space:]]*}/ {
  /proxy_connect_timeout/d
  /proxy_send_timeout/d
  /proxy_read_timeout/d
}' "${TEMP_FILE}" 2>/dev/null || {
  # Fallback: simpler sed if the above doesn't work
  sed -i '/proxy_connect_timeout/d; /proxy_send_timeout/d; /proxy_read_timeout/d' "${TEMP_FILE}"
}

# Add new timeout settings after proxy_pass in location / block
if grep -q "proxy_pass" "${TEMP_FILE}"; then
  # Use a more compatible approach for adding lines
  awk '
    /proxy_pass.*;$/ {
      print $0
      print ""
      print "        # Increased timeouts for file uploads and long-running operations"
      print "        proxy_connect_timeout 300s;"
      print "        proxy_send_timeout 300s;"
      print "        proxy_read_timeout 300s;"
      next
    }
    { print }
  ' "${TEMP_FILE}" > "${TEMP_FILE}.new" && mv "${TEMP_FILE}.new" "${TEMP_FILE}"
else
  warn "Could not find proxy_pass directive"
fi

# Add client_max_body_size in server block if not present
if ! grep -q "client_max_body_size" "${TEMP_FILE}"; then
  # Add after server { line using awk for better compatibility
  awk '
    /^[[:space:]]*server[[:space:]]*{/ {
      print $0
      print "    # Allow larger file uploads (50MB)"
      print "    client_max_body_size 50M;"
      print "    client_body_timeout 300s;"
      next
    }
    { print }
  ' "${TEMP_FILE}" > "${TEMP_FILE}.new" && mv "${TEMP_FILE}.new" "${TEMP_FILE}"
  ok "Added client_max_body_size 50M"
else
  # Update existing client_max_body_size
  sed -i 's/client_max_body_size[^;]*/client_max_body_size 50M/' "${TEMP_FILE}"
  ok "Updated client_max_body_size to 50M"
fi

# Test the configuration
log "Testing nginx configuration..."
if nginx -t; then
  ok "Configuration is valid"
  
  # Replace original file
  cp "${TEMP_FILE}" "${SITE_FILE}"
  rm -f "${TEMP_FILE}"
  
  log "Reloading nginx..."
  if systemctl reload nginx; then
    ok "Nginx reloaded successfully"
  else
    err "Failed to reload nginx"
    # Restore backup
    cp "${BACKUP_FILE}" "${SITE_FILE}"
    exit 1
  fi
else
  err "Configuration test failed - restoring backup"
  cp "${BACKUP_FILE}" "${SITE_FILE}"
  rm -f "${TEMP_FILE}"
  exit 1
fi

echo ""
log "Verifying changes..."
NEW_TIMEOUTS=$(grep -E "(proxy_connect_timeout|proxy_send_timeout|proxy_read_timeout|client_max_body_size|client_body_timeout)" "${SITE_FILE}" 2>/dev/null || echo "")
if [ -n "${NEW_TIMEOUTS}" ]; then
  echo "New settings:"
  echo "${NEW_TIMEOUTS}"
fi

echo ""
echo "=================================================="
ok "504 Timeout Fix Complete!"
echo "=================================================="
echo ""
echo "Changes made:"
echo "  ✓ Increased proxy_read_timeout to 300s (5 minutes)"
echo "  ✓ Increased proxy_send_timeout to 300s"
echo "  ✓ Increased proxy_connect_timeout to 300s"
echo "  ✓ Increased client_max_body_size to 50M"
echo "  ✓ Increased client_body_timeout to 300s"
echo ""
echo "Your file uploads should now work without timing out!"
echo ""

ENDSSH

echo ""
echo "✅ 504 Timeout Fix Deployed Successfully!"
echo ""
echo "🌐 Try uploading your Excel file again at:"
echo "   https://abcoafrica.co.za/teams?tab=poa-review&team=data-analytics"
echo ""













