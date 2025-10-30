#!/bin/bash
# Deploy bulk client import to production

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying bulk client import script to production..."
echo "📡 Droplet IP: $DROPLET_IP"

# Push the script to server and run it
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"

# Navigate to app directory
cd /var/www/abcotronics-erp

echo "📁 Current directory: $(pwd)"

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

# Install any new dependencies
echo "📦 Checking dependencies..."
npm install --production

# Generate Prisma client if needed
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Run the bulk client import script
echo "🌱 Running bulk client import script..."
DATABASE_URL="${DATABASE_URL}" node scripts/bulk-add-clients.js

echo "✅ Bulk client import completed!"
ENDSSH

echo "✅ Deployment and import successful!"

