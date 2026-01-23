#!/bin/bash
# Setup local dev environment when PostgreSQL requires a password

echo "🔧 Setting up local development with password authentication"
echo ""

# Get password from user
read -sp "Enter your PostgreSQL password for user 'gemau': " DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Password is required"
    exit 1
fi

DB_NAME="abcotronics_erp_local"
DB_USER="gemau"
LOCAL_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"

# Create database
echo ""
echo "🗄️  Creating database..."
PGPASSWORD="$DB_PASSWORD" createdb -U "$DB_USER" "$DB_NAME" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Database created successfully"
else
    # Check if database already exists
    if PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        echo "✅ Database already exists"
    else
        echo "❌ Failed to create database"
        echo ""
        echo "Try creating it manually:"
        echo "  PGPASSWORD='$DB_PASSWORD' psql -U $DB_USER -d postgres -c 'CREATE DATABASE $DB_NAME;'"
        exit 1
    fi
fi

# Create .env.local
echo ""
echo "📝 Creating .env.local file..."

cat > .env.local << EOF
# Local Development Environment
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Local PostgreSQL Database (with password)
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

# Set up schema
echo ""
echo "🔄 Setting up database schema..."
export DATABASE_URL="$LOCAL_DB_URL"
npx prisma db push --accept-data-loss 2>&1 | tail -5

echo ""
echo "✅ Setup complete!"
echo ""
echo "Your .env.local file contains your password."
echo "Start the dev server with: npm run dev"
echo ""

