#!/bin/bash
# Test resend invitation endpoint directly

echo "🧪 Testing Resend Invitation Endpoint"
echo "======================================"
echo ""

# You need to provide:
# 1. A valid invitation ID from the database
# 2. A valid JWT token

INVITATION_ID="$1"
TOKEN="$2"

if [ -z "$INVITATION_ID" ] || [ -z "$TOKEN" ]; then
    echo "Usage: $0 <invitation_id> <jwt_token>"
    echo ""
    echo "To get an invitation ID:"
    echo "  ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && psql \$DATABASE_URL -c \"SELECT id, email FROM \\\"Invitation\\\" WHERE status = '\''pending'\'' LIMIT 1;\"'"
    echo ""
    echo "To get your JWT token:"
    echo "  1. Open browser console on https://abcoafrica.co.za"
    echo "  2. Run: window.storage.getToken()"
    echo "  3. Copy the token"
    exit 1
fi

echo "📧 Invitation ID: $INVITATION_ID"
echo "🔑 Token: ${TOKEN:0:20}..."
echo ""
echo "📤 Making POST request to /api/users/invitation/$INVITATION_ID"
echo ""

curl -X POST "https://abcoafrica.co.za/api/users/invitation/$INVITATION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -v 2>&1 | grep -E "(HTTP|success|error|message|emailSent)"

echo ""
echo "✅ Test complete"







