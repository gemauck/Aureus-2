#!/bin/bash
# Quick fix for 504 timeout - run this in your terminal
# It will prompt for your SSH password

DROPLET_IP=$(cat .droplet_ip | tr -d ' \t\r')

echo "🔧 Fixing 504 Gateway Timeout..."
echo "You'll be prompted for your SSH password"
echo ""

ssh -t root@${DROPLET_IP} 'bash -s' << 'ENDFIX'
set -e

SITE_FILE=$(grep -R -l "server_name.*abcoafrica.co.za" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null | head -n1)
[ -z "$SITE_FILE" ] && SITE_FILE=$(ls -1 /etc/nginx/sites-enabled/* 2>/dev/null | head -n1)

echo "Using config: $SITE_FILE"
cp "$SITE_FILE" "$SITE_FILE.backup.$(date +%Y%m%d%H%M%S)"

# Add timeouts after proxy_pass
sed -i '/proxy_pass.*;$/a\        proxy_connect_timeout 300s;\n        proxy_send_timeout 300s;\n        proxy_read_timeout 300s;' "$SITE_FILE"

# Add client_max_body_size if not present
if ! grep -q "client_max_body_size" "$SITE_FILE"; then
  sed -i '/^[[:space:]]*server[[:space:]]*{/a\    client_max_body_size 50M;\n    client_body_timeout 300s;' "$SITE_FILE"
else
  sed -i 's/client_max_body_size[^;]*/client_max_body_size 50M/' "$SITE_FILE"
fi

nginx -t && systemctl reload nginx && echo "✅ Fixed! Timeouts increased to 300s"
ENDFIX

echo ""
echo "✅ Done! Try uploading your file again."




