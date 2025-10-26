#!/bin/bash

# Lead Status Persistence - Quick Database Check
# This script verifies that the database schema is correct and shows current lead data

echo "==================================="
echo "Lead Status Persistence Check"
echo "==================================="
echo ""

DB_PATH="prisma/dev.db"

if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database not found at: $DB_PATH"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "✅ Database found"
echo ""

echo "📊 Checking schema for stage column..."
sqlite3 "$DB_PATH" "PRAGMA table_info(Client);" | grep "stage"
echo ""

echo "📊 Total leads count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as total_leads FROM Client WHERE type = 'lead';"
echo ""

echo "📊 Leads by status:"
sqlite3 "$DB_PATH" "SELECT status, COUNT(*) as count FROM Client WHERE type = 'lead' GROUP BY status ORDER BY count DESC;"
echo ""

echo "📊 Leads by stage:"
sqlite3 "$DB_PATH" "SELECT stage, COUNT(*) as count FROM Client WHERE type = 'lead' GROUP BY stage ORDER BY count DESC;"
echo ""

echo "📊 Recent leads (last 5):"
sqlite3 -header -column "$DB_PATH" "SELECT id, name, status, stage, updatedAt FROM Client WHERE type = 'lead' ORDER BY updatedAt DESC LIMIT 5;"
echo ""

echo "📊 Leads with NULL or empty stage:"
NULL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Client WHERE type = 'lead' AND (stage IS NULL OR stage = '');")
if [ "$NULL_COUNT" -gt 0 ]; then
    echo "⚠️  Found $NULL_COUNT leads with NULL/empty stage"
    echo "Run: sqlite3 prisma/dev.db < ensure-stage-field.sql"
else
    echo "✅ All leads have valid stage values"
fi
echo ""

echo "==================================="
echo "Check complete!"
echo "==================================="
