#!/bin/bash

# Multi-Location Inventory Setup Script
# This script automates the complete setup process

set -e  # Exit on error

echo "🔧 Starting Multi-Location Inventory Setup..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Apply Prisma schema changes
echo -e "${YELLOW}Step 1: Applying Prisma schema changes...${NC}"
if command -v npx &> /dev/null; then
    echo "  → Running Prisma db push..."
    npx prisma db push --accept-data-loss || {
        echo -e "${RED}  ❌ Prisma db push failed. You may need to run migrations manually.${NC}"
        echo "  → Trying Prisma migrate dev instead..."
        npx prisma migrate dev --name add_location_inventory || {
            echo -e "${RED}  ❌ Migration failed. Please run manually: npx prisma migrate dev${NC}"
            exit 1
        }
    }
    echo "  → Generating Prisma client..."
    npx prisma generate
    echo -e "${GREEN}  ✅ Prisma schema applied${NC}"
else
    echo -e "${RED}  ❌ npx not found. Please install Node.js and npm.${NC}"
    exit 1
fi

echo ""

# Step 2: Run SQL migration (backup approach)
echo -e "${YELLOW}Step 2: Applying SQL migration...${NC}"
if [ -f "add-location-inventory-migration.sql" ]; then
    if [ -n "$DATABASE_URL" ]; then
        echo "  → DATABASE_URL found, attempting to run SQL migration..."
        # Try using psql if available
        if command -v psql &> /dev/null; then
            echo "  → Running SQL migration with psql..."
            psql "$DATABASE_URL" -f add-location-inventory-migration.sql && {
                echo -e "${GREEN}  ✅ SQL migration applied${NC}"
            } || {
                echo -e "${YELLOW}  ⚠️  psql migration failed (this is okay if Prisma already handled it)${NC}"
            }
        else
            echo -e "${YELLOW}  ⚠️  psql not found. Please run the SQL migration manually or use Prisma.${NC}"
        fi
    else
        echo -e "${YELLOW}  ⚠️  DATABASE_URL not set. Please run SQL migration manually:${NC}"
        echo "     psql your_database -f add-location-inventory-migration.sql"
    fi
else
    echo -e "${RED}  ❌ Migration file not found${NC}"
fi

echo ""

# Step 3: Assign existing inventory to Main Warehouse
echo -e "${YELLOW}Step 3: Assigning existing inventory to Main Warehouse...${NC}"
if [ -f "assign-inventory-to-main-warehouse.js" ]; then
    if [ -n "$DATABASE_URL" ] || [ -f ".env" ]; then
        echo "  → Running inventory assignment script..."
        node assign-inventory-to-main-warehouse.js && {
            echo -e "${GREEN}  ✅ Inventory assigned to Main Warehouse${NC}"
        } || {
            echo -e "${YELLOW}  ⚠️  Assignment script failed (may already be done)${NC}"
        }
    else
        echo -e "${YELLOW}  ⚠️  DATABASE_URL not found. Please run manually:${NC}"
        echo "     node assign-inventory-to-main-warehouse.js"
    fi
else
    echo -e "${RED}  ❌ Assignment script not found${NC}"
fi

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "📋 Next Steps:"
echo "  1. Restart your server if it's running"
echo "  2. Go to Manufacturing → Inventory Tab"
echo "  3. Use the location selector dropdown to filter by location"
echo "  4. Create new stock locations - they'll automatically get inventory"
echo ""
echo "📖 For more details, see: MULTI-LOCATION-INVENTORY-IMPLEMENTATION.md"

