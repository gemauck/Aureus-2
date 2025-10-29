#!/bin/bash
# Helper script to update email password on droplet
# Usage: ./update-email-password.sh YOUR_NEW_APP_PASSWORD

set -e

DROPLET_IP="165.22.127.196"

if [ -z "$1" ]; then
    echo "❌ Error: Please provide your new Gmail app password"
    echo ""
    echo "Usage: ./update-email-password.sh YOUR_NEW_APP_PASSWORD"
    echo ""
    echo "Example: ./update-email-password.sh abcdabcdabcdabcd"
    echo ""
    exit 1
fi

NEW_PASSWORD="$1"

echo "🔒 Updating SMTP password on droplet..."
echo ""

ssh root@$DROPLET_IP << ENDSSH
set -e

cd /var/www/abcotronics-erp

if [ -f .env ]; then
    # Update or add SMTP_PASS
    if grep -q "^SMTP_PASS=" .env; then
        sed -i "s|^SMTP_PASS=.*|SMTP_PASS=\"${NEW_PASSWORD}\"|" .env
        echo "✅ Updated SMTP_PASS in .env"
    else
        echo "SMTP_PASS=\"${NEW_PASSWORD}\"" >> .env
        echo "✅ Added SMTP_PASS to .env"
    fi
    
    echo ""
    echo "🔄 Restarting application..."
    pm2 restart abcotronics-erp || pm2 restart all
    pm2 save
    
    echo ""
    echo "✅ Password updated and application restarted!"
    echo ""
    echo "🧪 Test by sending an invitation email from the ERP"
else
    echo "❌ .env file not found!"
    exit 1
fi
ENDSSH

echo ""
echo "✅ Done! Your email password has been updated."
echo ""

