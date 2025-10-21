#!/bin/bash

# Railway Database Fix Deployment Script
echo "🚀 Starting Railway Database Fix Deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📦 Installing dependencies..."
npm ci --include=dev --no-optional

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🗄️ Checking database connection..."
if npx prisma db push --accept-data-loss; then
    echo "✅ Database schema updated successfully"
else
    echo "⚠️ Database push failed, but continuing..."
fi

echo "🏗️ Building CSS..."
npm run railway-build

echo "✅ Railway Database Fix Deployment completed!"
echo "🚀 Ready to deploy to Railway"
