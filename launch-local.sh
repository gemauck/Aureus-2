#!/bin/bash
# Launch Local Development Server
# This script starts your local development environment

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Launching Local Development Environment${NC}"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}❌ .env.local not found!${NC}"
    echo ""
    echo "Please run the setup script first:"
    echo "  ./setup-local-live-environment.sh"
    exit 1
fi

# Check if Docker database is running
if ! docker ps | grep -q abcotronics_erp_local_db; then
    echo -e "${YELLOW}⚠️  Local database container is not running${NC}"
    echo "Starting local database..."
    
    # Use 'docker compose' (newer) or 'docker-compose' (older)
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
    
    # Change to script directory to find docker-compose.yml
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    cd "$SCRIPT_DIR"
    
    $DOCKER_COMPOSE up -d
    
    # Wait for database to be ready
    echo "Waiting for database to be ready..."
    sleep 3
fi

echo -e "${GREEN}✅ Local database is running${NC}"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Dependencies not installed${NC}"
    echo "Installing dependencies..."
    npm install
fi

# Generate Prisma client if needed
if [ ! -d "node_modules/.prisma" ]; then
    echo "Generating Prisma client..."
    export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d '=' -f2- | tr -d '"')
    npx prisma generate
fi

echo ""
echo -e "${CYAN}Starting development server...${NC}"
echo ""
echo -e "${BLUE}Server will be available at:${NC}"
echo -e "  ${GREEN}http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Start the development server (backend only - serves real app)
npm run dev:backend

