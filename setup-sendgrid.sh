#!/bin/bash
# Setup SendGrid for Abcotronics ERP

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "📧 SendGrid Configuration Setup"
echo "=============================="
echo ""
echo "This script will help you configure SendGrid for email sending."
echo ""
read -p "Enter your SendGrid API Key (starts with SG.): " SENDGRID_KEY
read -p "Enter sender email address (e.g., garethm@abcotronics.co.za): " EMAIL_FROM

if [ -z "$SENDGRID_KEY" ] || [ -z "$EMAIL_FROM" ]; then
    echo "❌ Both SendGrid API Key and Email From are required!"
    exit 1
fi

echo ""
echo "🔧 Configuring SendGrid on production server..."
echo ""

ssh root@$DROPLET_IP << ENDSSH
cd $APP_DIR

# Backup existing .env
if [ -f .env ]; then
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up existing .env file"
fi

# Remove existing SendGrid/Email config if present
sed -i '/^SENDGRID_API_KEY=/d' .env 2>/dev/null || true
sed -i '/^EMAIL_FROM=/d' .env 2>/dev/null || true
sed -i '/^SMTP_HOST=/d' .env 2>/dev/null || true
sed -i '/^SMTP_USER=/d' .env 2>/dev/null || true
sed -i '/^SMTP_PASS=/d' .env 2>/dev/null || true

# Add SendGrid configuration
echo "" >> .env
echo "# SendGrid Email Configuration" >> .env
echo "SENDGRID_API_KEY=$SENDGRID_KEY" >> .env
echo "EMAIL_FROM=$EMAIL_FROM" >> .env

echo "✅ SendGrid configuration added to .env"
echo ""
echo "📋 Current email configuration:"
grep -E "SENDGRID|EMAIL_FROM" .env | sed "s/SENDGRID_API_KEY=.*/SENDGRID_API_KEY=SG.***HIDDEN***/"
echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp
sleep 2
pm2 status
echo ""
echo "✅ SendGrid setup complete!"
echo ""
echo "⚠️  IMPORTANT: Verify your sender email in SendGrid:"
echo "   Go to: https://app.sendgrid.com/settings/sender_auth"
echo "   Verify: $EMAIL_FROM"
echo ""
ENDSSH

echo ""
echo "✅ SendGrid configuration complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Verify your sender email in SendGrid dashboard"
echo "   2. Test sending an invitation from the User Management page"
echo ""

