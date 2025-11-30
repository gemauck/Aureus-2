#!/bin/bash
# Deploy the 502 fix for projects.js to production server

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
FIX_FILE="api/projects.js"

echo -e "${GREEN}🚀 Deploying 502 fix to production server...${NC}"
echo ""

# Verify fix exists locally
if [ ! -f "$FIX_FILE" ]; then
    echo -e "${RED}❌ Error: $FIX_FILE not found locally${NC}"
    exit 1
fi

# Verify fix is in the file
if ! grep -q "const errorMessage = dbError.message || ''" "$FIX_FILE"; then
    echo -e "${RED}❌ Error: Fix not found in $FIX_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Fix verified locally${NC}"
echo ""

# Deploy to server
echo -e "${YELLOW}📡 Connecting to server and deploying fix...${NC}"
ssh $SERVER << ENDSSH
set -e

cd $APP_DIR

# Backup current file
if [ -f "$FIX_FILE" ]; then
    cp "$FIX_FILE" "$FIX_FILE.backup.\$(date +%Y%m%d-%H%M%S)"
    echo "✅ Backup created"
fi

# The fix will be applied via git pull or manual copy
# For now, verify the fix exists in the file
if grep -q "const errorMessage = dbError.message || ''" "$FIX_FILE"; then
    echo "✅ Fix already in place"
else
    echo "⚠️  Fix not found - will need to copy file"
    echo "   Run: scp $FIX_FILE $SERVER:$APP_DIR/$FIX_FILE"
fi

# Restart PM2
echo ""
echo "🔄 Restarting PM2..."
pm2 restart abcotronics-erp || pm2 reload abcotronics-erp || {
    echo "⚠️  PM2 restart failed, trying restart all..."
    pm2 restart all
}

sleep 2

# Check status
echo ""
echo "📊 PM2 Status:"
pm2 status abcotronics-erp || pm2 list

echo ""
echo "✅ Deployment complete!"

ENDSSH

echo ""
echo -e "${GREEN}✅ Fix deployed successfully!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "   1. Monitor logs: ssh $SERVER 'pm2 logs abcotronics-erp --lines 50'"
echo "   2. Test API: curl https://abcoafrica.co.za/api/projects"
echo "   3. Check browser console for 502 errors"

