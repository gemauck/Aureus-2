#!/bin/bash
# Script to check what each user sees from the API
# This will query the server logs to see what's being returned

echo "🔍 Checking server logs for API responses..."
echo ""

# Get recent logs for leads API
echo "📋 Recent /api/leads requests:"
ssh root@abcoafrica.co.za "pm2 logs abcotronics-erp --lines 100 --nostream | grep -E '(Querying leads|Sending.*leads|📤)' | tail -20"

echo ""
echo "📋 Recent /api/clients requests:"
ssh root@abcoafrica.co.za "pm2 logs abcotronics-erp --lines 100 --nostream | grep -E '(Querying.*clients|Sending.*clients|📤)' | tail -20"

