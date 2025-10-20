#!/bin/bash

# Railway Deployment Script
echo "🚀 Starting Railway deployment process..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway first:"
    echo "   railway login"
    exit 1
fi

echo "✅ Railway CLI ready"

# Create or link to Railway project
echo "🔗 Linking to Railway project..."
railway link

# Set environment variables
echo "🔧 Setting environment variables..."
railway variables set JWT_SECRET="your-super-secret-jwt-key-change-this-in-production-$(date +%s)"
railway variables set NODE_ENV="production"

echo "📦 Deploying to Railway..."
railway up

echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Add PostgreSQL database in Railway dashboard"
echo "2. Run database migrations: railway run npx prisma migrate deploy"
echo "3. Test your API endpoints"
echo ""
echo "Your app will be available at: https://your-project-name-production.up.railway.app"