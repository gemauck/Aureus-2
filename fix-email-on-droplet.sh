#!/bin/bash
# Fix email invitations by setting environment variables on Droplet

set -e

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "📧 Fixing Email Invitations on Droplet"
echo "======================================"
echo ""

ssh root@$DROPLET_IP << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📝 Current .env file status:"
if [ -f .env ]; then
    echo "✅ .env file exists"
    echo ""
    echo "Checking email variables:"
    grep -E "SMTP_|EMAIL_" .env || echo "⚠️ No email variables found"
else
    echo "❌ .env file not found - creating it..."
    touch .env
fi

echo ""
echo "🔧 Adding/updating email environment variables..."

# Function to update or add environment variable
update_env_var() {
    local key=$1
    local value=$2
    if grep -q "^${key}=" .env; then
        # Update existing
        sed -i "s|^${key}=.*|${key}=\"${value}\"|" .env
        echo "   ✅ Updated ${key}"
    else
        # Add new
        echo "${key}=\"${value}\"" >> .env
        echo "   ✅ Added ${key}"
    fi
}

# Set all email variables
update_env_var "SMTP_HOST" "smtp.gmail.com"
update_env_var "SMTP_PORT" "587"
update_env_var "SMTP_USER" "gemauck@gmail.com"

# Only update SMTP_PASS if it doesn't exist (preserve existing password)
if ! grep -q "^SMTP_PASS=" .env; then
    echo ""
    echo "⚠️  SMTP_PASS not found in .env"
    echo "Please set it manually on the server:"
    echo "   nano /var/www/abcotronics-erp/.env"
    echo "   Then add: SMTP_PASS=\"your-gmail-app-password\""
    echo ""
    echo "To generate a new Gmail app password:"
    echo "   https://myaccount.google.com/apppasswords"
    echo ""
else
    echo "   ✅ SMTP_PASS already exists (preserved)"
fi

update_env_var "EMAIL_FROM" "garethm@abcotronics.co.za"
update_env_var "EMAIL_REPLY_TO" "garethm@abcotronics.co.za"
update_env_var "SMTP_FROM_EMAIL" "noreply@abcotronics.com"
update_env_var "SMTP_FROM_NAME" "Abcotronics Security"

echo ""
echo "✅ Email variables configured!"
echo ""
echo "📧 Current email configuration:"
grep -E "SMTP_|EMAIL_" .env

echo ""
echo "🔄 Restarting application to apply changes..."

if command -v pm2 &> /dev/null; then
    echo "   Using PM2..."
    pm2 restart abcotronics-erp || pm2 restart all
    pm2 save
    echo "   ✅ Application restarted with PM2"
    echo ""
    echo "📊 Application status:"
    pm2 status
elif systemctl list-units --type=service | grep -q abcotronics; then
    echo "   Using systemctl..."
    systemctl restart abcotronics-erp
    echo "   ✅ Application restarted with systemctl"
else
    echo "   ⚠️ No process manager found"
    echo "   Please restart manually: node server.js"
fi

echo ""
echo "========================================="
echo "✅ Email configuration complete!"
echo "========================================="
echo ""
echo "🧪 Test email sending:"
echo "   1. Go to https://abcoafrica.co.za"
echo "   2. Open Users page"
echo "   3. Send a test invitation"
echo "   4. Check email inbox (and spam)"
echo ""
echo "📊 Monitor logs for email issues:"
echo "   pm2 logs abcotronics-erp --lines 50"
echo ""

ENDSSH

echo ""
echo "✅ Done! Email variables are now configured on your droplet."
echo ""
echo "🔍 Next steps:"
echo "   1. Test by sending an invitation from the ERP"
echo "   2. Check server logs: ssh root@165.22.127.196 'pm2 logs abcotronics-erp'"
echo "   3. Look for: '✅ Invitation email sent successfully'"
echo ""
