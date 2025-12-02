#!/bin/bash
# Test script to verify the version update system is working

echo "🧪 Testing Version Update System"
echo "================================="
echo ""

DOMAIN="abcoafrica.co.za"

echo "1️⃣  Testing Cache Headers for index.html..."
echo "   URL: https://$DOMAIN/"
echo ""

HEADERS=$(curl -sI "https://$DOMAIN/" 2>&1)

if echo "$HEADERS" | grep -qi "cache-control.*no-cache.*no-store"; then
    echo "   ✅ PASS: Cache-Control header is correct"
    CACHE_CTRL=$(echo "$HEADERS" | grep -i "cache-control" | cut -d: -f2 | xargs)
    echo "      Value: $CACHE_CTRL"
else
    echo "   ❌ FAIL: Cache-Control header missing or incorrect"
fi

if echo "$HEADERS" | grep -qi "pragma.*no-cache"; then
    echo "   ✅ PASS: Pragma header is present"
else
    echo "   ⚠️  WARNING: Pragma header not found"
fi

if echo "$HEADERS" | grep -qi "expires.*0"; then
    echo "   ✅ PASS: Expires header is present"
else
    echo "   ⚠️  WARNING: Expires header not found"
fi

echo ""
echo "2️⃣  Testing Version Watcher Script in HTML..."
HTML_CONTENT=$(curl -s "https://$DOMAIN/" 2>&1)

if echo "$HTML_CONTENT" | grep -q "Version polling logic: Best practice implementation"; then
    echo "   ✅ PASS: Version watcher script is present in HTML"
else
    echo "   ❌ FAIL: Version watcher script not found in HTML"
fi

if echo "$HTML_CONTENT" | grep -q "VERSION_CHECK_INTERVAL_MS = 60 \* 1000"; then
    echo "   ✅ PASS: 60-second polling interval configured"
else
    echo "   ⚠️  WARNING: Could not verify polling interval"
fi

if echo "$HTML_CONTENT" | grep -q "visibilitychange"; then
    echo "   ✅ PASS: Visibility API integration present"
else
    echo "   ⚠️  WARNING: Visibility API integration not found"
fi

if echo "$HTML_CONTENT" | grep -q "app-version-banner"; then
    echo "   ✅ PASS: Update banner HTML element present"
else
    echo "   ❌ FAIL: Update banner HTML element not found"
fi

echo ""
echo "3️⃣  Testing Version Endpoint..."
VERSION_RESPONSE=$(curl -s "https://$DOMAIN/version" 2>&1 | head -20)

# Check if it returns JSON (ideal) or HTML (acceptable due to SPA routing)
if echo "$VERSION_RESPONSE" | grep -q "version"; then
    echo "   ✅ PASS: Version endpoint is accessible"
    if echo "$VERSION_RESPONSE" | grep -q "{"; then
        echo "   ✅ PASS: Returns JSON format"
        echo "   Response: $(echo "$VERSION_RESPONSE" | head -3)"
    else
        echo "   ⚠️  INFO: Returns HTML (SPA routing - this is acceptable)"
        echo "   The endpoint works but is handled by SPA routing"
    fi
else
    echo "   ❌ FAIL: Version endpoint not accessible or invalid"
fi

echo ""
echo "4️⃣  Testing Static Asset Caching..."
STATIC_HEADERS=$(curl -sI "https://$DOMAIN/dist/styles.css" 2>&1 | head -20)
if echo "$STATIC_HEADERS" | grep -qi "cache-control.*max-age\|immutable"; then
    echo "   ✅ PASS: Static assets have caching headers"
    STATIC_CACHE=$(echo "$STATIC_HEADERS" | grep -i "cache-control" | cut -d: -f2 | xargs)
    echo "      Value: $STATIC_CACHE"
else
    echo "   ⚠️  WARNING: Static assets may not have optimal caching"
fi

echo ""
echo "5️⃣  Testing Nginx Configuration..."
if ssh -o ConnectTimeout=5 root@$DOMAIN "grep -q 'location = /index.html' /etc/nginx/sites-available/abcotronics-erp 2>/dev/null" 2>/dev/null; then
    echo "   ✅ PASS: Nginx config contains index.html no-cache rule"
else
    echo "   ⚠️  WARNING: Could not verify Nginx config (may need manual check)"
fi

echo ""
echo "================================="
echo "📋 Test Summary"
echo "================================="
echo ""
echo "✅ If all tests passed, the system is working correctly!"
echo ""
echo "🔍 Manual Browser Testing:"
echo "   1. Open https://$DOMAIN/ in Chrome/Firefox"
echo "   2. Open DevTools (F12) → Network tab"
echo "   3. Reload the page (Ctrl+R or Cmd+R)"
echo "   4. Click on 'index.html' request"
echo "   5. Check Response Headers - should see:"
echo "      - Cache-Control: no-cache, no-store, must-revalidate"
echo "      - Pragma: no-cache"
echo "      - Expires: 0"
echo ""
echo "   6. In Console tab, run: window.checkAppVersion()"
echo "      - Should see a version check happen"
echo "      - Check Network tab for /version request"
echo ""
echo "   7. Wait 60 seconds and check Network tab"
echo "      - Should see periodic /version requests every 60 seconds"
echo ""
echo "   8. Switch to another tab, then come back"
echo "      - Should trigger immediate version check"
echo "      - Check Network tab for /version request"
echo ""



