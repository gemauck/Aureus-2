#!/bin/bash
# Create database using gemau user with password prompt

echo "Creating database abcotronics_erp_local..."
echo ""
echo "You'll be prompted for your PostgreSQL password for user 'gemau'"
echo ""

# Try to create database - will prompt for password
createdb -U gemau abcotronics_erp_local

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database created successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Set up schema: export DATABASE_URL='postgresql://gemau:YOUR_PASSWORD@localhost:5432/abcotronics_erp_local' && npx prisma db push --accept-data-loss"
    echo "  2. Update .env.local with your password in DATABASE_URL"
    echo "  3. Start dev server: npm run dev"
else
    echo ""
    echo "❌ Failed to create database"
    echo ""
    echo "Alternative: Create database using psql:"
    echo "  psql -U gemau -d postgres"
    echo "  Then run: CREATE DATABASE abcotronics_erp_local;"
fi





