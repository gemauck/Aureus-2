#!/bin/bash
# Renew Let's Encrypt certificate for abcoafrica.co.za (webroot mode, no nginx stop)
# Run from your Mac: ./renew-ssl.sh

set -e
SERVER="root@abcoafrica.co.za"

echo "🔐 Running certbot renew (nginx stays up, ~1 min)..."
ssh -o ConnectTimeout=15 -o BatchMode=yes -o ServerAliveInterval=30 "$SERVER" 'certbot renew --non-interactive && systemctl reload nginx'

echo "📋 Cert dates:"
ssh -o ConnectTimeout=15 -o BatchMode=yes "$SERVER" 'openssl x509 -in /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem -noout -dates'

echo ""
echo "🌐 Test: https://abcoafrica.co.za"
