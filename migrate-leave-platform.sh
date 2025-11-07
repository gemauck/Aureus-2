#!/bin/bash

# Migration script for Leave Platform database schema
# This script applies the Prisma migration for leave platform tables

echo "🚀 Starting Leave Platform migration..."
echo ""

# Check if Prisma is installed
if ! command -v npx &> /dev/null; then
    echo "❌ npx is not installed. Please install Node.js and npm first."
    exit 1
fi

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate Prisma client"
    exit 1
fi

# Create migration
echo ""
echo "📝 Creating migration..."
npx prisma migrate dev --name add_leave_platform

if [ $? -ne 0 ]; then
    echo "❌ Migration failed"
    echo ""
    echo "⚠️  If tables already exist, you may need to manually apply the migration:"
    echo "   1. Check the Prisma schema: prisma/schema.prisma"
    echo "   2. Review the migration files in: prisma/migrations/"
    echo "   3. Apply manually if needed: npx prisma migrate deploy"
    exit 1
fi

echo ""
echo "✅ Migration completed successfully!"
echo ""
echo "📋 Created tables:"
echo "   - LeaveApplication"
echo "   - LeaveBalance"
echo "   - LeaveApprover"
echo "   - Birthday"
echo ""
echo "🎉 Leave Platform database schema is ready!"

