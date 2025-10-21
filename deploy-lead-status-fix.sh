#!/bin/bash

# Deploy Lead Status Fix Script
# This script deploys the lead status functionality fixes and opportunities improvements

set -e  # Exit on any error

echo "🚀 Starting Lead Status Fix Deployment..."
echo "=========================================="

# Change to project directory
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular

echo "📁 Current directory: $(pwd)"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root directory."
    exit 1
fi

echo "✅ Project directory confirmed"

# Check git status
echo "🔍 Checking git status..."
git status --porcelain

# Add all changes
echo "📝 Adding all changes to git..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "Fix lead status functionality and remove total opportunities

- Fixed lead status dropdown not persisting to database
- Enhanced handleLeadStatusChange with proper API integration
- Added comprehensive error handling and logging
- Fixed data mapping in loadLeads function
- Removed 'Total Opportunities' section from Client Page
- Fixed opportunities display to use title field instead of name
- Updated both desktop and mobile opportunity displays
- Added comprehensive debugging and testing tools"

echo "✅ Changes committed successfully"

# Check if we have a remote repository
if git remote get-url origin >/dev/null 2>&1; then
    echo "🌐 Pushing changes to remote repository..."
    git push origin main
    echo "✅ Changes pushed to remote repository"
else
    echo "⚠️ No remote repository configured, skipping push"
fi

# Check if we're on Railway or have deployment configuration
if [ -f "railway.json" ] || [ -f "railway.toml" ] || [ -n "$RAILWAY_PROJECT_ID" ]; then
    echo "🚂 Railway deployment detected"
    
    # Check if Railway CLI is installed
    if command -v railway >/dev/null 2>&1; then
        echo "🚂 Railway CLI found, triggering deployment..."
        railway up
        echo "✅ Railway deployment triggered"
    else
        echo "⚠️ Railway CLI not found. Please install it or deploy manually."
        echo "   Install with: npm install -g @railway/cli"
        echo "   Then run: railway up"
    fi
else
    echo "📋 No Railway deployment configuration found"
    echo "💡 To deploy manually:"
    echo "   1. Push to your git repository"
    echo "   2. Trigger deployment through your hosting platform"
    echo "   3. Or run: railway up (if using Railway)"
fi

# Summary
echo ""
echo "🎉 Deployment Summary"
echo "===================="
echo "✅ Lead status functionality fixed"
echo "✅ Opportunities display issues resolved"
echo "✅ Changes committed to git"
echo "✅ Ready for deployment"
echo ""
echo "🔧 Changes made:"
echo "   - Fixed lead status dropdown persistence"
echo "   - Removed 'Total Opportunities' section"
echo "   - Fixed opportunities title display"
echo "   - Enhanced error handling and logging"
echo ""
echo "📋 Next steps:"
echo "   1. Test the lead status functionality"
echo "   2. Verify opportunities display correctly"
echo "   3. Monitor deployment logs if applicable"
echo ""
echo "🚀 Deployment script completed successfully!"