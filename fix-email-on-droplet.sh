#!/bin/bash
# Fix Email Configuration - Try Port 465 with SSL
# This script updates SMTP port to 465 and sets secure mode

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🔧 Fixing Email Configuration on Droplet..."
echo "📡 Droplet IP: $DROPLET_IP"
echo ""

ssh root@$DROPLET_IP << 'ENDSSH'
set -e

APP_DIR="/var/www/abcotronics-erp"
cd "$APP_DIR"

echo "📧 Updating SMTP configuration to use port 465 (SSL)..."

# Update port to 465
if grep -q "^SMTP_PORT=" .env; then
    sed -i "s|^SMTP_PORT=.*|SMTP_PORT=465|" .env
    echo "   ✅ Updated SMTP_PORT to 465"
else
    echo "SMTP_PORT=465" >> .env
    echo "   ✅ Added SMTP_PORT=465"
fi

# Add SMTP_SECURE=true for port 465
if grep -q "^SMTP_SECURE=" .env; then
    sed -i "s|^SMTP_SECURE=.*|SMTP_SECURE=true|" .env
    echo "   ✅ Updated SMTP_SECURE to true"
else
    echo "SMTP_SECURE=true" >> .env
    echo "   ✅ Added SMTP_SECURE=true"
fi

echo ""
echo "✅ Email configuration updated:"
grep -E "^(SMTP_PORT|SMTP_SECURE)" .env || echo "   (Config not found)"

echo ""
echo "📦 Pulling latest code changes..."
git pull origin main || echo "   ⚠️  Git pull failed, continuing..."

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp --update-env || pm2 restart abcotronics-erp

pm2 save

echo ""
echo "✅ Email configuration updated!"
echo "🧪 Test the email endpoint:"
echo "   curl -X POST https://abcoafrica.co.za/api/test-email -H 'Content-Type: application/json' -d '{\"email\":\"gemauck@gmail.com\"}'"

ENDSSH

echo ""
echo "✅ Email fix applied!"
echo ""
echo "📧 Next steps:"
echo "   1. Wait a few seconds for PM2 to restart"
echo "   2. Test the email endpoint"
echo "   3. If still not working, consider using SendGrid or Mailgun for better reliability"
