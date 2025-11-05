#!/bin/bash
# Quick start script for local development

echo "🚀 Quick Start - Local Development"
echo "=================================="
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found!"
    echo ""
    echo "Please create .env.local with your local database connection."
    echo ""
    echo "Quick setup:"
    echo "1. Make sure PostgreSQL is running"
    echo "2. Create the database:"
    echo "   psql -U postgres -c 'CREATE DATABASE abcotronics_erp;'"
    echo "3. Copy .env.local.template to .env.local and update DATABASE_URL"
    echo ""
    echo "Or run: ./setup-local-dev.sh"
    exit 1
fi

echo "✅ Found .env.local"
echo ""

# Generate Prisma Client
echo "🔨 Generating Prisma Client..."
npx prisma generate
echo ""

# Check database connection and run migrations
echo "🔍 Checking database connection..."
if npx prisma db push --accept-data-loss > /dev/null 2>&1; then
    echo "✅ Database connection successful"
    echo "✅ Schema synchronized"
else
    echo "⚠️  Database connection failed or migrations needed"
    echo "Running migrations..."
    npx prisma migrate dev --name init 2>&1 | tail -5
fi
echo ""

# Start the server
echo "🚀 Starting development server..."
echo "   Server will be available at: http://localhost:3000"
echo ""
npm run dev

