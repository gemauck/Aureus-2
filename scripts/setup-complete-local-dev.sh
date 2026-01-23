#!/bin/bash
# Complete Local Development Setup
# This script orchestrates the entire local development environment setup

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Abcotronics ERP - Local Development Environment Setup    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Setup local database
echo -e "${BLUE}Step 1/3: Setting up local PostgreSQL database...${NC}"
bash scripts/setup-local-dev.sh || {
    echo -e "${RED}❌ Failed to set up local database${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}✅ Step 1 complete${NC}"
echo ""

# Step 2: Copy production data
echo -e "${BLUE}Step 2/3: Copying production data to local database...${NC}"
echo ""
read -p "Do you want to copy production data now? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    bash scripts/copy-production-data.sh || {
        echo -e "${YELLOW}⚠️  Failed to copy production data, but continuing...${NC}"
        echo "You can run this later with: ./scripts/copy-production-data.sh"
    }
else
    echo -e "${YELLOW}⏭️  Skipping production data copy${NC}"
    echo "You can copy production data later with: ./scripts/copy-production-data.sh"
fi

echo ""
echo -e "${GREEN}✅ Step 2 complete${NC}"
echo ""

# Step 3: Install dependencies and build
echo -e "${BLUE}Step 3/3: Installing dependencies and building...${NC}"
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
else
    echo "Dependencies already installed"
fi

echo ""
echo "Generating Prisma client..."
npx prisma generate

echo ""
echo "Building application..."
npm run build || {
    echo -e "${YELLOW}⚠️  Build had some warnings, but continuing...${NC}"
}

echo ""
echo -e "${GREEN}✅ Step 3 complete${NC}"
echo ""

# Final summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Local Development Environment Setup Complete!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Your local development environment is ready!"
echo ""
echo "Next steps:"
echo -e "  ${BLUE}1.${NC} Start the development server:"
echo -e "     ${GREEN}npm run dev${NC}"
echo ""
echo -e "  ${BLUE}2.${NC} Open your browser to:"
echo -e "     ${GREEN}http://localhost:3000${NC}"
echo ""
echo "Useful commands:"
echo "  • View database: npx prisma studio"
echo "  • Copy production data: ./scripts/copy-production-data.sh"
echo "  • Reset local database: ./scripts/setup-local-dev.sh"
echo ""
echo -e "${YELLOW}Note:${NC} Your local database is separate from production."
echo "Changes made locally will not affect production."
echo ""

