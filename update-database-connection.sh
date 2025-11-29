#!/bin/bash

###############################################################################
# Update Database Connection String
# This script updates the DATABASE_URL in .env file with new credentials
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Database connection details
DB_USER="doadmin"
DB_PASSWORD="AVNS_D14tRDDknkgUUoVZ4Bv"
DB_HOST="dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"
DB_SSLMODE="require"

# Construct DATABASE_URL
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

echo "🔧 Updating Database Connection..."
echo ""

# Get the project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Working directory: $(pwd)${NC}"
echo ""

# Check if .env file exists
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ Found .env file${NC}"
    
    # Backup existing .env file
    if [ ! -f ".env.backup" ]; then
        cp .env .env.backup
        echo -e "${YELLOW}📦 Created backup: .env.backup${NC}"
    fi
    
    # Update or add DATABASE_URL
    if grep -q "^DATABASE_URL=" .env; then
        # Update existing DATABASE_URL
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
        else
            # Linux
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
        fi
        echo -e "${GREEN}✅ Updated DATABASE_URL in .env${NC}"
    else
        # Add DATABASE_URL if it doesn't exist
        echo "" >> .env
        echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
        echo -e "${GREEN}✅ Added DATABASE_URL to .env${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .env file not found. Creating new one...${NC}"
    
    # Create new .env file with all required variables
    cat > .env << EOF
# Database Connection (Digital Ocean PostgreSQL)
DATABASE_URL="${DATABASE_URL}"

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Application Settings
NODE_ENV=production
PORT=3000
APP_URL=https://abcoafrica.co.za
EOF
    echo -e "${GREEN}✅ Created .env file with DATABASE_URL${NC}"
fi

echo ""
echo -e "${YELLOW}Verifying DATABASE_URL...${NC}"
# Show DATABASE_URL (with password masked for security)
grep "^DATABASE_URL=" .env | sed 's/:[^:@]*@/:****@/'
echo ""

# Test database connection if node and prisma are available
if command -v node &> /dev/null; then
    echo -e "${YELLOW}Testing database connection...${NC}"
    
    # Try to test connection using Prisma
    if [ -f "node_modules/@prisma/client/index.js" ] || [ -f "prisma/schema.prisma" ]; then
        node -e "
        require('dotenv').config();
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        prisma.\$connect()
            .then(() => {
                console.log('✅ Database connection successful!');
                prisma.\$disconnect();
                process.exit(0);
            })
            .catch((e) => {
                console.log('❌ Database connection failed:');
                console.log('   Error:', e.message);
                process.exit(1);
            });
        " 2>&1 && echo -e "${GREEN}✅ Connection test passed!${NC}" || echo -e "${YELLOW}⚠️  Connection test failed (this might be okay if Prisma client needs regeneration)${NC}"
    else
        echo -e "${YELLOW}⚠️  Prisma not found. Skipping connection test.${NC}"
        echo "   Run 'npx prisma generate' and 'npm install' if needed."
    fi
else
    echo -e "${YELLOW}⚠️  Node.js not available. Skipping connection test.${NC}"
fi

echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Database connection string updated successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. If on production server, restart PM2:"
echo "     pm2 restart abcotronics-erp"
echo ""
echo "  2. If Prisma client needs regeneration:"
echo "     npx prisma generate"
echo ""
echo "  3. Test the connection:"
echo "     curl http://127.0.0.1:3000/api/health"
echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""
