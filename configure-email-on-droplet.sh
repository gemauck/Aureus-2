#!/bin/bash
# Configure Email Settings on Production Droplet
# This script adds SMTP environment variables to the droplet's .env file

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "📧 Configuring Email Settings on Droplet..."
echo "📡 Droplet IP: $DROPLET_IP"
echo ""

# SSH into droplet and configure email
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

APP_DIR="/var/www/abcotronics-erp"

if [ ! -d "$APP_DIR" ]; then
    echo "❌ App directory not found at $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

echo "📧 Adding email configuration to .env file..."

# Check if .env exists, create if not
if [ ! -f .env ]; then
    echo "⚠️  .env file not found, creating it..."
    touch .env
fi

# Function to add or update environment variable in .env
add_or_update_env() {
    local key=$1
    local value=$2
    
    if grep -q "^${key}=" .env; then
        # Update existing
        sed -i "s|^${key}=.*|${key}=${value}|" .env
        echo "   ✅ Updated $key"
    else
        # Add new
        echo "${key}=${value}" >> .env
        echo "   ✅ Added $key"
    fi
}

# Add SMTP configuration
echo "   Adding SMTP_HOST..."
add_or_update_env "SMTP_HOST" "smtp.gmail.com"

echo "   Adding SMTP_PORT..."
add_or_update_env "SMTP_PORT" "587"

echo "   Adding SMTP_USER..."
add_or_update_env "SMTP_USER" "gemauck@gmail.com"

echo "   Adding SMTP_PASS..."
add_or_update_env "SMTP_PASS" "psrbqbzifyooosfx"

echo "   Adding EMAIL_FROM..."
add_or_update_env "EMAIL_FROM" "garethm@abcotronics.co.za"

echo "   Adding APP_URL..."
add_or_update_env "APP_URL" "https://abcoafrica.co.za"

# Show the email-related config (hide password)
echo ""
echo "✅ Email configuration added/updated:"
grep -E "^(SMTP_|EMAIL_|APP_URL)" .env | sed 's/SMTP_PASS=.*/SMTP_PASS=***HIDDEN***/' || echo "   (No email vars found)"

echo ""
echo "🔄 Restarting application to load new environment variables..."
pm2 restart abcotronics-erp || {
    echo "⚠️  PM2 restart failed, trying to start..."
    pm2 start server.js --name abcotronics-erp || echo "❌ Could not start app"
}

pm2 save

echo ""
echo "✅ Email configuration complete!"
echo "🧪 Test the email endpoint:"
echo "   curl -X POST https://abcoafrica.co.za/api/test-email -H 'Content-Type: application/json' -d '{\"email\":\"gemauck@gmail.com\"}'"

ENDSSH

echo ""
echo "✅ Email configuration script completed!"
echo ""
echo "📧 Next steps:"
echo "   1. Wait a few seconds for PM2 to restart"
echo "   2. Test the email endpoint:"
echo "      curl -X POST https://abcoafrica.co.za/api/test-email -H 'Content-Type: application/json' -d '{\"email\":\"gemauck@gmail.com\"}'"
echo "   3. Check your inbox (and spam folder) for the test email"

