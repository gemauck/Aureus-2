#!/bin/bash

# Setup Daily News Search Cron Job
# This script sets up a cron job to run the daily news search at 9 AM daily

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_COMMAND="0 9 * * * cd \"$SCRIPT_DIR\" && /usr/bin/node scripts/daily-news-search.js >> logs/news-search.log 2>&1"
CRON_JOB="$CRON_COMMAND"

echo "🚀 Setting up daily news search cron job..."
echo ""
echo "This will add the following cron job (runs daily at 9 AM):"
echo "$CRON_JOB"
echo ""

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "daily-news-search.js"; then
    echo "⚠️ Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "daily-news-search.js" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

if [ $? -eq 0 ]; then
    echo "✅ Cron job added successfully!"
    echo ""
    echo "Current crontab:"
    crontab -l
    echo ""
    echo "📝 To verify cron is working:"
    echo "   tail -f logs/news-search.log"
    echo ""
    echo "📝 To manually trigger the search:"
    echo "   node scripts/daily-news-search.js"
else
    echo "❌ Failed to add cron job"
    echo ""
    echo "Manual setup:"
    echo "1. Run: crontab -e"
    echo "2. Add this line:"
    echo "   $CRON_JOB"
    exit 1
fi

