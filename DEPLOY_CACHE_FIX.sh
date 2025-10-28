#!/bin/bash
# Deploy cache clearing fix to production

cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"

echo "🔧 Committing cache fix..."
git add src/utils/databaseAPI-new.js
git commit -m "Fix: Ensure cache clearing code is properly deployed with correct syntax"

echo "🚀 Pushing to GitHub..."
git push origin main

echo "✅ Changes pushed! Now deploy to droplet..."
echo ""
echo "On the droplet, run:"
echo "  cd /var/www/abcotronics-erp"
echo "  git pull origin main"
echo "  pm2 restart all"
