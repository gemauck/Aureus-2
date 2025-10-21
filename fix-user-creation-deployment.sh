#!/bin/bash

# Fix User Creation - Database Provider and OpenSSL Fix
# This script fixes the user creation form failure by resolving database provider mismatch and OpenSSL issues

echo "🔧 Fixing User Creation Form - Database Provider and OpenSSL Issues"
echo "=================================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📋 Current Issues Identified:"
echo "1. Database provider mismatch (SQLite vs PostgreSQL)"
echo "2. Prisma OpenSSL compatibility issues"
echo "3. Missing binary targets for Railway deployment"
echo ""

# Step 1: Regenerate Prisma client with correct configuration
echo "🔄 Step 1: Regenerating Prisma client..."
npx prisma generate

if [ $? -eq 0 ]; then
    echo "✅ Prisma client regenerated successfully"
else
    echo "❌ Failed to regenerate Prisma client"
    exit 1
fi

# Step 2: Build CSS
echo "🔄 Step 2: Building CSS..."
npm run build:css

if [ $? -eq 0 ]; then
    echo "✅ CSS built successfully"
else
    echo "❌ Failed to build CSS"
    exit 1
fi

# Step 3: Commit changes
echo "🔄 Step 3: Committing changes..."
git add .
git commit -m "Fix user creation: Update database provider to PostgreSQL and resolve OpenSSL issues

- Updated prisma/schema.prisma to use PostgreSQL provider
- Added OpenSSL binary targets for Railway deployment
- Fixed JSON field types for PostgreSQL compatibility
- Resolves PrismaClientInitializationError and user creation failures"

if [ $? -eq 0 ]; then
    echo "✅ Changes committed successfully"
else
    echo "❌ Failed to commit changes"
    exit 1
fi

# Step 4: Push to Railway
echo "🔄 Step 4: Deploying to Railway..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Deployment initiated successfully"
    echo ""
    echo "🎉 User Creation Fix Deployed!"
    echo "================================"
    echo ""
    echo "📋 What was fixed:"
    echo "• Database provider changed from SQLite to PostgreSQL"
    echo "• Added OpenSSL binary targets for Railway compatibility"
    echo "• Fixed JSON field types for PostgreSQL"
    echo "• Resolved PrismaClientInitializationError"
    echo ""
    echo "🔍 Expected results:"
    echo "• User creation form should work properly"
    echo "• No more 'libssl.so.1.1' errors in logs"
    echo "• Database operations should function correctly"
    echo ""
    echo "📊 Monitor deployment:"
    echo "• Railway Dashboard: https://railway.app/dashboard"
    echo "• Check logs for successful Prisma initialization"
    echo "• Test user creation form after deployment completes"
    echo ""
    echo "⏱️  Deployment typically takes 2-3 minutes"
else
    echo "❌ Failed to deploy to Railway"
    exit 1
fi

echo ""
echo "🚀 Fix deployment completed!"
