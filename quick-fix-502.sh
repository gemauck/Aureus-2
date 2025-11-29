#!/bin/bash

###############################################################################
# Quick Fix Script for 502 Bad Gateway Error
# Run this on the production server to quickly restart the backend
###############################################################################

set -e

echo "🔧 Quick Fix for 502 Bad Gateway Error..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get the project directory (assuming script is in project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Working directory: $(pwd)${NC}"
echo ""

# Step 1: Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 is not installed!${NC}"
    echo "   Install with: npm install -g pm2"
    exit 1
fi

# Step 2: Stop existing process
echo -e "${YELLOW}1. Stopping existing PM2 process...${NC}"
pm2 stop abcotronics-erp 2>/dev/null || echo "   No existing process to stop"
pm2 delete abcotronics-erp 2>/dev/null || echo "   No existing process to delete"
echo ""

# Step 3: Check for ecosystem config
echo -e "${YELLOW}2. Checking for PM2 configuration...${NC}"
if [ -f "ecosystem.config.mjs" ]; then
    CONFIG_FILE="ecosystem.config.mjs"
    echo -e "${GREEN}✅ Found ecosystem.config.mjs${NC}"
elif [ -f "ecosystem.config.js" ]; then
    CONFIG_FILE="ecosystem.config.js"
    echo -e "${GREEN}✅ Found ecosystem.config.js${NC}"
elif [ -f "ecosystem.config.cjs" ]; then
    CONFIG_FILE="ecosystem.config.cjs"
    echo -e "${GREEN}✅ Found ecosystem.config.cjs${NC}"
else
    echo -e "${RED}❌ No PM2 config file found!${NC}"
    echo "   Looking for: ecosystem.config.mjs, ecosystem.config.js, or ecosystem.config.cjs"
    exit 1
fi
echo ""

# Step 4: Check for .env file
echo -e "${YELLOW}3. Checking environment configuration...${NC}"
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ Found .env file${NC}"
    if grep -q "DATABASE_URL" .env; then
        echo -e "${GREEN}✅ DATABASE_URL is set${NC}"
    else
        echo -e "${RED}❌ DATABASE_URL is NOT set in .env${NC}"
        echo "   This will cause the server to fail!"
    fi
else
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "   The server needs a .env file with DATABASE_URL"
    exit 1
fi
echo ""

# Step 5: Check if server.js exists
echo -e "${YELLOW}4. Checking for server entry point...${NC}"
if [ -f "server.js" ]; then
    echo -e "${GREEN}✅ Found server.js${NC}"
else
    echo -e "${RED}❌ server.js not found!${NC}"
    exit 1
fi
echo ""

# Step 6: Start PM2 with the config
echo -e "${YELLOW}5. Starting backend server with PM2...${NC}"
pm2 start "$CONFIG_FILE" || {
    echo -e "${RED}❌ Failed to start PM2!${NC}"
    echo "   Trying alternative method..."
    pm2 start server.js --name abcotronics-erp --env production || {
        echo -e "${RED}❌ Failed to start server!${NC}"
        exit 1
    }
}
echo ""

# Step 7: Save PM2 configuration
echo -e "${YELLOW}6. Saving PM2 configuration...${NC}"
pm2 save
echo ""

# Step 8: Wait a moment for server to start
echo -e "${YELLOW}7. Waiting for server to initialize...${NC}"
sleep 3
echo ""

# Step 9: Check PM2 status
echo -e "${YELLOW}8. Checking PM2 status...${NC}"
pm2 status
echo ""

# Step 10: Test backend health endpoint
echo -e "${YELLOW}9. Testing backend health endpoint...${NC}"
sleep 2
if curl -s -f http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is responding!${NC}"
    curl -s http://127.0.0.1:3000/api/health | head -5
else
    echo -e "${RED}❌ Backend is NOT responding yet${NC}"
    echo "   Checking logs..."
    pm2 logs abcotronics-erp --lines 20 --nostream
fi
echo ""

# Step 11: Show recent logs
echo -e "${YELLOW}10. Recent server logs:${NC}"
pm2 logs abcotronics-erp --lines 30 --nostream || echo "Could not retrieve logs"
echo ""

# Summary
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
if pm2 list | grep -q "abcotronics-erp.*online"; then
    echo -e "${GREEN}✅ Backend server restarted successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Test the API: curl https://abcoafrica.co.za/api/health"
    echo "  2. Monitor logs: pm2 logs abcotronics-erp"
    echo "  3. Check status: pm2 status"
else
    echo -e "${RED}❌ Backend server failed to start${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check logs: pm2 logs abcotronics-erp"
    echo "  2. Verify .env file has correct DATABASE_URL"
    echo "  3. Check for port conflicts: netstat -tuln | grep 3000"
    echo "  4. Run diagnostic: ./diagnose-502-error.sh"
fi
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

