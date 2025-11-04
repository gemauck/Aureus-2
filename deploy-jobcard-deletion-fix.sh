#!/bin/bash
# Deploy job card deletion fix directly to server

set -e

echo "🚀 Deploying job card deletion fix to server..."

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
FILES=(
  "src/components/manufacturing/JobCards.jsx"
)

echo "📡 Connecting to server..."
ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
cd $APP_DIR

# Backup current files
echo "💾 Creating backup..."
mkdir -p backups/\$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/\$(date +%Y%m%d_%H%M%S)"

ENDSSH

# Copy files to server
echo "📤 Copying files to server..."
for file in "${FILES[@]}"; do
  echo "  - Copying $file"
  scp "$file" $SERVER:$APP_DIR/$file
done

# Restart the application
echo ""
echo "🔄 Restarting application..."
ssh $SERVER << ENDSSH
cd $APP_DIR

# Restart with PM2
if command -v pm2 &> /dev/null; then
  echo "🔄 Restarting with PM2..."
  pm2 restart abcotronics-erp || pm2 restart all
  echo "✅ Application restarted"
else
  echo "⚠️  PM2 not found, please restart manually"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Changes deployed:"
echo "  - Job card deletion persistence fix"
echo "  - Proper cache clearing"
echo "  - Server-first deletion flow"

ENDSSH

echo ""
echo "✅ Deployment complete!"

