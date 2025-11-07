#!/bin/bash

# Retry script for meeting notes database migration
# Use this when database connection slots are available

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🔄 Retrying Meeting Notes Database Migration"
echo "============================================="
echo ""

MAX_ATTEMPTS=10
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "Attempt $ATTEMPT of $MAX_ATTEMPTS..."
    
    ssh $SERVER << ENDSSH
set -e

cd $APP_DIR

echo "🚀 Applying database migration..."
npx prisma db push --skip-generate

if [ $? -eq 0 ]; then
    echo "✅ Migration successful!"
    echo ""
    echo "🔄 Restarting application..."
    pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
    echo "✅ Application restarted"
    exit 0
else
    echo "❌ Migration failed - connection slots may still be full"
    exit 1
fi
ENDSSH

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Migration completed successfully!"
        echo "🌐 Test at: https://abcoafrica.co.za → Teams → Management → Meeting Notes"
        exit 0
    fi
    
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        echo "⏳ Waiting 30 seconds before retry..."
        sleep 30
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
done

echo ""
echo "❌ Migration failed after $MAX_ATTEMPTS attempts"
echo "Database connection slots may be full. Please try again later."

