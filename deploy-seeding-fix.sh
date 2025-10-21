#!/bin/bash

# 🚀 DEPLOY AUTO-SEEDING FIX TO PRODUCTION
echo "🚀 Deploying auto-seeding fix to production..."
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "database-seed-clients.js" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found project directory"

# Check if Railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

echo "✅ Railway CLI found"

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway first:"
    echo "   railway login"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Railway authentication confirmed"

# Link to the correct project
echo "🔗 Linking to Railway project..."
railway link

# Deploy the changes
echo "📦 Deploying changes to production..."
railway up

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================="
echo "✅ Auto-seeding fix deployed to production"
echo "✅ RGN and Exxaro will no longer auto-recreate"
echo ""
echo "🧪 Test the fix:"
echo "1. Go to: https://abco-erp-2-production.up.railway.app"
echo "2. Delete RGN (Lead) and Exxaro (Client)"
echo "3. Refresh the page - they should stay deleted!"
echo ""
echo "💡 If you need to recreate them manually, use:"
echo "   window.seedClientsAndLeads() in browser console"
