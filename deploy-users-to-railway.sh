#!/bin/bash

# 🚀 Railway Auto-Deploy Script
echo "🚀 Triggering Railway Production Deployment..."
echo "=============================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
railway whoami || railway login

# Deploy to production
echo "🚀 Deploying to Railway production..."
railway up --service production

echo ""
echo "✅ DEPLOYMENT TRIGGERED!"
echo "======================="
echo "🌐 Your app will be available at:"
echo "   https://abco-erp-2-production.up.railway.app/"
echo ""
echo "🔑 Updated Login Credentials:"
echo "   Email: admin@abcotronics.co.za"
echo "   Password: admin123"
echo ""
echo "   Email: darrenm@abcotronics.co.za (Admin)"
echo "   Password: 12345"
echo ""
echo "   Email: garethm@abcotronics.co.za"
echo "   Password: GazMauck1989*"
echo ""
echo "   Email: David@abcotronics.co.za"
echo "   Password: 12345"
echo ""
echo "📊 NEW FEATURES DEPLOYED:"
echo "✅ User Management System"
echo "✅ Admin User Creation"
echo "✅ Login/Logout Functionality"
echo "✅ User Role Management"
echo "✅ User Invitation System"
echo ""
echo "🧪 TEST THE DEPLOYMENT:"
echo "1. Wait 2-3 minutes for deployment to complete"
echo "2. Visit: https://abco-erp-2-production.up.railway.app/"
echo "3. Login with any of the credentials above"
echo "4. Navigate to 'Users' in the sidebar"
echo "5. Verify all users are displayed"
echo "6. Test logout functionality"
echo ""
echo "🎉 User Management is now live in production!"
