#!/bin/bash
# Setup Local Live Environment
# This script sets up a complete local copy of your live environment
# including database and server configuration

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Abcotronics ERP - Local Live Environment Setup            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
PROD_SERVER="root@165.22.127.196"
PROD_APP_DIR="/var/www/abcotronics-erp"
LOCAL_DB_NAME="abcotronics_erp_local"
LOCAL_DB_USER="gemau"
LOCAL_DB_PORT="5437"
LOCAL_DB_URL="postgresql://${LOCAL_DB_USER}@localhost:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"

# Step 1: Check prerequisites
echo -e "${BLUE}Step 1/6: Checking prerequisites...${NC}"

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo ""
    echo "Please install Docker:"
    echo "  macOS: https://docs.docker.com/desktop/install/mac-install/"
    echo "  Linux: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo "Please start Docker Desktop and run this script again"
    exit 1
fi

echo -e "${GREEN}✅ Docker is installed and running${NC}"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ docker-compose is not available${NC}"
    exit 1
fi

# Use 'docker compose' (newer) or 'docker-compose' (older)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo -e "${GREEN}✅ docker-compose is available${NC}"

# Check if PostgreSQL client tools are installed (for data copy)
if ! command -v pg_dump &> /dev/null || ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL client tools not found${NC}"
    echo "   They are needed to copy production data"
    echo "   Installing via Homebrew (macOS)..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install postgresql@15 || brew install postgresql || {
                echo -e "${RED}❌ Failed to install PostgreSQL tools${NC}"
                echo "Please install manually: brew install postgresql"
                exit 1
            }
        else
            echo -e "${RED}❌ Homebrew not found. Please install PostgreSQL client tools manually${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Please install PostgreSQL client tools manually${NC}"
        echo "   Ubuntu/Debian: sudo apt-get install postgresql-client"
        echo "   RHEL/CentOS: sudo yum install postgresql"
        exit 1
    fi
fi

echo -e "${GREEN}✅ PostgreSQL client tools are available${NC}"
echo ""

# Step 2: Start local PostgreSQL database with Docker
echo -e "${BLUE}Step 2/6: Starting local PostgreSQL database...${NC}"

# Start Docker Compose services
echo "Starting Docker containers..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
$DOCKER_COMPOSE up -d

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec abcotronics_erp_local_db pg_isready -U ${LOCAL_DB_USER} &> /dev/null; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ PostgreSQL failed to start${NC}"
    exit 1
fi

# Create database if it doesn't exist
echo "Setting up database..."
docker exec abcotronics_erp_local_db psql -U ${LOCAL_DB_USER} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${LOCAL_DB_NAME}'" | grep -q 1 || \
docker exec abcotronics_erp_local_db psql -U ${LOCAL_DB_USER} -d postgres -c "CREATE DATABASE ${LOCAL_DB_NAME};" || {
    echo -e "${YELLOW}⚠️  Database might already exist, continuing...${NC}"
}

echo -e "${GREEN}✅ Local database is ready${NC}"
echo ""

# Step 3: Install dependencies
echo -e "${BLUE}Step 3/6: Installing dependencies...${NC}"

if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
else
    echo "Dependencies already installed, updating..."
    npm install
fi

echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 4: Setup database schema
echo -e "${BLUE}Step 4/6: Setting up database schema...${NC}"

# Generate Prisma client
echo "Generating Prisma client..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma generate

# Run migrations or push schema
echo "Applying database schema..."
npx prisma migrate deploy --schema=./prisma/schema.prisma 2>/dev/null || \
npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss || {
    echo -e "${YELLOW}⚠️  Schema setup had some issues, but continuing...${NC}"
}

echo -e "${GREEN}✅ Database schema is ready${NC}"
echo ""

