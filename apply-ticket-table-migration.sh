#!/bin/bash
# Apply Ticket table migration to production database

echo "🔧 Applying Ticket table migration..."
echo ""

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found Prisma schema"
echo ""

# Try Prisma migrate deploy first (recommended for production)
echo "📦 Attempting Prisma migration..."
if npx prisma migrate deploy; then
    echo "✅ Prisma migration completed successfully!"
    exit 0
fi

echo ""
echo "⚠️  Prisma migrate deploy failed, trying manual SQL migration..."
echo ""

# Fallback to manual SQL migration
if [ -f "prisma/migrations/manual_add_ticket_table.sql" ]; then
    echo "📝 Running manual SQL migration..."
    
    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        echo "❌ Error: DATABASE_URL environment variable is not set"
        echo "Please set it or run:"
        echo "  psql \$DATABASE_URL -f prisma/migrations/manual_add_ticket_table.sql"
        exit 1
    fi
    
    # Try to run the SQL file
    if command -v psql &> /dev/null; then
        psql "$DATABASE_URL" -f prisma/migrations/manual_add_ticket_table.sql
        if [ $? -eq 0 ]; then
            echo "✅ Manual SQL migration applied successfully!"
        else
            echo "❌ Manual SQL migration failed"
            echo "You can try running it manually:"
            echo "  psql \$DATABASE_URL -f prisma/migrations/manual_add_ticket_table.sql"
            exit 1
        fi
    else
        echo "⚠️  psql command not found"
        echo "Please run the migration manually:"
        echo "  psql \$DATABASE_URL -f prisma/migrations/manual_add_ticket_table.sql"
        exit 1
    fi
else
    echo "❌ Error: Manual migration file not found"
    exit 1
fi

echo ""
echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo ""
echo "✅ Migration complete!"
echo ""
echo "The Ticket table has been created. The helpdesk API should now work correctly."

