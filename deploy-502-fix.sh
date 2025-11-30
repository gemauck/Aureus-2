#!/bin/bash
# Deploy 502 fix for projects API endpoint
# This fixes the undefined errorMessage variable bug

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying 502 fix for projects API...${NC}"

# Check if we're on the production server or local
if [ -f "/var/www/abcotronics-erp/server.js" ]; then
    SERVER_DIR="/var/www/abcotronics-erp"
    echo -e "${YELLOW}📦 Production server detected${NC}"
else
    SERVER_DIR="$(pwd)"
    echo -e "${YELLOW}📦 Local development detected${NC}"
fi

# Verify the fix is in place
echo -e "${YELLOW}🔍 Verifying fix...${NC}"
if grep -q "const errorMessage = dbError.message || ''" "$SERVER_DIR/api/projects.js"; then
    echo -e "${GREEN}✅ Fix verified in api/projects.js${NC}"
else
    echo -e "${RED}❌ Fix not found! Please ensure the fix is applied.${NC}"
    exit 1
fi

# Check syntax
echo -e "${YELLOW}🔍 Checking syntax...${NC}"
if node -c "$SERVER_DIR/api/projects.js" 2>/dev/null; then
    echo -e "${GREEN}✅ Syntax check passed${NC}"
else
    echo -e "${RED}❌ Syntax error detected!${NC}"
    node -c "$SERVER_DIR/api/projects.js"
    exit 1
fi

# If on production server, restart PM2
if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}🔄 Restarting PM2...${NC}"
    pm2 restart abcotronics-erp 2>/dev/null || {
        echo -e "${YELLOW}⚠️  PM2 app 'abcotronics-erp' not found, trying to reload all...${NC}"
        pm2 reload all 2>/dev/null || {
            echo -e "${YELLOW}⚠️  PM2 reload failed, trying restart all...${NC}"
            pm2 restart all 2>/dev/null || echo -e "${YELLOW}⚠️  PM2 not available - manual restart may be required${NC}"
        }
    }
    echo -e "${GREEN}✅ PM2 restarted${NC}"
    
    # Wait a moment for server to start
    sleep 2
    
    # Check PM2 status
    echo -e "${YELLOW}📊 PM2 Status:${NC}"
    pm2 status
else
    echo -e "${YELLOW}⚠️  PM2 not found - if server is running, restart it manually${NC}"
    echo -e "${YELLOW}   For local dev: npm start${NC}"
    echo -e "${YELLOW}   For production: pm2 restart abcotronics-erp${NC}"
fi

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "   1. Monitor server logs: pm2 logs abcotronics-erp"
echo -e "   2. Test API endpoint: curl https://abcoafrica.co.za/api/projects"
echo -e "   3. Check browser console for 502 errors"
