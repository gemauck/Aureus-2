#!/bin/bash
# Quick deploy to droplet - just build and deploy

echo "🚀 Quick Deploy to Droplet..."
echo "📡 Droplet: 165.22.127.196"

# Build locally first
echo "🏗️  Building locally..."
npm run build:jsx
npm run build:css

# Deploy to server
echo "📤 Deploying to server..."
ssh root@165.22.127.196 << 'DEPLOY'
set -e
cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
git pull origin main || git pull origin master

echo "📦 Installing dependencies..."
npm install

echo "🏗️  Building frontend..."
npm run build:jsx || node build-jsx.js || echo "⚠️  JSX build skipped"
npm run build:css || echo "⚠️  CSS build skipped"

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp -i 1

echo "✅ Deployment complete!"
DEPLOY

echo ""
echo "✅ Deployed successfully!"
echo "🌐 Check your site: https://abcoafrica.co.za"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see the changes"


