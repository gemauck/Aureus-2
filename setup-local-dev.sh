#!/bin/bash
# Setup script for local development database

echo "🔧 Setting up local development environment..."
echo ""

# Check if PostgreSQL is running
if ! pg_isready -h localhost > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running on localhost"
    echo ""
    echo "Please start PostgreSQL:"
    echo "  - macOS (Homebrew): brew services start postgresql@18"
    echo "  - macOS (Postgres.app): Open Postgres.app"
    echo "  - Linux: sudo systemctl start postgresql"
    echo ""
    exit 1
fi

echo "✅ PostgreSQL is running"
echo ""

# Ask for database connection details
echo "📋 Please provide your local PostgreSQL connection details:"
echo ""
read -p "PostgreSQL username (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "PostgreSQL password: " DB_PASS
echo ""

read -p "Database name (default: abcotronics_erp): " DB_NAME
DB_NAME=${DB_NAME:-abcotronics_erp}

read -p "Host (default: localhost): " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "Port (default: 5432): " DB_PORT
DB_PORT=${DB_PORT:-5432}

# Create database if it doesn't exist
echo ""
echo "📦 Creating database if it doesn't exist..."
export PGPASSWORD="$DB_PASS"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>&1 | grep -v "already exists" || true
unset PGPASSWORD

echo "✅ Database ready"
echo ""

# Create .env.local file
echo "📝 Creating .env.local file..."
cat > .env.local << EOF
# Local Development Database
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# JWT Configuration
JWT_SECRET="0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8"
JWT_EXPIRY="24h"

# Session Configuration
SESSION_DURATION=86400000
SESSION_DURATION_REMEMBER=2592000000

# Security Configuration
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION=1800000
PASSWORD_HISTORY_COUNT=5

# Email Configuration (for local dev, these won't be used)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="gemauck@gmail.com"
SMTP_PASS="psrbqbzifyooosfx"
EMAIL_FROM="gemauck@gmail.com"
SMTP_FROM_EMAIL="noreply@abcotronics.com"
SMTP_FROM_NAME="Abcotronics Security"

# Application Settings
NODE_ENV="development"
PORT=3000
APP_URL="http://localhost:3000"
EOF

echo "✅ .env.local created"
echo ""

# Generate Prisma Client
echo "🔨 Generating Prisma Client..."
npx prisma generate
echo ""

# Run migrations
echo "🚀 Running database migrations..."
./scripts/safe-db-migration.sh npx prisma migrate dev --name init || ./scripts/safe-db-migration.sh npx prisma db push
echo ""

echo "✅ Local development environment is ready!"
echo ""
echo "🚀 Next steps:"
echo "   1. The .env file will use .env.local for local development"
echo "   2. Start the server: npm run dev"
echo "   3. Open http://localhost:3000"
echo ""

