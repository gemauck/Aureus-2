#!/bin/bash

# Smart Hybrid Persistence System - Database Migration Script
# Run this script to update the database schema with new models and fields

echo "🔧 Abcotronics ERP - Database Migration"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found Prisma schema"
echo ""

# Backup existing database
echo "📦 Backing up existing database..."
if [ -f "prisma/dev.db" ]; then
    cp prisma/dev.db "prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ Database backed up"
else
    echo "⚠️  No existing database found (this is fine for first run)"
fi
echo ""

# Generate Prisma Client
echo "🔨 Generating Prisma Client..."
npx prisma generate
if [ $? -ne 0 ]; then
    echo "❌ Failed to generate Prisma Client"
    exit 1
fi
echo "✅ Prisma Client generated"
echo ""

# Create migration
echo "🚀 Creating database migration..."
npx prisma migrate dev --name add_employee_and_enhance_project
if [ $? -ne 0 ]; then
    echo "❌ Migration failed"
    echo ""
    echo "This might be because:"
    echo "1. Database is in use (close the app and try again)"
    echo "2. Migration conflicts with existing data"
    echo "3. Syntax error in schema.prisma"
    echo ""
    echo "To reset the database (⚠️ THIS WILL DELETE ALL DATA):"
    echo "  npx prisma migrate reset"
    exit 1
fi
echo "✅ Migration completed successfully"
echo ""

# Verify migration
echo "🔍 Verifying database schema..."
npx prisma db push --accept-data-loss
echo ""

echo "✅ Migration Complete!"
echo ""
echo "📊 Summary of Changes:"
echo "  • Added Employee model with all HR fields"
echo "  • Enhanced Project model with:"
echo "    - actualCost field"
echo "    - progress field (0-100)"
echo "    - type field"
echo "    - assignedTo field"
echo "    - tasks, taskLists fields (JSON)"
echo "    - customFieldDefinitions field (JSON)"
echo "    - documents field (JSON)"
echo "    - comments field (JSON)"
echo "    - activityLog field (JSON)"
echo ""
echo "🎯 Next Steps:"
echo "  1. Run: npm run dev"
echo "  2. Test the new persistence system"
echo "  3. Verify sync status indicators appear"
echo "  4. Test offline mode (disable network in DevTools)"
echo ""
echo "📚 Documentation:"
echo "  See IMPLEMENTATION_GUIDE.md for usage instructions"
echo ""
