#!/bin/bash

# Quick Diagnostic and Fix Script
# This script checks server health and applies the fixes

echo "🔍 ===== PERSISTENCE DIAGNOSTIC & FIX SCRIPT ====="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get droplet IP
if [ -f .droplet_ip ]; then
    DROPLET_IP=$(cat .droplet_ip)
    echo "📍 Server IP: $DROPLET_IP"
else
    echo "${RED}❌ .droplet_ip file not found${NC}"
    exit 1
fi

echo ""
echo "🏥 Step 1: Check Server Health"
echo "================================"

# Check if server is responsive
echo "Checking server HTTP response..."
if curl -sf "https://abcoafrica.co.za/health" > /dev/null; then
    echo "${GREEN}✅ Server is responding${NC}"
else
    echo "${RED}❌ Server is not responding${NC}"
    echo "   Attempting to restart..."
    ssh root@$DROPLET_IP "pm2 restart all"
    sleep 5
fi

# Check PM2 status
echo ""
echo "Checking PM2 process status..."
ssh root@$DROPLET_IP "pm2 status"

# Check server logs for errors
echo ""
echo "📋 Step 2: Check Recent Server Logs"
echo "===================================="
echo "Looking for connection errors..."
ssh root@$DROPLET_IP "pm2 logs --lines 50 --nostream | grep -E '(ERR_|ECONNREFUSED|Connection|refused|timeout)' || echo 'No connection errors found'"

echo ""
echo "💾 Step 3: Check Database"
echo "========================="

# Check database connectivity
echo "Testing database connection..."
ssh root@$DROPLET_IP "cd /root/erp && node -e \"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\\\$connect()
    .then(() => {
        console.log('✅ Database connection successful');
        return prisma.client.count();
    })
    .then(count => {
        console.log('✅ Client count:', count);
        return prisma.\\\$disconnect();
    })
    .catch(err => {
        console.error('❌ Database error:', err.message);
        process.exit(1);
    });
\""

# Run SQL diagnostics
echo ""
echo "Running SQL diagnostics..."
if [ -f .env ]; then
    DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d ' "' | tr -d "'")
    if [ ! -z "$DATABASE_URL" ]; then
        echo "Checking opportunities for test client..."
        ssh root@$DROPLET_IP "psql \"$DATABASE_URL\" -c \"SELECT COUNT(*) as opportunity_count FROM \\\"Opportunity\\\" WHERE \\\"clientId\\\" = 'cmh9mhcne0001723xifv2lsqo';\""
        
        echo ""
        echo "Checking client data fields..."
        ssh root@$DROPLET_IP "psql \"$DATABASE_URL\" -c \"SELECT id, name, LENGTH(contacts) as contacts_len, LENGTH(sites) as sites_len, LENGTH(comments) as comments_len FROM \\\"Client\\\" WHERE id = 'cmh9mhcne0001723xifv2lsqo';\""
    fi
fi

echo ""
echo "🔧 Step 4: Apply Fixes"
echo "======================"

# Check if apiRetry.js exists
if [ -f src/utils/apiRetry.js ]; then
    echo "${GREEN}✅ apiRetry.js already exists${NC}"
else
    echo "${YELLOW}⚠️  apiRetry.js not found - needs to be created${NC}"
fi

# Check if fix documentation exists
if [ -f CACHE-INVALIDATION-AND-CONNECTION-FIX.md ]; then
    echo "${GREEN}✅ Fix documentation exists${NC}"
else
    echo "${YELLOW}⚠️  Fix documentation not found${NC}"
fi

echo ""
echo "📦 Step 5: Memory and Resource Check"
echo "====================================="

# Check memory usage
echo "Server memory usage:"
ssh root@$DROPLET_IP "free -h"

echo ""
echo "PM2 memory usage:"
ssh root@$DROPLET_IP "pm2 monit --no-daemon" &
PM2_PID=$!
sleep 3
kill $PM2_PID 2>/dev/null

echo ""
echo "🎯 Step 6: Test Critical Endpoints"
echo "==================================="

# Test opportunities endpoint
echo "Testing opportunities endpoint..."
TOKEN=$(grep 'token' .env 2>/dev/null | cut -d '=' -f2 | tr -d ' "' | tr -d "'")
if curl -sf -H "Authorization: Bearer $TOKEN" "https://abcoafrica.co.za/api/opportunities" > /dev/null; then
    echo "${GREEN}✅ Opportunities endpoint working${NC}"
else
    echo "${RED}❌ Opportunities endpoint failed${NC}"
fi

# Test contacts endpoint
echo "Testing contacts endpoint for test client..."
if curl -sf -H "Authorization: Bearer $TOKEN" "https://abcoafrica.co.za/api/contacts/client/cmh9mhcne0001723xifv2lsqo" > /dev/null; then
    echo "${GREEN}✅ Contacts endpoint working${NC}"
else
    echo "${RED}❌ Contacts endpoint failed${NC}"
fi

# Test sites endpoint
echo "Testing sites endpoint for test client..."
if curl -sf -H "Authorization: Bearer $TOKEN" "https://abcoafrica.co.za/api/sites/client/cmh9mhcne0001723xifv2lsqo" > /dev/null; then
    echo "${GREEN}✅ Sites endpoint working${NC}"
else
    echo "${RED}❌ Sites endpoint failed${NC}"
fi

echo ""
echo "📊 DIAGNOSTIC SUMMARY"
echo "===================="
echo ""
echo "✅ = Working correctly"
echo "❌ = Needs attention"
echo "⚠️  = Warning / Potential issue"
echo ""
echo "Next Steps:"
echo "1. Review the output above for any ❌ or ⚠️  issues"
echo "2. Read CACHE-INVALIDATION-AND-CONNECTION-FIX.md for detailed fixes"
echo "3. Apply fixes to ClientDetailModal.jsx as documented"
echo "4. Deploy with: ./quick-deploy.sh"
echo "5. Re-run this script to verify fixes"
echo ""
echo "🔍 For detailed SQL diagnostics, run:"
echo "   ssh root@$DROPLET_IP 'cd /root/erp && psql \$DATABASE_URL -f diagnose-database.sql'"
echo ""
