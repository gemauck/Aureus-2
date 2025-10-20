#!/bin/bash

# Production Fixes Deployment Script
# This script deploys critical fixes for the ERP system

echo "🚀 Deploying Production Fixes for ERP System"
echo "=============================================="

# Set working directory
cd "$(dirname "$0")"

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found. Please run from project root."
    exit 1
fi

echo "✅ Found project root directory"

# Check git status
echo "📋 Checking git status..."
git status --porcelain

# Add all changes
echo "📦 Adding all changes to git..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "Fix: Critical production API routing and server configuration fixes

- Fixed API routing logic in server.js to properly handle URL parsing
- Updated all API endpoints (leads, projects, invoices, time-entries) to work with corrected URL parsing
- Improved static file serving configuration
- Fixed storage function availability issues
- Enhanced error handling and logging

Fixes:
- API endpoints returning HTML instead of JSON
- Missing storage functions (getTeamDocuments, getEmployees, getProjects)
- Server static file serving configuration
- URL path parsing inconsistencies"

# Push to main branch
echo "🚀 Pushing to main branch..."
git push origin main

echo ""
echo "✅ Production fixes deployed successfully!"
echo ""
echo "🔧 Changes made:"
echo "  - Fixed API routing in server.js"
echo "  - Updated URL parsing in all API endpoints"
echo "  - Improved static file serving"
echo "  - Enhanced error handling"
echo ""
echo "🌐 The application should now work correctly in production."
echo "📊 Check the Railway logs to verify the fixes are working."
echo ""
echo "Next steps:"
echo "  1. Monitor Railway deployment logs"
echo "  2. Test API endpoints in production"
echo "  3. Verify dashboard functionality"
echo "  4. Check storage functions availability"