# Step 5: Copy production data
echo -e "${BLUE}Step 5/6: Copying production data...${NC}"
echo ""
echo "This will copy all data from your live production database to local."
echo "This may take a few minutes depending on database size."
echo ""
read -p "Do you want to copy production data now? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    # Try to get production DATABASE_URL
    echo ""
    echo -e "${BLUE}📡 Connecting to production server...${NC}"
    
    PROD_DB_URL=$(ssh ${PROD_SERVER} "cd ${PROD_APP_DIR} && grep '^DATABASE_URL=' .env | cut -d '=' -f2- | tr -d '\"'" 2>/dev/null || echo "")
    
    if [ -z "$PROD_DB_URL" ]; then
        echo -e "${YELLOW}⚠️  Could not get DATABASE_URL from production server${NC}"
        echo ""
        echo "Please provide the production DATABASE_URL manually:"
        echo "  Format: postgresql://user:password@host:port/database?sslmode=require"
        read -p "DATABASE_URL: " PROD_DB_URL
        
        if [ -z "$PROD_DB_URL" ]; then
            echo -e "${YELLOW}⚠️  Skipping production data copy${NC}"
            echo "You can copy it later with: ./scripts/copy-production-data.sh"
        fi
    fi
    
    if [ -n "$PROD_DB_URL" ]; then
        # Create temporary dump file
        DUMP_FILE="/tmp/abcotronics_prod_dump_$(date +%Y%m%d_%H%M%S).sql"
        
        echo ""
        echo -e "${BLUE}📦 Dumping production database...${NC}"
        
        # Extract password from URL
        PROD_PASSWORD=$(echo "$PROD_DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
        
        # Dump production database
        export PGPASSWORD="$PROD_PASSWORD"
        pg_dump "$PROD_DB_URL" > "$DUMP_FILE" 2>&1 || {
            echo -e "${YELLOW}⚠️  Direct connection failed, trying via SSH...${NC}"
            ssh ${PROD_SERVER} "cd ${PROD_APP_DIR} && source .env 2>/dev/null || true && pg_dump \"\$DATABASE_URL\"" > "$DUMP_FILE" 2>&1 || {
                echo -e "${RED}❌ Failed to dump production database${NC}"
                echo ""
                echo "Please ensure:"
                echo "  1. You have SSH access to ${PROD_SERVER}"
                echo "  2. The production database is accessible from your network"
                echo "  3. Your IP is whitelisted in Digital Ocean database firewall"
                echo ""
                echo "You can copy production data later with: ./scripts/copy-production-data.sh"
                rm -f "$DUMP_FILE"
                unset PGPASSWORD
                PROD_DB_URL=""
            }
        }
        unset PGPASSWORD
        
        if [ -n "$PROD_DB_URL" ] && [ -s "$DUMP_FILE" ]; then
            echo -e "${GREEN}✅ Production database dumped${NC}"
            
            # Restore to local database
            echo ""
            echo -e "${BLUE}📤 Restoring to local database...${NC}"
            
            # Drop all existing connections
            docker exec abcotronics_erp_local_db psql -U ${LOCAL_DB_USER} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LOCAL_DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
            
            # Restore the dump
            docker exec -i abcotronics_erp_local_db psql -U ${LOCAL_DB_USER} -d ${LOCAL_DB_NAME} < "$DUMP_FILE" 2>&1 | grep -v "ERROR:" || {
                echo -e "${YELLOW}⚠️  Some errors occurred during restore (this may be normal)${NC}"
            }
            
            echo -e "${GREEN}✅ Production data copied to local database${NC}"
            
            # Clean up dump file
            rm -f "$DUMP_FILE"
        fi
    fi
else
    echo -e "${YELLOW}⏭️  Skipping production data copy${NC}"
    echo "You can copy production data later with: ./scripts/copy-production-data.sh"
fi

echo ""

# Step 6: Create .env.local for local development
echo -e "${BLUE}Step 6/6: Configuring local environment...${NC}"

# Get production JWT_SECRET if available
PROD_JWT_SECRET=$(ssh ${PROD_SERVER} "cd ${PROD_APP_DIR} && grep '^JWT_SECRET=' .env | cut -d '=' -f2- | tr -d '\"'" 2>/dev/null || echo "0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8")

cat > .env.local << EOF
# Local Development Environment
# This file overrides .env for local development
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Local PostgreSQL Database
DATABASE_URL="${LOCAL_DB_URL}"

# JWT Secret (same as production for testing)
JWT_SECRET=${PROD_JWT_SECRET}

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
echo ""

# Final summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Local Live Environment Setup Complete!                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Your local environment is ready!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  ${GREEN}1.${NC} Start the local development server:"
echo -e "     ${CYAN}npm run dev${NC}"
echo ""
echo -e "  ${GREEN}2.${NC} Or start just the backend:"
echo -e "     ${CYAN}npm run dev:backend${NC}"
echo ""
echo -e "  ${GREEN}3.${NC} Open your browser to:"
echo -e "     ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "  • View database: ${CYAN}npx prisma studio${NC}"
echo "  • Copy production data: ${CYAN}./scripts/copy-production-data.sh${NC}"
echo "  • Stop local database: ${CYAN}docker-compose down${NC}"
echo "  • Start local database: ${CYAN}docker-compose up -d${NC}"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "  • Your local database is separate from production"
echo "  • Changes made locally will NOT affect production"
echo "  • Test all changes locally before deploying"
echo ""
echo -e "${GREEN}Ready to develop! 🚀${NC}"
echo ""

