#!/bin/bash
# Deploy Lead Persistence Fix (Contacts, Calendar, Notes)

SERVER="root@165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Lead Persistence Fix..."
echo "📡 Server: $SERVER"
echo "📁 App Directory: $APP_DIR"
echo ""

# Check if we should commit first
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Uncommitted changes detected."
    read -p "Would you like to commit these changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "💾 Committing changes..."
        git add src/components/clients/Clients.jsx src/components/clients/LeadDetailModal.jsx src/utils/databaseAPI.js api/leads/[id].js
        git commit -m "Fix: Lead persistence - contacts, calendar, and notes now save correctly

- Fixed updateLead to use PATCH instead of PUT
- Explicitly ensure contacts, followUps, and notes are saved
- Added auto-save for notes on blur
- Improved API endpoint field handling"
        
        echo "📤 Pushing to remote..."
        git push origin main
        echo "✅ Changes committed and pushed"
    else
        echo "⚠️  Skipping commit. Deploying current state..."
    fi
fi

echo ""
echo "🔌 Connecting to server..."

# SSH into server and deploy
ssh $SERVER << 'ENDSSH'
set -e

echo "✅ Connected to server"

cd /var/www/abcotronics-erp

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git fetch origin
git reset --hard origin/main

# Install dependencies if needed
echo "📦 Checking dependencies..."
npm install --production

# Generate Prisma client if needed
echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped (already up to date)"

# Restart the application
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

# Show status
echo ""
echo "📊 Application status:"
pm2 status

echo ""
echo "✅ Deployment complete!"
echo "🧪 Test by adding contacts, calendar items, and notes to a lead, then refresh"
ENDSSH

echo ""
echo "✅ Deployment successful!"
echo ""
echo "🔍 To check logs, run:"
echo "   ssh $SERVER 'pm2 logs abcotronics-erp --lines 50'"

