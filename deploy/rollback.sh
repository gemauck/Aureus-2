#!/bin/bash

###############################################################################
# Rollback Script - Revert to previous deployment
###############################################################################

set -e

echo "⚠️  Rolling back Abcotronics ERP deployment..."

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Check if we have a commit hash to rollback to
ROLLBACK_COMMIT=${1:-HEAD~1}

echo -e "${YELLOW}Rolling back to: $ROLLBACK_COMMIT${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled"
    exit 1
fi

# Navigate to app directory
cd /var/www/abcotronics-erp

# Stash any local changes
echo -e "${YELLOW}Stashing local changes...${NC}"
git stash

# Checkout previous version
echo -e "${YELLOW}Checking out $ROLLBACK_COMMIT...${NC}"
git checkout $ROLLBACK_COMMIT

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
cd server
npm ci --only=production

# Restart application
echo -e "${YELLOW}Restarting application...${NC}"
pm2 restart abcotronics-erp

# Check status
echo -e "${GREEN}Rollback complete!${NC}"
pm2 status
pm2 logs --lines 20

echo ""
echo -e "${RED}⚠️  Remember to:${NC}"
echo "1. Check application is working correctly"
echo "2. Review what caused the need for rollback"
echo "3. Fix the issue before deploying again"
echo ""
echo "To go back to latest:"
echo "git checkout main && git pull"
