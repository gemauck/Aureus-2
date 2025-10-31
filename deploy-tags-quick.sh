#!/bin/bash
# Quick deployment script for tags feature
# This script will commit changes and deploy to production

echo "🚀 Quick Deploy: Tags Feature"
echo "==============================="
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "⚠️  Not a git repository, skipping git steps"
    SKIP_GIT=true
else
    SKIP_GIT=false
fi

# Step 1: Stage and commit changes (if git repo)
if [ "$SKIP_GIT" = false ]; then
    echo "📝 Step 1: Staging changes..."
    git add prisma/schema.prisma
    git add api/tags.js
    git add api/clients/
    git add server.js
    git add src/components/clients/*DetailModal.jsx
    git add migrate-tags.sh
    git add TAGS-*.md
    git add prisma/migrations/MANUAL_TAG_MIGRATION.sql
    git add deploy-tags-feature.sh
    git add deploy-tags-quick.sh
    
    echo ""
    echo "💾 Committing changes..."
    git commit -m "Add tags system for Clients and Leads

- Add Tag and ClientTag models to Prisma schema
- Create tags API endpoints (/api/tags)
- Create client tag association endpoints (/api/clients/[id]/tags)
- Add tag management UI to ClientDetailModal and LeadDetailModal
- Support multiple tags per client/lead
- Color-coded tags with custom colors
- On-the-fly tag creation
- Documentation and migration scripts" || echo "⚠️  Nothing to commit or commit failed"
    echo ""
    
    echo "📤 Pushing to remote..."
    git push origin main || echo "⚠️  Push failed - continue anyway?"
    echo ""
fi

# Step 2: Deploy to server
echo "🚀 Step 2: Deploying to production server..."
echo ""

# Try different server connection methods
if [ -f "deploy-tags-feature.sh" ]; then
    echo "Using deploy-tags-feature.sh script..."
    ./deploy-tags-feature.sh
elif [ -f "deploy-to-server.sh" ]; then
    echo "Using deploy-to-server.sh script..."
    # Modify it to include migration
    ssh root@abcoafrica.co.za << 'ENDSSH'
cd /var/www/abcotronics-erp
git pull origin main
npm install --production
npx prisma generate
npx prisma migrate deploy || npx prisma db push
pm2 restart abcotronics-erp
ENDSSH
else
    echo "⚠️  No deployment script found"
    echo ""
    echo "📋 Manual deployment commands:"
    echo ""
    echo "ssh root@165.22.127.196"
    echo "cd /var/www/abcotronics-erp"
    echo "git pull origin main"
    echo "npm install --production"
    echo "npx prisma generate"
    echo "npx prisma migrate deploy"
    echo "pm2 restart abcotronics-erp"
    echo ""
fi

echo ""
echo "✅ Deployment process completed!"
echo ""

