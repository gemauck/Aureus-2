#!/bin/bash
# NUCLEAR FIX DEPLOYMENT - Most aggressive fix for 766px issue

echo "💥 DEPLOYING NUCLEAR FIX FOR 766PX ISSUE"
echo ""
echo "This is the most aggressive fix possible - forces EVERYTHING visible"
echo ""

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "⚠️  Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Check auth
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

echo ""
echo "📦 Deploying:"
echo "  - mobile-nuclear-fix.css (NUCLEAR option)"
echo "  - index.html (updated)"
echo ""
echo "🎯 This fix:"
echo "  ✓ Forces ALL elements visible"
echo "  ✓ Forces proper width on everything"
echo "  ✓ Removes transforms that hide content"
echo "  ✓ Forces sidebar to fixed position"
echo "  ✓ Forces main to take full width"
echo "  ✓ Adds visible lime border to main (for debugging)"
echo "  ✓ Shows yellow banner when active"
echo ""

# Deploy
echo "🚀 Deploying NOW..."
railway up --detach

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ NUCLEAR FIX DEPLOYED!"
    echo ""
    echo "🧪 HOW TO TEST:"
    echo "  1. Hard refresh: Cmd+Shift+R"
    echo "  2. Resize browser to 765px"
    echo "  3. You should see:"
    echo "     - Yellow banner at top saying 'NUCLEAR FIX ACTIVE'"
    echo "     - Lime green border around main content"
    echo "     - ALL content visible"
    echo ""
    echo "📱 IMPORTANT NOTES:"
    echo "  - The lime border is for debugging (remove it later)"
    echo "  - The yellow banner shows fix is active"
    echo "  - If content is STILL hidden, check browser console"
    echo ""
    echo "🔍 DEBUG COMMANDS:"
    echo ""
    echo "// Check if nuclear fix loaded"
    echo "[...document.styleSheets].forEach(sheet => {"
    echo "  if (sheet.href?.includes('nuclear-fix')) {"
    echo "    console.log('✅ Nuclear fix loaded!');"
    echo "  }"
    echo "});"
    echo ""
    echo "// Check main element"
    echo "const main = document.querySelector('main');"
    echo "console.log('Main:', {"
    echo "  display: getComputedStyle(main).display,"
    echo "  width: getComputedStyle(main).width,"
    echo "  visibility: getComputedStyle(main).visibility,"
    echo "  outline: getComputedStyle(main).outline"
    echo "});"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    exit 1
fi
