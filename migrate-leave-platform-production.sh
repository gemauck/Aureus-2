#!/bin/bash

# Migration script for Leave Platform on production server
# This script will retry if connection slots are full

echo "🚀 Starting Leave Platform migration on production server..."
echo ""

MAX_RETRIES=5
RETRY_DELAY=10

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i of $MAX_RETRIES..."
    
    ssh root@abcoafrica.co.za << 'EOF'
        cd /var/www/abcotronics-erp
        
        # Try to run the migration
        if npx prisma db push --accept-data-loss --skip-generate 2>&1 | tee /tmp/migration.log; then
            echo "✅ Migration successful!"
            exit 0
        else
            ERROR=$(cat /tmp/migration.log)
            if echo "$ERROR" | grep -q "connection slots are reserved"; then
                echo "⚠️ Connection slots full, will retry..."
                exit 1
            else
                echo "❌ Migration failed with error: $ERROR"
                exit 2
            fi
        fi
EOF
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Migration completed successfully!"
        exit 0
    elif [ $EXIT_CODE -eq 2 ]; then
        echo "❌ Migration failed with non-retryable error"
        exit 1
    fi
    
    if [ $i -lt $MAX_RETRIES ]; then
        echo "⏳ Waiting $RETRY_DELAY seconds before retry..."
        sleep $RETRY_DELAY
    fi
done

echo "❌ Migration failed after $MAX_RETRIES attempts"
echo "💡 You may need to wait for database connections to free up, or run the migration manually later"
exit 1

