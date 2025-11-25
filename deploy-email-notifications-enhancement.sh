#!/bin/bash
# Deploy Email Notifications Enhancement
# This script deploys the enhanced email notifications with project/client names and comment extracts

set -e

SERVER="root@165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Email Notifications Enhancement..."
echo "📡 Server: $SERVER"
echo ""
echo "📋 Changes being deployed:"
echo "   • Enhanced email subjects with project/client names"
echo "   • Enhanced email body with project context"
echo "   • Comment extracts in emails"
echo "   • Improved notification settings (emailTasks default: true)"
echo ""

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
echo "🌿 Current branch: $CURRENT_BRANCH"

# Step 1: Commit changes (if any)
echo ""
echo "📋 Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Uncommitted changes detected:"
    git status --short
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "feat: Enhanced email notifications with project/client names and comment extracts

- Enhanced email subject lines with [Client Name - Project Name] prefix
- Added project context section to email body (client, project, task)
- Added comment extracts to mention and comment emails
- Changed emailTasks default to true in schema
- Improved email template with better formatting
- Added comprehensive logging for email sending
- Updated notification settings creation with all defaults enabled"
        echo "✅ Changes committed"
    else
        echo "⚠️  Skipping commit. Make sure to commit changes manually."
    fi
else
    echo "✅ No uncommitted changes"
fi

# Step 2: Push to git
echo ""
echo "📤 Pushing to git..."
git push origin $CURRENT_BRANCH || echo "⚠️  Git push skipped or failed"
echo ""

# Step 3: Deploy to server
echo "🚀 Deploying to server..."
ssh $SERVER << 'DEPLOY'
set -e

echo "✅ Connected to server"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
git pull origin main || git pull origin master
echo "✅ Code updated"

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate

echo "🗄️  Applying database schema changes..."
# The schema change (emailTasks default: true) will apply to new users automatically
# For existing users, we'll run the update script
echo "   • New users will have emailTasks: true by default"
echo "   • Existing users need notification settings update (run update script if needed)"

echo "🔄 Running notification settings update script..."
if [ -f "api/update-notification-settings.js" ]; then
    echo "   • Running update script to ensure all users have emailTasks enabled..."
    node api/update-notification-settings.js || echo "⚠️  Update script failed - you may need to run manually"
else
    echo "⚠️  Update script not found - skipping"
fi

echo "🏗️  Building frontend..."
npm run build:jsx || node build-jsx.js || echo "⚠️  JSX build skipped"
npm run build:css || echo "⚠️  CSS build skipped"

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
pm2 save

echo ""
echo "🔍 Checking application status..."
sleep 3
pm2 status abcotronics-erp

echo ""
echo "📋 Recent logs:"
pm2 logs abcotronics-erp --lines 10 --nostream || echo "⚠️  Could not fetch logs"

DEPLOY

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Email Notifications Enhancement Deployed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📋 What was deployed:"
echo "   ✅ Enhanced email subjects with [Client - Project] prefix"
echo "   ✅ Project context section in email body"
echo "   ✅ Comment extracts in emails"
echo "   ✅ Improved email template formatting"
echo "   ✅ Better error logging"
echo ""
echo "🧪 Next steps:"
echo "   1. Test task assignment - assign a task to yourself"
echo "   2. Test mentions - tag a user in a comment: @username"
echo "   3. Test comments - add a comment to a task"
echo "   4. Check server logs for email sending activity"
echo "   5. Verify emails are received with project/client names"
echo ""
echo "📚 Documentation:"
echo "   • EMAIL-ENHANCEMENT-SUMMARY.md"
echo "   • EMAIL-NOTIFICATIONS-FIX.md"
echo "   • TEST-EMAIL-NOTIFICATIONS.md"
echo ""






