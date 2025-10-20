#!/bin/bash

# Quick Setup Script for Local Database
echo "🚀 Setting up local database for Abcotronics ERP..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed"
    echo "💡 Please install PostgreSQL first:"
    echo "   - macOS: brew install postgresql"
    echo "   - Ubuntu: sudo apt-get install postgresql"
    echo "   - Windows: Download from https://www.postgresql.org/download/"
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo "❌ PostgreSQL is not running"
    echo "💡 Please start PostgreSQL:"
    echo "   - macOS: brew services start postgresql"
    echo "   - Ubuntu: sudo systemctl start postgresql"
    exit 1
fi

echo "✅ PostgreSQL is installed and running"

# Create database if it doesn't exist
DB_NAME="abcotronics_erp"
DB_USER="postgres"
DB_PASSWORD="password"

echo "🔍 Creating database: $DB_NAME"

# Create the database
createdb $DB_NAME 2>/dev/null || echo "Database already exists"

# Set DATABASE_URL
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

echo "✅ Database setup complete!"
echo "📋 Database details:"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Password: $DB_PASSWORD"
echo "   URL: $DATABASE_URL"

echo ""
echo "🔧 Next steps:"
echo "   1. Export the DATABASE_URL: export DATABASE_URL=\"$DATABASE_URL\""
echo "   2. Run migrations: npm run prisma:migrate"
echo "   3. Create users: node test-auth-fix.js"
echo ""
echo "💡 To make this permanent, add this to your shell profile:"
echo "   echo 'export DATABASE_URL=\"$DATABASE_URL\"' >> ~/.bashrc"
echo "   echo 'export DATABASE_URL=\"$DATABASE_URL\"' >> ~/.zshrc"
