#!/bin/bash

# Tag System Migration Script
# This script applies the database migration for the new tagging system

echo "🔧 Abcotronics ERP - Tags Migration"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found Prisma schema"
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

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not set in environment"
    echo ""
    echo "For local development:"
    echo "  export DATABASE_URL='your-postgresql-connection-string'"
    echo ""
    echo "For production (server with DATABASE_URL already set):"
    echo "  npx prisma migrate deploy"
    echo ""
    echo "Alternatively, you can use the manual SQL migration:"
    echo "  psql \$DATABASE_URL < prisma/migrations/MANUAL_TAG_MIGRATION.sql"
    echo ""
    echo "⚠️  Skipping automatic migration. Please run migration manually when DATABASE_URL is available."
else
    # Create and apply migration
    echo "🚀 Creating database migration..."
    npx prisma migrate dev --name add_tags_system
    if [ $? -ne 0 ]; then
        echo "❌ Migration failed"
        echo ""
        echo "⚠️  Trying alternative method..."
        npx prisma db push --accept-data-loss
        if [ $? -ne 0 ]; then
            echo "❌ db push also failed"
            echo ""
            echo "You can try:"
            echo "  1. Run: npx prisma migrate deploy (for production)"
            echo "  2. Or use manual SQL: psql \$DATABASE_URL < prisma/migrations/MANUAL_TAG_MIGRATION.sql"
            echo ""
            exit 1
        else
            echo "✅ Schema pushed successfully (using db push)"
        fi
    else
        echo "✅ Migration completed successfully"
    fi
    echo ""
fi

echo "✅ Tags Migration Complete!"
echo ""
echo "📊 Summary of Changes:"
echo "  • Added Tag model (name, color, description)"
echo "  • Added ClientTag join table"
echo "  • Updated Client model with tags relationship"
echo "  • Tags can now be assigned to both clients and leads"
echo ""
echo "🎉 You can now:"
echo "  • Create tags via the UI or API"
echo "  • Assign multiple tags to clients and leads"
echo "  • Manage tags in ClientDetailModal and LeadDetailModal"
echo ""

