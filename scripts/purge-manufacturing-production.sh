#!/bin/bash
# Purge all manufacturing data from the PRODUCTION database.
# This connects to the production server and runs the purge script there
# (using production .env / DATABASE_URL).
#
# Usage: ./scripts/purge-manufacturing-production.sh

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

PROD_SERVER="${PROD_SERVER:-root@165.22.127.196}"
PROD_APP_DIR="${PROD_APP_DIR:-/var/www/abcotronics-erp}"

echo -e "${RED}"
echo "═══════════════════════════════════════════════════════════════"
echo "  PRODUCTION MANUFACTURING PURGE"
echo "  This will DELETE all manufacturing data on PRODUCTION."
echo "  Server: ${PROD_SERVER}"
echo "  App dir: ${PROD_APP_DIR}"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"

echo "The following will be deleted:"
echo "  - Stock movements"
echo "  - Production orders"
echo "  - Sales orders (manufacturing-related)"
echo "  - Purchase orders"
echo "  - Suppliers"
echo "  - Location inventory"
echo "  - BOMs"
echo "  - Inventory items"
echo "  - Stock locations"
echo ""
echo -e "${YELLOW}This cannot be undone.${NC}"
echo ""
read -p "Type PURGE_PROD and press Enter to continue (or anything else to abort): " confirm
if [ "$confirm" != "PURGE_PROD" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo -e "${GREEN}Running purge on production server...${NC}"
ssh "${PROD_SERVER}" "cd ${PROD_APP_DIR} && node scripts/purge-manufacturing-data.js"

echo ""
echo -e "${GREEN}Done.${NC}"
