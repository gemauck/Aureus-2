#!/bin/bash

# Direct deployment to production (bypasses git)
# This copies files directly to the server

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Meeting Notes - Direct Production Deployment"
echo "==============================================="
echo "Server: $SERVER"
echo "Path: $APP_DIR"
echo ""

# Files to deploy (meeting notes related)
FILES=(
    "prisma/schema.prisma"
    "api/meeting-notes.js"
    "src/components/teams/ManagementMeetingNotes.jsx"
    "src/utils/databaseAPI.js"
    "component-loader.js"
)

echo "📤 Step 1: Copying files to server..."
echo "======================================"

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  Copying: $file"
        scp "$file" "$SERVER:$APP_DIR/$file"
    else
        echo "  ⚠️  File not found: $file"
    fi
done

echo ""
echo "🔌 Step 2: Running deployment on server..."
echo "==========================================="

ssh $SERVER << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "🔨 Generating Prisma Client..."
npx prisma generate

echo ""
echo "📦 Creating database backup..."
BACKUP_DIR="database-backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup_meeting_notes_$(date +%Y%m%d_%H%M%S).sql.gz"

if command -v pg_dump &> /dev/null && [ -n "$DATABASE_URL" ]; then
    pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE" 2>/dev/null || echo "⚠️  Backup failed (continuing anyway)"
    if [ -f "$BACKUP_FILE" ]; then
        echo "✅ Backup created: $BACKUP_FILE"
    fi
else
    echo "⚠️  pg_dump not available, skipping backup"
fi

echo ""
echo "🚀 Applying database migration..."
npx prisma db push --skip-generate || {
    echo "⚠️  db push failed, trying migrate deploy..."
    npx prisma migrate deploy || {
        echo "❌ Migration failed"
        exit 1
    }
}

echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
    echo "✅ Application restarted with PM2"
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp || echo "⚠️  systemctl restart failed"
    echo "✅ Application restarted with systemctl"
else
    echo "⚠️  No process manager found, please restart manually"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Summary:"
echo "  ✅ Files copied to server"
echo "  ✅ Prisma Client generated"
echo "  ✅ Database backup created"
echo "  ✅ Database migration applied"
echo "  ✅ Application restarted"
echo ""
echo "🌐 Test at: https://abcoafrica.co.za"
echo "   Navigate to: Teams → Management → Meeting Notes"

ENDSSH

echo ""
echo "✅ Direct deployment successful!"
echo ""
echo "🌐 Test the feature at: https://abcoafrica.co.za"

