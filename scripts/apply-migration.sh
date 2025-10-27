#!/bin/bash

# Script to apply document collection fields migration
# Run this from the project root directory

echo "🔧 Applying Document Collection Fields Migration..."
echo ""

# Navigate to project directory
cd "$(dirname "$0")/.."

# Run the migration
echo "📝 Running SQL migration..."
npx prisma db execute --file prisma/migrations/add_document_collection_fields.sql --schema prisma/schema.prisma

if [ $? -eq 0 ]; then
    echo "✅ Migration successful!"
    echo ""
    echo "🔄 Regenerating Prisma client..."
    npx prisma generate
    
    if [ $? -eq 0 ]; then
        echo "✅ Prisma client regenerated!"
        echo ""
        echo "🎉 All done! Now restart your Node.js server:"
        echo "   1. Stop the server (Ctrl+C)"
        echo "   2. Run: node server.js"
        echo ""
        echo "Then test by adding tasks and document collection data!"
    else
        echo "❌ Failed to regenerate Prisma client"
        exit 1
    fi
else
    echo "❌ Migration failed"
    exit 1
fi
