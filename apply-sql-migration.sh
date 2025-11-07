#!/bin/bash

# Apply SQL migration directly to database
# Use this when Prisma migration fails due to connection issues

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Applying SQL Migration for Meeting Notes"
echo "============================================="
echo ""

# Copy SQL file to server
echo "📤 Copying SQL file to server..."
scp create-meeting-notes-tables.sql $SERVER:/tmp/

echo ""
echo "🔌 Applying migration on server..."
ssh $SERVER << ENDSSH
set -e

cd $APP_DIR

# Load environment variables from .env
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

echo "📝 Applying SQL migration..."
if [ -n "\$DATABASE_URL" ]; then
    echo "✅ DATABASE_URL loaded"
    psql "\$DATABASE_URL" -f /tmp/create-meeting-notes-tables.sql
    
    if [ \$? -eq 0 ]; then
        echo "✅ SQL migration applied successfully!"
        
        echo ""
        echo "🔍 Verifying tables were created..."
        psql "\$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%Meeting%' ORDER BY table_name;"
        
        echo ""
        echo "🔄 Regenerating Prisma client..."
        npx prisma generate
        
        echo ""
        echo "🔄 Restarting application..."
        pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
        
        echo ""
        echo "✅ Migration complete!"
    else
        echo "❌ SQL migration failed"
        exit 1
    fi
else
    echo "❌ DATABASE_URL not set"
    echo "   Current directory: \$(pwd)"
    echo "   .env file exists: \$([ -f .env ] && echo 'yes' || echo 'no')"
    exit 1
fi
ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "🌐 Test at: https://abcoafrica.co.za"
    echo "   Navigate to: Teams → Management → Meeting Notes"
else
    echo ""
    echo "❌ Migration failed"
    exit 1
fi

