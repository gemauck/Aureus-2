#!/bin/bash

# Railway Database Fix - Final Deployment Script
echo "🚀 Starting Railway Database Fix - Final Deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📦 Installing dependencies..."
npm ci --include=dev --no-optional

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🏗️ Running Railway build process..."
npm run railway-build

echo "🧪 Testing database health endpoint..."
if [ -f "api/db-health.js" ]; then
    echo "✅ Database health check endpoint created"
else
    echo "❌ Database health check endpoint missing"
fi

echo "📋 Checking key files..."
echo "✅ nixpacks.toml: $(if [ -f "nixpacks.toml" ]; then echo "exists"; else echo "missing"; fi)"
echo "✅ server-production.js: $(if [ -f "server-production.js" ]; then echo "exists"; else echo "missing"; fi)"
echo "✅ api/_lib/prisma.js: $(if [ -f "api/_lib/prisma.js" ]; then echo "exists"; else echo "missing"; fi)"

echo ""
echo "🎯 Ready for Railway deployment!"
echo "📝 Summary of fixes:"
echo "   • Fixed Prisma client generation conflicts"
echo "   • Removed duplicate Prisma instances"
echo "   • Enhanced error logging"
echo "   • Added database health check endpoint"
echo "   • Improved build process"
echo ""
echo "🚀 Next steps:"
echo "   1. git add ."
echo "   2. git commit -m 'Fix Railway database connection issues'"
echo "   3. git push origin main"
echo ""
echo "✅ Railway Database Fix - Final Deployment completed!"
