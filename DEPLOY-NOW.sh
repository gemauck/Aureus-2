#!/bin/bash
# Quick deploy - copy and paste this entire block into your terminal

set -e

echo "🚀 Deploying HTTP/2 fix..."
echo ""

# Step 1: Upload fix script
echo "📤 Uploading fix script..."
scp fix-http2-nginx.sh root@abcoafrica.co.za:/root/

# Step 2: Deploy on server
echo "🔧 Applying fixes on server..."
ssh root@abcoafrica.co.za << 'DEPLOY'
set -e
cd /var/www/abcotronics-erp
echo "📥 Pulling latest code..."
git pull origin main
echo "✅ Code updated"
echo ""
echo "🧱 Building frontend (JSX → dist)..."
if command -v npm >/dev/null 2>&1; then
  npm ci --omit=dev || npm install --omit=dev || true
  npm run build:jsx || node build-jsx.js
else
  node build-jsx.js
fi
echo "✅ Frontend built"
echo ""
echo "🔧 Applying nginx HTTP/2 fix..."
chmod +x /root/fix-http2-nginx.sh
/root/fix-http2-nginx.sh
echo ""
echo "🔄 Restarting app..."
pm2 restart abcotronics-erp
echo "✅ Done!"
DEPLOY

echo ""
echo "✅ Deployment complete! Hard refresh your browser (Cmd+Shift+R)"

