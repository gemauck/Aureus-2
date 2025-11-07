#!/bin/bash

# Script to run Leave Platform migration when database connection slots are available
# This script will retry until successful or timeout

echo "🔄 Attempting to run Leave Platform database migration..."
echo ""

MAX_RETRIES=10
RETRY_DELAY=30
SUCCESS=false

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i of $MAX_RETRIES..."
    
    ssh root@abcoafrica.co.za << 'ENDSSH'
        cd /var/www/abcotronics-erp
        
        # Try Prisma migration first
        if npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee /tmp/migration.log; then
            echo "✅ Migration successful!"
            exit 0
        else
            ERROR=$(cat /tmp/migration.log)
            if echo "$ERROR" | grep -q "connection slots are reserved"; then
                echo "⚠️ Connection slots full, will retry..."
                exit 1
            else
                echo "❌ Migration failed with error:"
                echo "$ERROR"
                exit 2
            fi
        fi
ENDSSH
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "✅ Migration completed successfully!"
        echo "🎉 Leave Platform database tables have been created!"
        SUCCESS=true
        break
    elif [ $EXIT_CODE -eq 2 ]; then
        echo ""
        echo "❌ Migration failed with non-retryable error"
        echo "Please check the error above and try again manually."
        exit 1
    fi
    
    if [ $i -lt $MAX_RETRIES ]; then
        echo "⏳ Waiting $RETRY_DELAY seconds before retry..."
        sleep $RETRY_DELAY
    fi
done

if [ "$SUCCESS" = false ]; then
    echo ""
    echo "❌ Migration failed after $MAX_RETRIES attempts"
    echo ""
    echo "💡 The database connection slots are still full."
    echo "   You can try running the migration manually later:"
    echo ""
    echo "   ssh root@abcoafrica.co.za"
    echo "   cd /var/www/abcotronics-erp"
    echo "   npx prisma db push --accept-data-loss --skip-generate"
    echo ""
    echo "   Or use the SQL script:"
    echo "   psql \$DATABASE_URL -f migrate-leave-platform.sql"
    exit 1
fi

