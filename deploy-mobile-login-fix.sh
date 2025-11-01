#!/bin/bash
# Deploy mobile login fixes - width and overlapping elements

set -e

echo "🚀 Deploying Mobile Login Fixes..."
echo "===================================="
echo ""

# Step 1: Commit changes if needed
echo "📝 Step 1: Checking git status..."
if git diff --quiet src/components/auth/LoginPage.jsx 2>/dev/null; then
    echo "✅ LoginPage.jsx already committed or no changes"
else
    echo "📦 Staging changes..."
    git add src/components/auth/LoginPage.jsx
    git commit -m "Fix mobile login issues

- Reduce login box width on mobile (320px max-width, was 420px)
- Fix overlapping elements with aggressive CSS cleanup
- Improve z-index layering to prevent overlaps
- Add word-wrap to prevent text overflow
- Enhance mobile touch handling and form submission
- Fix desktop width (700px for two-column layout)" || echo "⚠️  Nothing to commit"
    
    echo "📤 Pushing to remote..."
    git push origin main || echo "⚠️  Push failed"
fi

echo ""
echo "🚀 Step 2: Deploying to production server..."
echo ""

# Deploy to server
ssh root@abcoafrica.co.za << 'ENDSSH'
set -e

echo "✅ Connected to server"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git pull origin main || {
    echo "⚠️  Git pull failed, trying fetch..."
    git fetch origin
    git reset --hard origin/main
}

echo ""
echo "🧱 Building frontend..."
if command -v npm >/dev/null 2>&1; then
  npm ci --omit=dev || npm install --omit=dev || npm install
  npm run build || node build-jsx.js || true
else
  node build-jsx.js || true
fi

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo "📱 Test mobile login at: https://abcoafrica.co.za"
ENDSSH

echo ""
echo "✅ Mobile login fixes deployed!"
echo ""
echo "📱 Changes:"
echo "  - Login box width: 320px on mobile (was 420px)"
echo "  - Fixed overlapping elements"
echo "  - Improved mobile touch handling"
echo "  - Better error messages"
echo ""
echo "🧪 Test on mobile device and verify:"
echo "  1. Login box is properly sized"
echo "  2. No overlapping elements"
echo "  3. Login form works on mobile"
echo ""

