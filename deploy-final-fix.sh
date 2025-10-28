#!/bin/bash
# Deploy Final Cache Fix - Clear Both Leads AND Clients Caches

echo "🚀 Deploying final cache fix..."
echo ""

cd "$(dirname "$0")"

echo "📝 Fix Summary:"
echo "  - Clear /clients cache in addition to /leads cache"
echo "  - Since /clients endpoint returns BOTH clients AND leads"
echo "  - This prevents stale lead data from clients cache"
echo ""

# Commit changes
git add src/components/clients/Clients.jsx
git commit -m "Fix: Clear both /clients and /leads caches on lead status update

The /clients API endpoint returns both clients AND leads in its response.
When updating a lead status, we need to clear BOTH caches to prevent
returning stale lead data from the /clients cache endpoint.

This ensures that when users navigate back to the Clients page, they
see the updated lead status instead of cached old data."

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
    echo "📋 After deployment:"
    echo "  1. Refresh https://abcoafrica.co.za/clients"
    echo "  2. Change a lead status"
    echo "  3. Navigate to Dashboard and back"
    echo "  4. ✅ Status should now persist!"
else
    echo "❌ Failed to push to GitHub"
    exit 1
fi
