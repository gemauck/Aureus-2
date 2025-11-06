#!/bin/bash
# Restore Database to 12:20 PM (Point-in-Time Recovery)
# This script helps restore your DigitalOcean PostgreSQL database to 12:20 PM

set -e

echo "🕐 Database Point-in-Time Restore to 12:20 PM"
echo "=============================================="
echo ""

# Get current date and time
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null || echo "")

# Ask user which date
echo "Which date should we restore to?"
echo "1. Today at 12:20 PM (${TODAY} 12:20)"
if [ -n "$YESTERDAY" ]; then
    echo "2. Yesterday at 12:20 PM (${YESTERDAY} 12:20)"
fi
echo "3. Custom date/time"
read -p "Enter choice (1-3): " DATE_CHOICE

case $DATE_CHOICE in
    1)
        RESTORE_DATE="${TODAY}"
        RESTORE_TIME="12:20:00"
        ;;
    2)
        if [ -n "$YESTERDAY" ]; then
            RESTORE_DATE="${YESTERDAY}"
            RESTORE_TIME="12:20:00"
        else
            echo "❌ Could not calculate yesterday's date"
            exit 1
        fi
        ;;
    3)
        read -p "Enter date (YYYY-MM-DD): " RESTORE_DATE
        read -p "Enter time (HH:MM:SS, default 12:20:00): " RESTORE_TIME
        RESTORE_TIME="${RESTORE_TIME:-12:20:00}"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

RESTORE_TIMESTAMP="${RESTORE_DATE}T${RESTORE_TIME}Z"
echo ""
echo "📅 Target restore time: ${RESTORE_TIMESTAMP} (UTC)"
echo ""

# Check if doctl (DigitalOcean CLI) is installed
if ! command -v doctl &> /dev/null; then
    echo "⚠️  doctl (DigitalOcean CLI) not found"
    echo ""
    echo "📋 Point-in-Time Recovery Instructions:"
    echo ""
    echo "DigitalOcean PostgreSQL supports Point-in-Time Recovery (PITR)."
    echo "To restore to ${RESTORE_TIMESTAMP}:"
    echo ""
    echo "OPTION 1: Via Web Console (Recommended)"
    echo "----------------------------------------"
    echo "1. Go to: https://cloud.digitalocean.com/databases"
    echo "2. Find your database cluster (current: nov-3-backup-nov-3-backup2)"
    echo "3. Click the 'Backups' tab"
    echo "4. Click 'Restore' or 'Point-in-Time Recovery' button"
    echo "5. Select 'Point-in-Time Recovery'"
    echo "6. Enter restore time:"
    echo "   - Date: ${RESTORE_DATE}"
    echo "   - Time: ${RESTORE_TIME} (12:20 PM)"
    echo "   - Timezone: UTC"
    echo "7. Enter a name for the restored database: 'restored-1220pm-${RESTORE_DATE}'"
    echo "8. Click 'Restore'"
    echo ""
    echo "⏱️  Restoration takes 5-15 minutes"
    echo ""
    echo "After restoration completes:"
    echo "1. Get the new connection string from the restored database"
    echo "2. Share it with me to update the production server"
    echo ""
    exit 0
fi

# Try to get database cluster ID
echo "🔍 Looking for database cluster..."
DB_CLUSTER_ID="dbaas-db-6934625"
echo "Using cluster ID: ${DB_CLUSTER_ID}"
echo ""

# List backups
BACKUPS=$(doctl databases backups list "$DB_CLUSTER_ID" --format Created,SizeGB --no-header 2>/dev/null || echo "")
if [ -z "$BACKUPS" ]; then
    echo "⚠️  No backups found or unable to list backups"
    echo ""
    echo "📋 You'll need to use Point-in-Time Recovery via the web console:"
    echo "   1. Go to: https://cloud.digitalocean.com/databases/${DB_CLUSTER_ID}"
    echo "   2. Click 'Backups' tab"
    echo "   3. Click 'Restore from Backup' or 'Point-in-Time Recovery'"
    echo "   4. Select restore time: ${RESTORE_TIMESTAMP}"
    echo ""
    exit 0
fi

echo "Available backups:"
echo "$BACKUPS"
echo ""

# For PITR, we need to use the web console or API
echo "📋 Point-in-Time Recovery Instructions:"
echo ""
echo "DigitalOcean PostgreSQL supports Point-in-Time Recovery (PITR)."
echo "To restore to ${RESTORE_TIMESTAMP}:"
echo ""
echo "OPTION 1: Via Web Console (Recommended)"
echo "----------------------------------------"
echo "1. Go to: https://cloud.digitalocean.com/databases/${DB_CLUSTER_ID}"
echo "2. Click the 'Backups' tab"
echo "3. Click 'Restore' or 'Point-in-Time Recovery' button"
echo "4. Select 'Point-in-Time Recovery'"
echo "5. Enter restore time:"
echo "   - Date: ${RESTORE_DATE}"
echo "   - Time: ${RESTORE_TIME} (12:20 PM)"
echo "   - Timezone: UTC"
echo "6. Enter a name for the restored database: 'restored-1220pm-${RESTORE_DATE}'"
echo "7. Click 'Restore'"
echo ""
echo "This will create a NEW database cluster with data restored to that time."
echo ""

# Get current database connection details
echo "📝 Current Database Connection:"
echo "-------------------------------"
echo "After restoring, you'll need to update your DATABASE_URL."
echo ""
echo "The restored database will have a NEW connection string."
echo "You can find it in the DigitalOcean console after restoration completes."
echo ""

echo "✅ Ready to restore!"
echo ""
echo "Next steps:"
echo "1. Follow the instructions above to restore via web console"
echo "2. Wait for restoration to complete (5-15 minutes)"
echo "3. Get the new connection string"
echo "4. Share it with me to update the production server"
echo ""

