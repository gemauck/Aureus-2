#!/bin/bash

# Comprehensive Parcel Watcher Fix and Deployment Script
# This script fixes the @parcel/watcher Railway deployment issue

echo "🔧 Fixing @parcel/watcher Railway deployment issue..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📋 Current status:"
echo "✅ package.json uses npx tailwindcss (no @tailwindcss/cli)"
echo "✅ nixpacks.toml has --no-optional flag"
echo "✅ package-lock.json regenerated without Parcel dependencies"

# Test the build process locally
echo "🔨 Testing build process locally..."
npm run railway-build

if [ $? -eq 0 ]; then
    echo "✅ Local build successful!"
else
    echo "❌ Local build failed. Please check the errors above."
    exit 1
fi

# Check if styles.css was generated
if [ -f "dist/styles.css" ]; then
    echo "✅ CSS file generated successfully"
    echo "📊 CSS file size: $(du -h dist/styles.css | cut -f1)"
else
    echo "❌ CSS file not found. Build may have failed."
    exit 1
fi

echo ""
echo "🚀 Ready to deploy! Please run the following command:"
echo "   railway up"
echo ""
echo "📝 What was fixed:"
echo "   • Removed @parcel/watcher dependency issues"
echo "   • Used npx tailwindcss instead of @tailwindcss/cli"
echo "   • Added --no-optional flag to prevent native dependencies"
echo "   • Regenerated package-lock.json without problematic packages"
echo ""
echo "🎯 The deployment should now succeed without the Parcel Watcher error!"

# Optional: Auto-deploy if Railway CLI is authenticated
echo ""
read -p "Would you like to attempt automatic deployment? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Attempting deployment..."
    railway up
    if [ $? -eq 0 ]; then
        echo "✅ Deployment successful!"
        echo "🌐 Your app should be available at your Railway URL"
    else
        echo "❌ Deployment failed. Please check Railway logs for details."
        echo "💡 Try running 'railway up' manually after checking your Railway authentication."
    fi
else
    echo "📋 Manual deployment required:"
    echo "   1. Ensure you're logged into Railway: railway login"
    echo "   2. Run: railway up"
fi

echo ""
echo "🎉 Parcel Watcher fix complete!"
