#!/bin/bash

# Railway Login Fix Deployment Script
echo "🔧 Starting Railway login fix deployment..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "Please log in to Railway:"
    railway login
fi

# Set environment variables for Railway
echo "🔑 Setting up environment variables..."
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set NODE_ENV="production"
railway variables set APP_URL="https://abco-erp-2-production.up.railway.app"

echo "✅ Environment variables set"

# Deploy the fix
echo "🚀 Deploying login fix to Railway..."
railway up

echo "⏳ Waiting for deployment to complete..."
sleep 30

# Run the login fix script
echo "🔧 Running login fix script..."
railway run node fix-railway-login.js

echo "✅ Railway login fix deployment completed!"
echo ""
echo "📧 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🌐 Your app should now be accessible at:"
echo "   https://abco-erp-2-production.up.railway.app"
