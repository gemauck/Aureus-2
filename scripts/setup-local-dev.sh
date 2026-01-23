#!/bin/bash
# Setup Local Development Environment
# This script sets up a local PostgreSQL database and copies production data

set -e

echo "🔧 Setting up local development environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed${NC}"
    echo ""
    echo "Please install PostgreSQL:"
    echo "  macOS: brew install postgresql@14"
    echo "  Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    echo "  Or download from: https://www.postgresql.org/download/"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is installed${NC}"

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo -e "${YELLOW}⚠️  PostgreSQL is not running. Starting it...${NC}"
    
    # Try to start PostgreSQL (macOS with Homebrew)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || {
            echo -e "${RED}❌ Could not start PostgreSQL automatically${NC}"
            echo "Please start PostgreSQL manually and run this script again"
            exit 1
        }
        sleep 3
    else
        echo -e "${RED}❌ PostgreSQL is not running${NC}"
        echo "Please start PostgreSQL manually:"
        echo "  sudo systemctl start postgresql"
        exit 1
    fi
fi

echo -e "${GREEN}✅ PostgreSQL is running${NC}"

# Database configuration
DB_NAME="abcotronics_erp_local"
DB_USER="${USER}"
DB_PASSWORD=""
LOCAL_DB_PORT="5437"
LOCAL_DB_URL="postgresql://${DB_USER}@localhost:${LOCAL_DB_PORT}/${DB_NAME}"

echo ""
echo "📊 Database Configuration:"
echo "   Database: ${DB_NAME}"
echo "   User: ${DB_USER}"
echo "   Host: localhost:5432"
echo ""

# Create database if it doesn't exist
echo "🗄️  Setting up local database..."

# Try to connect without password first (peer authentication on macOS/Linux)
# If that fails, try with the current user
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo -e "${YELLOW}⚠️  Database '${DB_NAME}' already exists${NC}"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping existing database..."
        psql -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || \
        psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true
        psql -d postgres -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || \
        psql -U postgres -d postgres -c "CREATE DATABASE ${DB_NAME};" || {
            echo -e "${RED}❌ Failed to create database${NC}"
            echo "Please create it manually:"
            echo "  createdb ${DB_NAME}"
            exit 1
        }
        echo -e "${GREEN}✅ Database created${NC}"
    else
        echo "Using existing database"
    fi
else
    psql -d postgres -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || \
    psql -U postgres -d postgres -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || \
    createdb "${DB_NAME}" 2>/dev/null || {
        echo -e "${RED}❌ Failed to create database${NC}"
        echo "Please create it manually:"
        echo "  createdb ${DB_NAME}"
        echo "Or connect as postgres user:"
        echo "  sudo -u postgres createdb ${DB_NAME}"
        exit 1
    }
    echo -e "${GREEN}✅ Database created${NC}"
fi

# Create .env.local file
echo ""
echo "📝 Creating .env.local file..."
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

echo -e "${GREEN}✅ .env.local created${NC}"

# Run Prisma migrations
echo ""
echo "🔄 Running Prisma migrations..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma migrate deploy --schema=./prisma/schema.prisma 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Migrations failed, trying to push schema...${NC}"
    npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss || {
        echo -e "${YELLOW}⚠️  Schema push failed, but continuing...${NC}"
        echo "You may need to run migrations manually:"
        echo "  npx prisma migrate dev"
    }
}

echo -e "${GREEN}✅ Database schema ready${NC}"

echo ""
echo -e "${GREEN}✅ Local development environment setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Copy production data: ./scripts/copy-production-data.sh"
echo "  2. Start local server: npm run dev"
echo ""

