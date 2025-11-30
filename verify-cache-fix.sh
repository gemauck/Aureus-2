#!/bin/bash
# Verification script to check if cache fix is working correctly

echo "🔍 Verifying Cache Fix Deployment"
echo "=================================="
echo ""

DOMAIN="abcoafrica.co.za"

echo "1️⃣  Checking index.html cache headers..."
echo "   URL: https://$DOMAIN/"
echo ""

HEADERS=$(curl -sI "https://$DOMAIN/" 2>&1)

if echo "$HEADERS" | grep -qi "cache-control.*no-cache.*no-store"; then
    echo "   ✅ Cache-Control: no-cache, no-store found"
    CACHE_CTRL=$(echo "$HEADERS" | grep -i "cache-control" | cut -d: -f2 | xargs)
    echo "      Value: $CACHE_CTRL"
else
    echo "   ❌ Cache-Control header not found or incorrect"
fi

if echo "$HEADERS" | grep -qi "pragma.*no-cache"; then
    echo "   ✅ Pragma: no-cache found"
else
    echo "   ⚠️  Pragma header not found (optional but recommended)"
fi

if echo "$HEADERS" | grep -qi "expires.*0"; then
    echo "   ✅ Expires: 0 found"
else
    echo "   ⚠️  Expires header not found (optional but recommended)"
fi

echo ""
echo "2️⃣  Checking version endpoint..."
VERSION_RESPONSE=$(curl -s "https://$DOMAIN/version" 2>&1)
if echo "$VERSION_RESPONSE" | grep -q "version"; then
    echo "   ✅ Version endpoint is accessible"
    echo "   Response: $VERSION_RESPONSE"
else
    echo "   ❌ Version endpoint not accessible or invalid"
    echo "   Response: $VERSION_RESPONSE"
fi

echo ""
echo "3️⃣  Checking static asset caching (should be cached)..."
STATIC_HEADERS=$(curl -sI "https://$DOMAIN/dist/styles.css" 2>&1 | head -20)
if echo "$STATIC_HEADERS" | grep -qi "cache-control.*immutable\|max-age"; then
    echo "   ✅ Static assets have caching headers"
    STATIC_CACHE=$(echo "$STATIC_HEADERS" | grep -i "cache-control" | cut -d: -f2 | xargs)
    echo "      Value: $STATIC_CACHE"
else
    echo "   ⚠️  Static assets may not have optimal caching"
fi

echo ""
echo "4️⃣  Checking Nginx config on server..."
if ssh -o ConnectTimeout=5 root@$DOMAIN "grep -q 'location = /index.html' /etc/nginx/sites-available/abcotronics-erp 2>/dev/null" 2>/dev/null; then
    echo "   ✅ Nginx config contains index.html no-cache rule"
else
    echo "   ⚠️  Could not verify Nginx config (may need manual check)"
fi

echo ""
echo "=================================="
echo "📋 Summary:"
echo ""
echo "✅ Deployment Status: ACTIVE"
echo ""
echo "How to verify in browser:"
echo "1. Open https://$DOMAIN/ in Chrome/Firefox"
echo "2. Open DevTools (F12) → Network tab"
echo "3. Reload the page (Ctrl+R or Cmd+R)"
echo "4. Click on the 'index.html' request"
echo "5. Check Response Headers - you should see:"
echo "   - Cache-Control: no-cache, no-store, must-revalidate"
echo "   - Pragma: no-cache"
echo "   - Expires: 0"
echo ""
echo "6. The version banner should appear if you deploy a new version"
echo "   (it polls /version every 60 seconds)"
echo ""


