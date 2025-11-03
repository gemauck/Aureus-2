#!/bin/bash
# Quick fix for DATABASE_URL issue on production server
# Run this from your local machine - it will SSH and execute on the server

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Quick fix for DATABASE_URL on production server"
echo "📡 Server: $DROPLET_IP"

ssh root@$DROPLET_IP << ENDSSH
set -e

echo "✅ Connected to production server"

cd $APP_DIR || { echo "❌ Failed to navigate to app directory"; exit 1; }
echo "✅ Changed to app directory: \$(pwd)"

# Ensure database file exists
mkdir -p prisma
if [ ! -f prisma/dev.db ]; then
    touch prisma/dev.db
    chmod 666 prisma/dev.db
    echo "✅ Created empty database file"
else
    echo "✅ Database file exists"
fi

# Update PM2 to use ecosystem config
echo "📝 Checking PM2 configuration..."

# Create/update ecosystem.config.mjs
cat > ecosystem.config.mjs << 'EOFPM2'
export default {
  apps: [{
    name: 'abcotronics-erp',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'file:./prisma/dev.db',
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOFPM2

echo "✅ Created ecosystem.config.mjs"

# Stop current PM2 process
echo "🛑 Stopping current PM2 process..."
pm2 delete abcotronics-erp 2>/dev/null || true
echo "✅ Stopped PM2 process"

# Start with ecosystem config
echo "🚀 Starting PM2 with ecosystem config..."
pm2 start ecosystem.config.mjs
echo "✅ Started PM2"

# Save PM2 configuration
pm2 save

echo ""
echo "✅ Fix applied successfully!"
echo ""
echo "📋 Checking PM2 status:"
pm2 status
echo ""
echo "📋 View recent logs (first 20 lines):"
pm2 logs abcotronics-erp --lines 20 --nostream || echo "⚠️  No logs yet"
ENDSSH

echo ""
echo "✅ Quick fix complete!"
echo ""
echo "📋 Next steps:"
echo "1. Check the site: https://abcoafrica.co.za"
echo "2. Test API: curl https://abcoafrica.co.za/api/health"
echo "3. View live logs: ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp --lines 50'"

