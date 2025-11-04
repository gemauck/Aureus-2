#!/bin/bash
# Deploy Mobile Refresh 2025 - Complete mobile optimization overhaul

echo "🚀 Deploying Mobile Refresh 2025..."
echo ""

# Check if Railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "⚠️  Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login check
echo "📋 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

echo ""
echo "📦 Files being deployed:"
echo "  - mobile-refresh-2025.css (new mobile stylesheet)"
echo "  - index.html (updated with new CSS link)"
echo ""

# Confirm deployment
read -p "Deploy mobile refresh to production? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔄 Deploying to Railway..."
    echo ""
    
    # Deploy using Railway
    railway up --detach
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Mobile Refresh 2025 deployed successfully!"
        echo ""
        echo "📱 Mobile improvements include:"
        echo "  ✓ Fixed header and navigation"
        echo "  ✓ Fullscreen mobile modals"
        echo "  ✓ Touch-friendly forms (52px inputs)"
        echo "  ✓ Single column layouts"
        echo "  ✓ Better button spacing"
        echo "  ✓ Sticky page headers"
        echo "  ✓ No horizontal scroll"
        echo "  ✓ Dark mode optimizations"
        echo ""
        echo "🌐 Test your mobile experience:"
        echo "  1. Open site on mobile device"
        echo "  2. Test forms, modals, and navigation"
        echo "  3. Check all pages for proper layout"
        echo ""
        echo "💡 Pro tip: Clear browser cache (Cmd+Shift+R) to see changes"
        echo ""
    else
        echo ""
        echo "❌ Deployment failed. Check the error messages above."
        exit 1
    fi
else
    echo ""
    echo "❌ Deployment cancelled"
    exit 0
fi
