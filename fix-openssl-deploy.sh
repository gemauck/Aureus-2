#!/bin/bash

echo "🚀 Deploying Railway OpenSSL Fix for Database Operations..."

# Update Prisma configuration
echo "🔧 Updating Prisma configuration..."
npx prisma generate

# Build CSS
echo "🎨 Building CSS..."
npm run build:css

# Create deployment trigger
echo "📝 Creating deployment trigger..."
echo "OpenSSL fix deployment $(date)" > deploy-trigger-$(date +%s).txt

# Commit changes
echo "📦 Committing changes..."
git add .
git commit -m "Fix: Railway OpenSSL compatibility for database operations

- Updated nixpacks.toml with proper OpenSSL configuration
- Fixed Prisma schema binary targets for Railway
- Added Prisma generation steps to build process
- Resolved libssl.so.1.1 compatibility issues

Fixes:
- Database connection failures on Railway
- 404 errors on API endpoints
- Client and lead save/delete operations
- Prisma engine compatibility issues"

echo "✅ Changes committed. Push to trigger Railway deployment:"
echo "git push origin main"

echo "🔍 Monitor deployment at: https://railway.app/dashboard"
echo "📊 Check logs for successful Prisma client initialization"
