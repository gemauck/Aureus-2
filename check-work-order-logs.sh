#!/bin/bash
# Script to check work order logs on the server
echo "📋 Checking work order logs for the last 2 minutes..."
ssh root@165.22.127.196 "cd /var/www/abcotronics-erp && pm2 logs abcotronics-erp --lines 200 --nostream | grep -E '📦|📉|🔄|✅|⚠️|Error|Failed|Status change|Allocated|Deducted|BOM|component|in_production|requested' | tail -50"

