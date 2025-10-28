#!/bin/bash
# Deploy Cache Fix for Lead Status Updates

echo "🚀 Deploying cache fix for lead status persistence..."
echo ""

# Navigate to project directory
cd "$(dirname "$0")"

echo "📝 Changes being deployed:"
echo "  1. Enhanced databaseAPI-new.js cache clearing"
echo "  2. Added cache-manager.js utility for manual cache control"
echo "  3. Force refresh now bypasses all caches with timestamp"
echo ""

# Check if git is dirty
if [[ $(git status --porcelain) ]]; then
    echo "📦 Committing changes..."
    git add src/utils/databaseAPI-new.js
    git add src/utils/cache-manager.js
    git add index.html
    git commit -m "Fix: Enhanced cache clearing for lead status updates

- Clear entire cache after lead updates to prevent stale data
- Add timestamp to force refresh queries to bypass all caching layers
- Add cache-manager.js utility for manual cache control
- Expose clearAllCaches() and checkCacheState() functions"
    
    echo "✅ Changes committed"
else
    echo "ℹ️  No changes to commit"
fi

# Push to GitHub
echo ""
echo "⬆️  Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub"
else
    echo "❌ Failed to push to GitHub"
    exit 1
fi

echo ""
echo "🔄 Railway will auto-deploy from GitHub..."
echo ""
echo "📋 Post-deployment steps:"
echo "  1. Wait for Railway deployment to complete (~2 minutes)"
echo "  2. Open https://abcoafrica.co.za/clients"
echo "  3. Open browser console (F12)"
echo "  4. Run: clearAllCaches()"
echo "  5. Refresh the page"
echo "  6. Test lead status changes"
echo ""
echo "💡 Cache utilities available in console:"
echo "  - clearAllCaches() - Clear all caches"
echo "  - checkCacheState() - View current cache state"
echo ""
echo "✅ Deployment initiated successfully!"
