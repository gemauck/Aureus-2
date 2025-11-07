#!/bin/bash
# Setup SendGrid for Email Notifications
# This fixes SMTP timeout issues on Digital Ocean droplets

echo "🔧 Setting up SendGrid for Email Notifications"
echo "=============================================="
echo ""

# Check if we're on the server
if [ ! -d "/var/www/abcotronics-erp" ]; then
    echo "⚠️  This script should be run on the production server"
    echo "   SSH into server first: ssh root@165.22.127.196"
    exit 1
fi

cd /var/www/abcotronics-erp

echo "📋 Current email configuration:"
echo "   SMTP_HOST: $(grep SMTP_HOST .env | cut -d'=' -f2 || echo 'Not set')"
echo "   SENDGRID_API_KEY: $(grep SENDGRID_API_KEY .env | cut -d'=' -f2 | cut -c1-10 || echo 'Not set')..."
echo ""

# Check if SendGrid is already configured
if grep -q "SENDGRID_API_KEY=SG\." .env 2>/dev/null; then
    echo "✅ SendGrid API key is already configured"
    echo ""
    echo "📧 Current configuration:"
    grep -E "(SENDGRID|SMTP|EMAIL_FROM)" .env | grep -v "^#" | head -5
    echo ""
    echo "To update SendGrid API key:"
    echo "   nano .env"
    echo "   # Update SENDGRID_API_KEY=SG.your-key-here"
    echo "   pm2 restart abcotronics-erp"
    exit 0
fi

echo "📝 To configure SendGrid:"
echo ""
echo "1. Get SendGrid API Key:"
echo "   - Go to: https://app.sendgrid.com/settings/api_keys"
echo "   - Create new API key with 'Mail Send' permissions"
echo "   - Copy the key (starts with SG.)"
echo ""
echo "2. Update .env file:"
echo "   nano .env"
echo ""
echo "3. Add or update these lines:"
echo "   SENDGRID_API_KEY=SG.your-api-key-here"
echo "   EMAIL_FROM=garethm@abcotronics.co.za"
echo "   # Optional: Keep SMTP settings as fallback"
echo ""
echo "4. Restart the application:"
echo "   pm2 restart abcotronics-erp --update-env"
echo ""
echo "5. Verify it's working:"
echo "   pm2 logs abcotronics-erp --lines 20 | grep -i sendgrid"
echo "   # Should see: 'Using SendGrid HTTP API'"
echo ""
echo "✅ SendGrid setup instructions complete!"
echo ""
echo "💡 Benefits of SendGrid:"
echo "   - Bypasses SMTP port blocking"
echo "   - More reliable for production"
echo "   - Better deliverability"
echo "   - Free tier: 100 emails/day"
echo ""

