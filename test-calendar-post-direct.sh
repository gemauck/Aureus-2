#!/bin/bash
# Direct test of calendar POST endpoint

echo "🧪 Testing Calendar POST endpoint directly..."
echo ""

# Get a test token first (you'll need to replace with a real token)
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
    echo "Usage: $0 <JWT_TOKEN>"
    echo ""
    echo "To get a token:"
    echo "1. Log in to the app"
    echo "2. Open browser console"
    echo "3. Run: localStorage.getItem('abcotronics_token')"
    exit 1
fi

DATE=$(date +%Y-%m-%d)
NOTE="Test note from curl at $(date)"

echo "📅 Test Date: $DATE"
echo "📝 Test Note: $NOTE"
echo ""

curl -X POST http://localhost:3000/api/calendar-notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"date\": \"$DATE\", \"note\": \"$NOTE\"}" \
  -v

echo ""
echo "✅ Test complete"
