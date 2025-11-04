#!/bin/bash
# Restore Database to 10 PM (Point-in-Time Recovery)
# This script helps restore your DigitalOcean PostgreSQL database to around 10 PM

set -e

echo "🕙 Database Point-in-Time Restore to 10 PM"
echo "=========================================="
echo ""

# Get current date and time
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null || echo "")

# Ask user which date
echo "Which date should we restore to?"
echo "1. Today at 10 PM (${TODAY} 22:00)"
if [ -n "$YESTERDAY" ]; then
    echo "2. Yesterday at 10 PM (${YESTERDAY} 22:00)"
fi
echo "3. Custom date/time"
read -p "Enter choice (1-3): " DATE_CHOICE

case $DATE_CHOICE in
    1)
        RESTORE_DATE="${TODAY}"
        RESTORE_TIME="22:00:00"
        ;;
    2)
        if [ -n "$YESTERDAY" ]; then
            RESTORE_DATE="${YESTERDAY}"
            RESTORE_TIME="22:00:00"
        else
            echo "❌ Could not calculate yesterday's date"
            exit 1
        fi
        ;;
    3)
        read -p "Enter date (YYYY-MM-DD): " RESTORE_DATE
        read -p "Enter time (HH:MM:SS, default 22:00:00): " RESTORE_TIME
        RESTORE_TIME="${RESTORE_TIME:-22:00:00}"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

RESTORE_TIMESTAMP="${RESTORE_DATE}T${RESTORE_TIME}Z"
echo ""
echo "📅 Target restore time: ${RESTORE_TIMESTAMP}"
echo ""

# Check if doctl (DigitalOcean CLI) is installed
if ! command -v doctl &> /dev/null; then
    echo "⚠️  DigitalOcean CLI (doctl) not found"
    echo ""
    echo "📋 To restore via DigitalOcean Web Console:"
    echo "   1. Go to: https://cloud.digitalocean.com/databases"
    echo "   2. Click on your database cluster"
    echo "   3. Click 'Backups' tab"
    echo "   4. Click 'Restore from Backup' or 'Point-in-Time Recovery'"
    echo "   5. Select restore time: ${RESTORE_TIMESTAMP}"
    echo "   6. This will create a NEW database cluster"
    echo "   7. Update your DATABASE_URL to point to the new cluster"
    echo ""
    echo "📋 Or install doctl to automate this:"
    echo "   macOS: brew install doctl"
    echo "   Linux: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    echo ""
    
    read -p "Press Enter to continue with manual instructions or Ctrl+C to exit..."
    exit 0
fi

# Check if doctl is authenticated
if ! doctl auth list &> /dev/null; then
    echo "🔐 doctl not authenticated. Please run: doctl auth init"
    exit 1
fi

echo "🔍 Finding your database cluster..."
echo ""

# List database clusters
DB_CLUSTERS=$(doctl databases list --format ID,Name,Engine,Status --no-header)
if [ -z "$DB_CLUSTERS" ]; then
    echo "❌ No database clusters found"
    exit 1
fi

echo "Available database clusters:"
echo "$DB_CLUSTERS"
echo ""

read -p "Enter database cluster ID or name: " DB_IDENTIFIER

# Get cluster ID if name was provided
DB_CLUSTER_ID=$(doctl databases list --format ID,Name --no-header | grep -E "^${DB_IDENTIFIER}|${DB_IDENTIFIER}" | head -1 | awk '{print $1}')
if [ -z "$DB_CLUSTER_ID" ]; then
    DB_CLUSTER_ID=$DB_IDENTIFIER
fi

echo ""
echo "🔍 Checking available backups for cluster: ${DB_CLUSTER_ID}"
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
echo "5. Enter restore time: ${RESTORE_TIMESTAMP}"
echo "6. Choose a name for the new database cluster (e.g., 'restored-10pm')"
echo "7. Click 'Restore'"
echo ""
echo "This will create a NEW database cluster with data restored to that time."
echo ""
echo "OPTION 2: Via doctl (if API supports it)"
echo "----------------------------------------"
echo "Note: Point-in-Time Recovery may require the web console."
echo "You can try:"
echo "  doctl databases restore-backup ${DB_CLUSTER_ID} <backup-id>"
echo ""

# Get current database connection details
echo "📝 Current Database Connection:"
echo "-------------------------------"
echo "After restoring, you'll need to update your DATABASE_URL."
echo ""
echo "The restored database will have a NEW connection string."
echo "You can find it in the DigitalOcean console after restoration completes."
echo ""

# Check if we have a script to update the connection
if [ -f "update-restored-database.sh" ]; then
    echo "📋 After restoration, run this script to update your server:"
    echo "   ./update-restored-database.sh"
    echo ""
    echo "But first, update the script with the NEW database connection details."
    echo ""
fi

read -p "Press Enter to open the DigitalOcean console, or Ctrl+C to cancel..."

# Try to open the browser (macOS/Linux)
if command -v open &> /dev/null; then
    open "https://cloud.digitalocean.com/databases/${DB_CLUSTER_ID}"
elif command -v xdg-open &> /dev/null; then
    xdg-open "https://cloud.digitalocean.com/databases/${DB_CLUSTER_ID}"
else
    echo ""
    echo "Please open: https://cloud.digitalocean.com/databases/${DB_CLUSTER_ID}"
fi

echo ""
echo "✅ Instructions displayed above"
echo ""
echo "📋 Quick Summary:"
echo "   1. Restore database to: ${RESTORE_TIMESTAMP}"
echo "   2. Note the NEW database connection string"
echo "   3. Update update-restored-database.sh with new connection details"
echo "   4. Run: ./update-restored-database.sh"
echo ""

