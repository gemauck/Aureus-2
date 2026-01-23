#!/bin/bash
# Simplified Local Development Setup (no password prompts)

set -e

echo "🔧 Setting up local development environment (simplified)..."
echo ""

# Database configuration
DB_NAME="abcotronics_erp_local"
DB_USER="${USER}"

echo "📊 Database Configuration:"
echo "   Database: ${DB_NAME}"
echo "   User: ${DB_USER}"
echo ""

# Try to create database (will fail gracefully if it exists or needs password)
echo "🗄️  Creating local database..."
if createdb "$DB_NAME" 2>/dev/null; then
    echo "✅ Database created successfully"
elif psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "✅ Database already exists"
else
    echo "⚠️  Could not create database automatically"
    echo ""
    echo "Please create it manually using one of these methods:"
    echo ""
    echo "Option 1 (if no password required):"
    echo "  createdb ${DB_NAME}"
    echo ""
    echo "Option 2 (if password required):"
    echo "  psql postgres"
    echo "  CREATE DATABASE ${DB_NAME};"
    echo "  \\q"
    echo ""
    echo "Option 3 (as postgres superuser):"
    echo "  sudo -u postgres createdb ${DB_NAME}"
    echo ""
    read -p "Press Enter after you've created the database, or Ctrl+C to exit..."
    
    # Verify database exists
    if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
        echo "❌ Database still not found. Please create it manually and run this script again."
        exit 1
    fi
fi

# Create .env.local file
echo ""
echo "📝 Creating .env.local file..."

LOCAL_DB_URL="postgresql://${DB_USER}@localhost:5432/${DB_NAME}"

cat > .env.local << EOF
# Local Development Environment
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Local PostgreSQL Database
DATABASE_URL="${LOCAL_DB_URL}"

# JWT Secret (use same as production for testing)
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Allow local database connections
DEV_LOCAL_NO_DB=false

# Email Configuration (optional for local dev)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
EOF

echo "✅ .env.local created"

# Test database connection
echo ""
echo "🔍 Testing database connection..."
if psql "$LOCAL_DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "⚠️  Could not test database connection automatically"
    echo "   This is okay - you can test it later with: psql ${LOCAL_DB_URL}"
fi

# Run Prisma migrations
echo ""
echo "🔄 Setting up database schema..."
export DATABASE_URL="${LOCAL_DB_URL}"

# Try to push schema (creates tables)
npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1 | tail -5 || {
    echo "⚠️  Schema push had some issues, but continuing..."
}

echo ""
echo "✅ Local development environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy production data (optional): npm run copy:prod-data"
echo "  2. Start development server: npm run dev"
echo ""

