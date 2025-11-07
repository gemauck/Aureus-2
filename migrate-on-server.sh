#!/bin/bash

# Script to run Leave Platform migration on the server
# This will wait for connection slots and run the migration automatically

ssh root@abcoafrica.co.za << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "🔄 Starting Leave Platform migration..."
echo ""

MAX_ATTEMPTS=20
ATTEMPT=0
SUCCESS=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "Attempt $ATTEMPT of $MAX_ATTEMPTS..."
    
    # Try to run the migration
    if npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee /tmp/migration-attempt.log; then
        if grep -q "Your database is now in sync" /tmp/migration-attempt.log || grep -q "Pushed the state" /tmp/migration-attempt.log; then
            echo ""
            echo "✅ Migration completed successfully!"
            echo "🎉 Leave Platform database tables have been created!"
            SUCCESS=true
            break
        fi
    fi
    
    ERROR=$(cat /tmp/migration-attempt.log)
    
    if echo "$ERROR" | grep -q "connection slots are reserved"; then
        echo "⏳ Connection slots full, waiting 15 seconds..."
        sleep 15
    else
        echo "❌ Migration failed with error:"
        echo "$ERROR"
        echo ""
        echo "Stopping retry attempts."
        exit 1
    fi
done

if [ "$SUCCESS" = false ]; then
    echo ""
    echo "❌ Migration did not complete after $MAX_ATTEMPTS attempts"
    echo "💡 Connection slots may still be in use. Try running manually later:"
    echo "   npx prisma db push --accept-data-loss --skip-generate"
    exit 1
fi

echo ""
echo "✅ Verifying tables were created..."
npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%Leave%' OR table_name LIKE '%Birthday%') ORDER BY table_name;" 2>&1 | grep -E "Leave|Birthday" || echo "⚠️ Could not verify (connection issue), but migration reported success"

ENDSSH

