#!/bin/bash
# Retry script to run helpdesk migration when database connections become available

echo "🔄 Attempting to create Ticket table..."
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
    
    # Try to create the table
    npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee /tmp/migration-attempt.log
    EXIT_CODE=${PIPESTATUS[0]}
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "✅ SUCCESS! Ticket table created!"
        echo "🔄 Regenerating Prisma client..."
        npx prisma generate
        echo "🔄 Restarting application..."
        pm2 restart abcotronics-erp
        echo ""
        echo "✅ Helpdesk module is now ready!"
        exit 0
    else
        if grep -q "connection slots" /tmp/migration-attempt.log; then
            echo "⏳ Database connections still full. Waiting ${WAIT_TIME}s before retry..."
            sleep $WAIT_TIME
        else
            echo "❌ Migration failed with different error. Check logs above."
            cat /tmp/migration-attempt.log
            exit 1
        fi
    fi
done

echo ""
echo "❌ Failed to create table after $MAX_ATTEMPTS attempts."
echo "💡 The database may be under heavy load. Try again later or check for connection leaks."
exit 1
ENDSSH

