#!/bin/bash
# Apply User schema migration to production database

echo "🔧 Applying User schema migration to production database..."

# Connect to production server and apply migration
ssh root@165.22.127.196 << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "📁 Current directory: $(pwd)"

# Check if database file exists
if [ -f "prisma/dev.db" ]; then
    echo "📊 Applying migration to SQLite database..."
    sqlite3 prisma/dev.db < migrate-user-schema.sql
    echo "✅ SQLite migration applied successfully!"
elif [ -d "prisma" ]; then
    echo "⚠️  Database file not found at prisma/dev.db"
    echo "💡 Attempting Prisma migration (SAFE - no data loss)..."
    
    # Use safe migration wrapper if available
    if [ -f "scripts/safe-db-migration.sh" ]; then
        echo "🔒 Using safe migration wrapper..."
        bash scripts/safe-db-migration.sh npx prisma migrate deploy || bash scripts/safe-db-migration.sh npx prisma db push --skip-generate
    else
        # REMOVED --force-reset which DELETES ALL DATA
        # Use migrate deploy instead which is safe
        npx prisma migrate deploy || npx prisma db push --skip-generate
    fi
    echo "✅ Prisma migration applied!"
else
    echo "❌ Error: prisma directory not found!"
    exit 1
fi

echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Migration complete!"
ENDSSH

echo "✅ Production database updated successfully!"

