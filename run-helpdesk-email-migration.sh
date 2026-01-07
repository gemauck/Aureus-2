#!/bin/bash
# Script to run helpdesk email fields migration on production server
# Retries if database connections are full

echo "🔄 Attempting to add email fields to Ticket table..."
echo "⏳ This may take several minutes if database connections are full..."

ssh root@abcoafrica.co.za << 'ENDSSH'
cd /var/www/abcotronics-erp

MAX_ATTEMPTS=20
ATTEMPT=0
WAIT_TIME=15

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo ""
    echo "📋 Attempt $ATTEMPT of $MAX_ATTEMPTS..."

    # Try to run migration
    if npx prisma migrate deploy 2>&1 | tee /tmp/migration-attempt.log; then
        echo ""
        echo "✅ SUCCESS! Email fields added to Ticket table!"
        echo "🔄 Regenerating Prisma client..."
        npx prisma generate
        echo "🔄 Restarting application..."
        pm2 restart abcotronics-erp
        echo ""
        echo "✅ Helpdesk email integration is now ready!"
        exit 0
    else
        # Check if the error is due to connection slots
        if grep -q "connection slots" /tmp/migration-attempt.log; then
            echo "⏳ Database connections still full. Waiting ${WAIT_TIME}s before retry..."
            sleep $WAIT_TIME
        else
            echo "❌ Migration failed with different error. Check logs above."
            exit 1
        fi
    fi
done

echo ""
echo "❌ Failed to run migration after $MAX_ATTEMPTS attempts."
echo "💡 The database may be under heavy load. Try again later."
exit 1
ENDSSH

