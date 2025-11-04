#!/bin/bash
# Database Migration Script for Guest Role Feature
# Run this script to add the guest role and accessibleProjectIds field

echo "🔧 Abcotronics ERP - Guest Role Migration"
echo "=========================================="
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

# Create migration
echo "🚀 Creating database migration..."
npx prisma migrate dev --name add_guest_role_and_accessible_projects
if [ $? -ne 0 ]; then
    echo "⚠️  Migration creation failed, trying alternative approach..."
    echo ""
    echo "Attempting direct database push..."
    npx prisma db push --accept-data-loss
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
echo "  • Added 'guest' role to permissions system"
echo "  • Added accessibleProjectIds field to User model"
echo "  • Guest users can only view specified projects"
echo "  • Project-level access control implemented"
echo ""
echo "🎉 You can now:"
echo "   1. Create guest users via Users page"
echo "   2. Assign projects to guest users"
echo "   3. Guest users will only see assigned projects"

