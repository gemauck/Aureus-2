#!/bin/bash
# Restore from Yesterday at 7 AM
# This restores CODE from Git (database must be restored separately from Digital Ocean)

set -e

echo "🕐 Restoring from Yesterday at 7 AM..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get current date
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "1 day ago" +%Y-%m-%d)

echo "📅 Today: $TODAY"
echo "📅 Yesterday: $YESTERDAY"
echo "⏰ Target time: ${YESTERDAY} 07:00:00"
echo ""

# Find commit from yesterday 7 AM
echo "🔍 Finding commit from yesterday 7 AM..."
COMMIT=$(git log --all --before="${YESTERDAY} 07:00:00" --format="%h" -1)

if [ -z "$COMMIT" ]; then
    echo "❌ No commit found before yesterday 7 AM"
    echo "📋 Showing recent commits:"
    git log --all --since="2 days ago" --format="%h - %ad - %s" | head -10
    exit 1
fi

COMMIT_INFO=$(git log --all --before="${YESTERDAY} 07:00:00" --format="%h - %ad - %s" -1)
echo "✅ Found commit: $COMMIT_INFO"
echo ""

# Show what changed after 7 AM
echo "📋 Commits AFTER yesterday 7 AM (that will be reverted):"
git log --all --since="${YESTERDAY} 07:00:00" --format="  %h - %ad - %s" | head -10
echo ""

# Ask for confirmation
read -p "⚠️  This will checkout commit $COMMIT. Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled."
    exit 1
fi

# Create backup branch
BACKUP_BRANCH="backup-before-restore-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating backup branch: $BACKUP_BRANCH"
git branch "$BACKUP_BRANCH"

# Checkout the commit
echo "🔄 Checking out commit $COMMIT..."
git checkout "$COMMIT"

echo ""
echo "✅ Code restored to yesterday 7 AM!"
echo ""
echo "⚠️  IMPORTANT: Database must be restored separately!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo "   1. Go to Digital Ocean: https://cloud.digitalocean.com/databases"
echo "   2. Restore database from ${YESTERDAY} 07:00:00"
echo "   3. Update DATABASE_URL in .env files"
echo "   4. Restart your application"
echo ""
echo "💡 To go back to latest code:"
echo "   git checkout main"
echo "   git checkout $BACKUP_BRANCH  (if you want the backup)"
echo ""




