#!/bin/bash
# Deploy CRITICAL FIX - Reset API Timestamps

echo "🚀 Deploying CRITICAL timestamp reset fix..."
echo ""

cd "$(dirname "$0")"

echo "📝 The Real Problem:"
echo "  - Clearing caches wasn't enough"
echo "  - loadClients() has 30-second throttle (lastApiCallTimestamp)"
echo "  - When returning to page, it skips API call if < 30 seconds"
echo "  - Result: Shows OLD data from React state"
echo ""
echo "✅ The Solution:"
echo "  - Reset lastApiCallTimestamp = 0 after status change"
echo "  - Forces fresh API call when user returns to page"
echo "  - Ensures fresh data always loads"
echo ""

# Commit changes
git add src/components/clients/Clients.jsx
git commit -m "CRITICAL FIX: Reset API timestamps on lead status change

The issue was NOT just cache - it was the API call throttle!

loadClients() has a 30-second throttle that prevents API calls if:
- Less than 30 seconds since last call
- Component already has data

When user changed lead status and navigated away/back within 30s,
loadClients() would skip the API call and use stale React state.

Solution: Reset both API timestamps to 0 after status update.
This forces a fresh API call when user returns to the page.

Changes:
- Set lastApiCallTimestamp = 0 after lead update
- Set lastLeadsApiCallTimestamp = 0 after lead update  
- Added console log for visibility"

echo "✅ Changes committed"
echo ""

# Push to GitHub
echo "⬆️  Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub"
    echo ""
    echo "🔄 Railway will auto-deploy (~2 minutes)"
    echo ""
    echo "📋 Test Sequence After Deployment:"
    echo "  1. Refresh https://abcoafrica.co.za/clients"
    echo "  2. Change lead status: Active → Disinterested"
    echo "  3. Watch console: '🔄 API call timestamps reset'"
    echo "  4. Click Dashboard in sidebar"
    echo "  5. Click back to Clients"
    echo "  6. ✅ Status should be Disinterested!"
    echo ""
    echo "🎯 This WILL fix it - the throttle was the issue!"
else
    echo "❌ Failed to push to GitHub"
    exit 1
fi
