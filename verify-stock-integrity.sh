#!/bin/bash
# Verify Stock Management Integrity on Server

echo "🔍 Verifying Stock Management Integrity..."
echo "=========================================="

SERVER="root@165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo ""
echo "1️⃣ Checking API endpoints..."
ssh $SERVER "cd $APP_DIR && curl -s -o /dev/null -w '%{http_code}' https://abcoafrica.co.za/api/manufacturing/inventory | grep -q 200 && echo '✅ Inventory API: OK' || echo '❌ Inventory API: FAILED'"

echo ""
echo "2️⃣ Checking recent logs for stock operations..."
ssh $SERVER "cd $APP_DIR && pm2 logs abcotronics-erp --lines 20 --nostream | grep -E '📦|📉|Allocated|Deducted|Transaction' | tail -10"

echo ""
echo "3️⃣ Checking for transaction errors..."
ERRORS=$(ssh $SERVER "cd $APP_DIR && pm2 logs abcotronics-erp --lines 100 --nostream | grep -c 'Transaction already closed' || echo 0")
if [ "$ERRORS" -eq "0" ]; then
    echo "✅ No transaction errors found"
else
    echo "❌ Found $ERRORS transaction errors"
fi

echo ""
echo "4️⃣ Verifying Prisma client..."
ssh $SERVER "cd $APP_DIR && npm list @prisma/client 2>&1 | grep -q '@prisma/client' && echo '✅ Prisma Client: Installed' || echo '❌ Prisma Client: Missing'"

echo ""
echo "5️⃣ Checking application status..."
ssh $SERVER "cd $APP_DIR && pm2 status | grep abcotronics-erp"

echo ""
echo "=========================================="
echo "✅ Integrity check complete"

