#!/bin/bash

# Railway OpenSSL Fix Deployment Script
echo "🔧 Starting Railway OpenSSL fix deployment..."

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

echo "🔧 Fixing Prisma OpenSSL compatibility..."

# Generate Prisma client with correct binary targets
echo "🔨 Regenerating Prisma client for Railway..."
npx prisma generate

# Set environment variables
echo "🔑 Setting up environment variables..."
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set NODE_ENV="production"
railway variables set APP_URL="https://abco-erp-2-production.up.railway.app"

echo "✅ Environment variables set"

# Deploy the fix
echo "🚀 Deploying OpenSSL fix to Railway..."
railway up

echo "⏳ Waiting for deployment to complete..."
sleep 30

# Run database migration
echo "🗄️ Running database migration..."
railway run npx prisma db push

# Run the login fix script
echo "🔧 Running login fix script..."
railway run node fix-railway-login.js

echo "✅ Railway OpenSSL fix deployment completed!"
echo ""
echo "📧 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🌐 Your app should now be accessible at:"
echo "   https://abco-erp-2-production.up.railway.app"
