#!/bin/bash
# CRITICAL FIX - Deploy immediately to fix content disappearing below 766px

echo "🚨 CRITICAL FIX - Deploying content visibility fix..."
echo ""
echo "This fixes the issue where all functionality disappears below 766px width"
echo ""

# Check if Railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "⚠️  Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login check
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

echo ""
echo "📦 Files being deployed:"
echo "  - mobile-critical-fix.css (new critical fix)"
echo "  - index.html (updated to load critical fix)"
echo ""
echo "🎯 What this fixes:"
echo "  ✓ Content visible at all screen widths"
echo "  ✓ Main container properly sized"
echo "  ✓ Sidebar doesn't push content off screen"
echo "  ✓ All components visible below 766px"
echo "  ✓ Proper flex/grid layout at narrow widths"
echo ""

# Auto-deploy without confirmation since this is critical
echo "🔄 Deploying critical fix now..."
echo ""

railway up --detach

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ CRITICAL FIX DEPLOYED!"
    echo ""
    echo "🧪 Test immediately:"
    echo "  1. Open site in browser"
    echo "  2. Open DevTools (F12)"
    echo "  3. Resize window below 766px width"
    echo "  4. Verify all content is visible"
    echo "  5. Check users page works properly"
    echo ""
    echo "💡 IMPORTANT: Hard refresh to see changes"
    echo "   Press: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
    echo ""
    echo "✅ You should now see:"
    echo "   - All content visible at any width"
    echo "   - Header and menu working"
    echo "   - No disappearing functionality"
    echo "   - Proper scrolling"
    echo ""
else
    echo ""
    echo "❌ Deployment failed. Check error messages above."
    echo ""
    echo "Quick fixes:"
    echo "  1. Check Railway authentication: railway login"
    echo "  2. Verify you're in the right project"
    echo "  3. Check internet connection"
    echo ""
    exit 1
fi
