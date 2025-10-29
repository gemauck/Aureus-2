#!/bin/bash
# Switch Email Service to SendGrid
# Usage: ./switch-to-sendgrid.sh YOUR_SENDGRID_API_KEY

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

if [ -z "$1" ]; then
    echo "❌ Error: SendGrid API key required"
    echo ""
    echo "Usage: ./switch-to-sendgrid.sh YOUR_SENDGRID_API_KEY"
    echo ""
    echo "To get your API key:"
    echo "1. Sign up at https://signup.sendgrid.com/ (free)"
    echo "2. Go to Settings → API Keys"
    echo "3. Create a new key with 'Mail Send' permissions"
    echo "4. Copy the API key"
    exit 1
fi

SENDGRID_API_KEY="$1"

echo "📧 Switching Email Service to SendGrid..."
echo "📡 Droplet IP: $DROPLET_IP"
echo ""

ssh root@$DROPLET_IP << ENDSSH
set -e

APP_DIR="/var/www/abcotronics-erp"
cd "\$APP_DIR"

echo "📧 Updating SMTP configuration for SendGrid..."

# Update SMTP_HOST
if grep -q "^SMTP_HOST=" .env; then
    sed -i "s|^SMTP_HOST=.*|SMTP_HOST=smtp.sendgrid.net|" .env
else
    echo "SMTP_HOST=smtp.sendgrid.net" >> .env
fi

# Update SMTP_PORT
if grep -q "^SMTP_PORT=" .env; then
    sed -i "s|^SMTP_PORT=.*|SMTP_PORT=587|" .env
else
    echo "SMTP_PORT=587" >> .env
fi

# Update SMTP_USER (must be 'apikey' for SendGrid)
if grep -q "^SMTP_USER=" .env; then
    sed -i "s|^SMTP_USER=.*|SMTP_USER=apikey|" .env
else
    echo "SMTP_USER=apikey" >> .env
fi

# Update SMTP_PASS with API key
if grep -q "^SMTP_PASS=" .env; then
    sed -i "s|^SMTP_PASS=.*|SMTP_PASS=$SENDGRID_API_KEY|" .env
else
    echo "SMTP_PASS=$SENDGRID_API_KEY" >> .env
fi

# Remove SMTP_SECURE (not needed for SendGrid on port 587)
sed -i '/^SMTP_SECURE=/d' .env

# Ensure EMAIL_FROM is set
if ! grep -q "^EMAIL_FROM=" .env; then
    echo "EMAIL_FROM=noreply@abcotronics.co.za" >> .env
fi

echo ""
echo "✅ SendGrid configuration updated:"
grep -E "^(SMTP_|EMAIL_FROM)" .env | sed 's/SMTP_PASS=.*/SMTP_PASS=***HIDDEN***/' || echo "   (Config not found)"

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp --update-env || pm2 restart abcotronics-erp
pm2 save

echo ""
echo "✅ SendGrid configuration complete!"
echo "🧪 Test the email endpoint:"
echo "   curl -X POST https://abcoafrica.co.za/api/test-email -H 'Content-Type: application/json' -d '{\"email\":\"gemauck@gmail.com\"}'"

ENDSSH

echo ""
echo "✅ Email service switched to SendGrid!"
echo ""
echo "📧 Next steps:"
echo "   1. Wait a few seconds for PM2 to restart"
echo "   2. Test the email endpoint"
echo "   3. Check your inbox for the test email"

