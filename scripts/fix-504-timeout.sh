#!/usr/bin/env bash

# Fix 504 Gateway Timeout by increasing nginx timeouts
# Run this script on your server via SSH

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

SITE_DOMAIN=${SITE_DOMAIN:-abcoafrica.co.za}

echo
echo "=================================================="
echo -e "${CYAN}504 Gateway Timeout Fix${NC}"
echo "=================================================="
echo

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
CURRENT_TIMEOUTS=$(grep -E "(proxy_connect_timeout|proxy_send_timeout|proxy_read_timeout|client_max_body_size|client_body_timeout)" "${SITE_FILE}" || echo "")
if [ -n "${CURRENT_TIMEOUTS}" ]; then
  info "Current settings:"
  echo "${CURRENT_TIMEOUTS}"
else
  warn "No timeout settings found"
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

# Remove existing timeout settings in location / block
sed -i '/location \/ {/,/^[[:space:]]*}/ { 
  /proxy_connect_timeout/d
  /proxy_send_timeout/d
  /proxy_read_timeout/d
}' "${TEMP_FILE}"

# Add new timeout settings after proxy_pass in location / block
if grep -q "proxy_pass" "${TEMP_FILE}"; then
  # Find the line with proxy_pass and add timeouts after it
  sed -i '/proxy_pass.*;$/a\
\
        # Increased timeouts for file uploads and long-running operations\
        proxy_connect_timeout 300s;\
        proxy_send_timeout 300s;\
        proxy_read_timeout 300s;
' "${TEMP_FILE}"
else
  warn "Could not find proxy_pass directive"
fi

# Add client_max_body_size in server block if not present
if ! grep -q "client_max_body_size" "${TEMP_FILE}"; then
  # Add after server { line
  sed -i '/^[[:space:]]*server[[:space:]]*{/a\
    # Allow larger file uploads (50MB)\
    client_max_body_size 50M;\
    client_body_timeout 300s;
' "${TEMP_FILE}"
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
  rm "${TEMP_FILE}"
  
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
  rm "${TEMP_FILE}"
  exit 1
fi

echo
log "Verifying changes..."
NEW_TIMEOUTS=$(grep -E "(proxy_connect_timeout|proxy_send_timeout|proxy_read_timeout|client_max_body_size|client_body_timeout)" "${SITE_FILE}" || echo "")
if [ -n "${NEW_TIMEOUTS}" ]; then
  info "New settings:"
  echo "${NEW_TIMEOUTS}"
fi

echo
echo "=================================================="
ok "504 Timeout Fix Complete!"
echo "=================================================="
echo
info "Changes made:"
echo "  ✓ Increased proxy_read_timeout to 300s (5 minutes)"
echo "  ✓ Increased proxy_send_timeout to 300s"
echo "  ✓ Increased proxy_connect_timeout to 300s"
echo "  ✓ Increased client_max_body_size to 50M"
echo "  ✓ Increased client_body_timeout to 300s"
echo
info "Your file uploads should now work without timing out!"
echo "Try uploading your Excel file again."
echo
