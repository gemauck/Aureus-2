#!/bin/bash

# Delete All Projects Script
# This script provides an easy way to delete all projects from the database

echo "🗑️  Delete All Projects - Abcotronics ERP"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ No .env file found!"
    echo ""
    echo "Please create a .env file with your DATABASE_URL:"
    echo "DATABASE_URL=\"postgresql://username:password@hostname:port/database\""
    echo ""
    echo "Or run with environment variable:"
    echo "DATABASE_URL=\"postgresql://...\" node delete-all-projects.js"
    exit 1
fi

# Check if DATABASE_URL is set in .env
if ! grep -q "DATABASE_URL" .env; then
    echo "❌ DATABASE_URL not found in .env file!"
    echo ""
    echo "Please add DATABASE_URL to your .env file:"
    echo "DATABASE_URL=\"postgresql://username:password@hostname:port/database\""
    exit 1
fi

echo "⚠️  WARNING: This will delete ALL projects and related data!"
echo "   - All tasks will be deleted"
echo "   - All invoices will be deleted"
echo "   - All time entries will be deleted"
echo ""
echo "This action cannot be undone!"
echo ""

# Ask for confirmation
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "❌ Operation cancelled."
    exit 0
fi

echo ""
echo "🔄 Starting deletion process..."
echo ""

# Run the Node.js script
node delete-all-projects.js

echo ""
echo "✅ Script completed!"
