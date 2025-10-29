#!/bin/bash

echo "🔍 ERP Diagnostic Script"
echo "========================"
echo ""

# Check if server is running
echo "1️⃣ Checking if server is accessible..."
if curl -f -s -o /dev/null -w "%{http_code}" https://abcoafrica.co.za/health | grep -q "200"; then
    echo "✅ Server is UP (https://abcoafrica.co.za/health returns 200)"
else
    echo "❌ Server is DOWN or health endpoint not working"
fi
echo ""

# Test API authentication
echo "2️⃣ Testing API endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://abcoafrica.co.za/api/clients)
echo "   Response code: $HTTP_CODE"
if [ "$HTTP_CODE" = "401" ]; then
    echo "   ✅ API responding (401 = auth required, which is expected)"
elif [ "$HTTP_CODE" = "500" ]; then
    echo "   ❌ API ERROR 500 - Server-side error"
elif [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ API responding successfully"
else
    echo "   ⚠️  Unexpected status: $HTTP_CODE"
fi
echo ""

# Check Railway environment
echo "3️⃣ Next steps:"
echo "   - SSH into your Railway deployment"
echo "   - Check server logs: railway logs"
echo "   - Verify DATABASE_URL is set: railway vars"
echo "   - Test database connection manually"
echo ""

echo "💡 Quick fix commands:"
echo "   railway logs --tail 100     # View recent logs"
echo "   railway vars                # List environment variables"
echo "   railway restart             # Restart the service"
