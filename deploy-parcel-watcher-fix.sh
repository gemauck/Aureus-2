#!/bin/bash

# Deploy script to test the @parcel/watcher fix
# This script ensures the build process works without native dependencies

echo "🚀 Deploying Abcotronics ERP with @parcel/watcher fix..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Test the build process locally first
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

# Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo "🌐 Your app should be available at your Railway URL"
else
    echo "❌ Deployment failed. Check Railway logs for details."
    exit 1
fi

echo "🎉 Deployment complete!"
