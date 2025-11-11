#!/bin/bash

###############################################################################
# Quick Deploy Script - Run this after pulling latest changes
###############################################################################

set -e

echo "🚀 Deploying Abcotronics ERP..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Navigate to server directory
cd server

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm ci --only=production

# Run migrations
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
npm run migrate || echo "No migrations to run"

# Restart PM2
echo -e "${YELLOW}🔄 Restarting application...${NC}"
pm2 restart abcotronics-erp || pm2 start ../ecosystem.config.js

# Save PM2 config
pm2 save

# Show status
echo -e "${GREEN}✅ Deployment complete!${NC}"
pm2 status
pm2 logs --lines 20

echo ""
echo -e "${GREEN}Application is running!${NC}"
echo "Monitor logs: pm2 logs"
echo "Check status: pm2 status"
