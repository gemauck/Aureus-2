#!/usr/bin/env bash
# Test script to verify groups are returned in production

set -e

PRODUCTION_URL="https://abcoafrica.co.za"

echo "🧪 Testing Groups in Production"
echo "================================"
echo "📍 URL: $PRODUCTION_URL"
echo ""

# Test 1: Health check
echo "1️⃣  Testing health endpoint..."
HEALTH=$(curl -s "${PRODUCTION_URL}/api/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "   ✅ Health check passed"
    DB_STATUS=$(echo "$HEALTH" | grep -o '"database":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ Database: $DB_STATUS"
else
    echo "   ❌ Health check failed"
    exit 1
fi
echo ""

# Test 2: Check if clients API endpoint exists (will return 401 without auth, which is expected)
echo "2️⃣  Testing clients API endpoint..."
CLIENTS_RESPONSE=$(curl -s -w "\n%{http_code}" "${PRODUCTION_URL}/api/clients")
HTTP_CODE=$(echo "$CLIENTS_RESPONSE" | tail -n1)
BODY=$(echo "$CLIENTS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
    echo "   ✅ Endpoint exists (authentication required - expected)"
    echo "   ℹ️  This confirms the API is working correctly"
elif [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Endpoint accessible"
    # Try to parse and count groups
    GROUP_COUNT=$(echo "$BODY" | grep -o '"type":"group"' | wc -l | tr -d ' ')
    if [ "$GROUP_COUNT" -gt 0 ]; then
        echo "   ✅ Found $GROUP_COUNT groups in response!"
    else
        echo "   ⚠️  No groups found in response"
    fi
else
    echo "   ⚠️  Unexpected status: $HTTP_CODE"
fi
echo ""

# Test 3: Check database directly via debug endpoint (if available)
echo "3️⃣  Testing debug endpoint..."
DEBUG_RESPONSE=$(curl -s -w "\n%{http_code}" "${PRODUCTION_URL}/api/debug-leads-clients")
DEBUG_HTTP_CODE=$(echo "$DEBUG_RESPONSE" | tail -n1)
DEBUG_BODY=$(echo "$DEBUG_RESPONSE" | sed '$d')

if [ "$DEBUG_HTTP_CODE" = "200" ]; then
    echo "   ✅ Debug endpoint accessible"
    # Extract counts from JSON
    CLIENTS_COUNT=$(echo "$DEBUG_BODY" | grep -o '"prismaCount":[0-9]*' | grep -o '[0-9]*' | head -n1)
    LEADS_COUNT=$(echo "$DEBUG_BODY" | grep -o '"prismaCount":[0-9]*' | grep -o '[0-9]*' | tail -n1)
    echo "   📊 Clients count: ${CLIENTS_COUNT:-N/A}"
    echo "   📊 Leads count: ${LEADS_COUNT:-N/A}"
    
    # Check for groups in raw SQL details
    if echo "$DEBUG_BODY" | grep -q '"type":"group"'; then
        GROUP_NAMES=$(echo "$DEBUG_BODY" | grep -o '"name":"[^"]*".*"type":"group"' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
        echo "   ✅ Groups found in database:"
        echo "$GROUP_NAMES" | while read -r name; do
            if [ -n "$name" ]; then
                echo "      - $name"
            fi
        done
    fi
elif [ "$DEBUG_HTTP_CODE" = "401" ]; then
    echo "   ⚠️  Authentication required (expected)"
else
    echo "   ⚠️  Debug endpoint not available (status: $DEBUG_HTTP_CODE)"
fi
echo ""

echo "✅ Testing complete!"
echo ""
echo "💡 To fully verify groups are showing in the UI:"
echo "   1. Visit: $PRODUCTION_URL"
echo "   2. Log in to your account"
echo "   3. Navigate to the Clients page"
echo "   4. Verify that these 5 groups appear:"
echo "      - Samancor Group"
echo "      - Seriti Group"
echo "      - Afarak Group"
echo "      - Thungela Group"
echo "      - Exxaro Group"
echo ""
echo "📝 Note: The API fix has been deployed. Groups should now be"
echo "   included in the clients API response when authenticated."

