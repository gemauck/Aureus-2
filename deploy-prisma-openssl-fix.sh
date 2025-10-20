#!/bin/bash

# Railway Prisma OpenSSL Fix Deployment Script
echo "🚀 Deploying Railway Prisma OpenSSL Fix..."

# Force regenerate Prisma client with new binary targets
echo "🔧 Regenerating Prisma client with OpenSSL 3.0.x compatibility..."
npx prisma generate

# Build CSS
echo "🎨 Building CSS..."
npm run build:css

# Create deployment trigger
echo "📝 Creating deployment trigger..."
echo "Prisma OpenSSL fix deployment - $(date)" > deploy-trigger-$(date +%s).txt

# Commit changes
echo "📦 Committing changes..."
git add .
git commit -m "Fix Prisma OpenSSL compatibility for Railway deployment

- Updated nixpacks.toml to include openssl and openssl.dev packages
- Configured Prisma to use linux-musl-openssl-3.0.x binary target
- Added railway.json for proper deployment configuration
- This should resolve the libssl.so.1.1 missing library error"

echo "✅ Changes committed. Push to trigger Railway deployment:"
echo "git push origin main"
echo ""
echo "🔍 Monitor deployment at: https://railway.app/dashboard"
echo "📊 Check logs for successful Prisma client initialization"
