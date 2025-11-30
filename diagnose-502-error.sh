#!/bin/bash

###############################################################################
# 502 Bad Gateway Diagnostic Script
# Run this on the production server to diagnose backend connectivity issues
###############################################################################

set -e

echo "🔍 Diagnosing 502 Bad Gateway Error..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check 1: PM2 Status
echo -e "${YELLOW}1. Checking PM2 Status...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 status
    echo ""
    
    # Check if abcotronics-erp is running
    if pm2 list | grep -q "abcotronics-erp.*online"; then
        echo -e "${GREEN}✅ PM2 process is running${NC}"
    else
        echo -e "${RED}❌ PM2 process is NOT running!${NC}"
        echo "   Attempting to start..."
        pm2 start ecosystem.config.mjs || pm2 start ecosystem.config.js || echo "   Failed to start. Check logs below."
    fi
else
    echo -e "${RED}❌ PM2 is not installed or not in PATH${NC}"
fi
echo ""

# Check 2: Backend Port Availability
echo -e "${YELLOW}2. Checking if backend is listening on ports 3000 and 3001...${NC}"
if netstat -tuln 2>/dev/null | grep -q ":3000\|:3001" || ss -tuln 2>/dev/null | grep -q ":3000\|:3001"; then
    echo -e "${GREEN}✅ Backend is listening on port 3000 or 3001${NC}"
    netstat -tuln 2>/dev/null | grep ":3000\|:3001" || ss -tuln 2>/dev/null | grep ":3000\|:3001"
else
    echo -e "${RED}❌ Backend is NOT listening on ports 3000 or 3001${NC}"
    echo "   This means the Express server is not running or crashed."
fi
echo ""

# Check 3: Test Backend Directly
echo -e "${YELLOW}3. Testing backend directly (bypassing nginx)...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health | grep -q "200"; then
    echo -e "${GREEN}✅ Backend responds on port 3000${NC}"
    curl -s http://127.0.0.1:3000/api/health | head -20
else
    echo -e "${RED}❌ Backend does NOT respond on port 3000${NC}"
    echo "   Response:"
    curl -s http://127.0.0.1:3000/api/health || echo "   Connection refused or timeout"
fi
echo ""

# Check 4: PM2 Logs (Recent Errors)
echo -e "${YELLOW}4. Checking recent PM2 error logs...${NC}"
if [ -f "./logs/pm2-error.log" ]; then
    echo "Last 30 lines of error log:"
    tail -30 ./logs/pm2-error.log
elif [ -f "logs/pm2-error.log" ]; then
    echo "Last 30 lines of error log:"
    tail -30 logs/pm2-error.log
else
    echo "No error log found. Checking PM2 logs directly:"
    pm2 logs abcotronics-erp --lines 30 --err 2>/dev/null || echo "Could not retrieve logs"
fi
echo ""

# Check 5: PM2 Output Logs
echo -e "${YELLOW}5. Checking recent PM2 output logs...${NC}"
if [ -f "./logs/pm2-out.log" ]; then
    echo "Last 30 lines of output log:"
    tail -30 ./logs/pm2-out.log
elif [ -f "logs/pm2-out.log" ]; then
    echo "Last 30 lines of output log:"
    tail -30 logs/pm2-out.log
else
    echo "No output log found. Checking PM2 logs directly:"
    pm2 logs abcotronics-erp --lines 30 --out 2>/dev/null || echo "Could not retrieve logs"
fi
echo ""

# Check 6: Nginx Error Logs
echo -e "${YELLOW}6. Checking nginx error logs for backend connection issues...${NC}"
if [ -f "/var/log/nginx/abcotronics-erp.error.log" ]; then
    echo "Recent nginx errors:"
    tail -20 /var/log/nginx/abcotronics-erp.error.log | grep -i "502\|bad gateway\|upstream\|connect" || echo "No 502 errors in recent logs"
elif [ -f "/var/log/nginx/error.log" ]; then
    echo "Recent nginx errors:"
    tail -20 /var/log/nginx/error.log | grep -i "502\|bad gateway\|upstream\|connect" || echo "No 502 errors in recent logs"
else
    echo "Nginx error log not found at standard locations"
fi
echo ""

# Check 7: Environment Variables
echo -e "${YELLOW}7. Checking critical environment variables...${NC}"
if [ -f ".env" ]; then
    if grep -q "DATABASE_URL" .env; then
        echo -e "${GREEN}✅ DATABASE_URL is set in .env${NC}"
        # Don't print the actual URL for security
        grep "DATABASE_URL" .env | sed 's/=.*/=***REDACTED***/'
    else
        echo -e "${RED}❌ DATABASE_URL is NOT set in .env${NC}"
    fi
    
    if grep -q "PORT" .env; then
        echo -e "${GREEN}✅ PORT is set in .env${NC}"
        grep "PORT" .env
    else
        echo -e "${YELLOW}⚠️  PORT not set in .env (will default to 3000)${NC}"
    fi
else
    echo -e "${RED}❌ .env file not found!${NC}"
fi
echo ""

# Check 8: Database Connectivity (if DATABASE_URL is set)
echo -e "${YELLOW}8. Testing database connectivity...${NC}"
if [ -f ".env" ] && grep -q "DATABASE_URL" .env; then
    # Try to test database connection using node
    if command -v node &> /dev/null; then
        node -e "
        require('dotenv').config();
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        prisma.\$connect()
            .then(() => {
                console.log('✅ Database connection successful');
                process.exit(0);
            })
            .catch((e) => {
                console.log('❌ Database connection failed:', e.message);
                process.exit(1);
            });
        " 2>&1 || echo -e "${RED}❌ Could not test database connection${NC}"
    else
        echo "Node.js not available for database test"
    fi
else
    echo "Skipping database test (DATABASE_URL not found)"
fi
echo ""

# Summary and Recommendations
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}SUMMARY & RECOMMENDATIONS:${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "If PM2 process is not running:"
echo "  1. Navigate to the project root directory"
echo "  2. Run: pm2 start ecosystem.config.mjs"
echo "  3. Or: pm2 restart abcotronics-erp"
echo ""
echo "If backend is not responding:"
echo "  1. Check PM2 logs: pm2 logs abcotronics-erp"
echo "  2. Check for database connection errors"
echo "  3. Verify .env file has correct DATABASE_URL"
echo "  4. Restart PM2: pm2 restart abcotronics-erp"
echo ""
echo "If nginx can't connect:"
echo "  1. Verify backend is running: curl http://127.0.0.1:3000/api/health"
echo "  2. Check nginx config: sudo nginx -t"
echo "  3. Reload nginx: sudo systemctl reload nginx"
echo ""
echo "Quick fix commands:"
echo "  cd /path/to/project"
echo "  pm2 restart abcotronics-erp"
echo "  pm2 logs abcotronics-erp --lines 50"
echo ""


