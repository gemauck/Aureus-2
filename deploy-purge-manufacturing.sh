#!/bin/bash
# Purge manufacturing section from droplet

set -e

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🗑️  Purging manufacturing section from droplet..."
echo "📡 Droplet IP: $DROPLET_IP"
echo ""

# SSH into droplet and purge manufacturing files
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest changes from GitHub..."
git pull origin main || echo "⚠️  Git pull had issues, continuing..."

echo ""
echo "🗑️  Purging manufacturing component files..."

# Purge Manufacturing.jsx
cat > src/components/manufacturing/Manufacturing.jsx << 'EOF'
const Manufacturing = () => {
  return null;
};

export default Manufacturing;
EOF

# Purge JobCards.jsx
cat > src/components/manufacturing/JobCards.jsx << 'EOF'
const JobCards = () => {
  return null;
};

export default JobCards;
EOF

# Purge JobCardFormPublic.jsx
cat > src/components/manufacturing/JobCardFormPublic.jsx << 'EOF'
const JobCardFormPublic = () => {
  return null;
};

export default JobCardFormPublic;
EOF

# Purge StockTransactions.jsx
cat > src/components/manufacturing/StockTransactions.jsx << 'EOF'
const StockTransactions = () => {
  return null;
};

export default StockTransactions;
EOF

# Purge StockLocations.jsx
cat > src/components/manufacturing/locations/StockLocations.jsx << 'EOF'
const StockLocations = () => {
  return null;
};

export default StockLocations;
EOF

echo "✅ Manufacturing files purged"

echo ""
echo "🏗️  Building JSX files..."
npm run build:jsx || echo "⚠️ JSX build had warnings but continuing..."

echo ""
echo "🔄 Restarting application..."

# Try PM2 first
if command -v pm2 &> /dev/null; then
    echo "   Using PM2..."
    pm2 restart abcotronics-erp || pm2 restart all || pm2 start server.js --name abcotronics-erp
    pm2 save
    echo "   ✅ Application restarted with PM2"
# Try systemctl
elif systemctl list-units --type=service | grep -q abcotronics; then
    echo "   Using systemctl..."
    systemctl restart abcotronics-erp
    echo "   ✅ Application restarted with systemctl"
# Try manual restart
else
    echo "   ⚠️  No process manager found, you may need to restart manually"
fi

echo ""
echo "========================================="
echo "✅ Manufacturing section purged from droplet!"
echo "========================================="

ENDSSH

echo ""
echo "✅ Purge complete!"
echo ""
echo "🧪 Test your deployment:"
echo "   1. Visit: https://abcoafrica.co.za"
echo "   2. Check that manufacturing section is purged"
echo ""

