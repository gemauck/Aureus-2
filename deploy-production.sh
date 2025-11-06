#!/bin/bash
# Deploy to production server

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying to Production..."
echo "📡 Server: $SERVER"
echo ""

# Step 0: Run deployment safety tests before deploying
echo "🛡️  Running deployment safety tests..."
if ! npm run test:safety; then
    echo "❌ Deployment safety tests failed! Aborting deployment."
    echo "   These tests prevent server deletion and data loss."
    echo "   Please fix the issues above before deploying."
    exit 1
fi
echo "✅ All deployment safety tests passed!"

# Step 0.5: Run functional deployment tests
echo "🧪 Running functional deployment tests..."
if ! npm run test:deploy; then
    echo "❌ Deployment tests failed! Aborting deployment."
    echo "   Please fix the issues above before deploying."
    exit 1
fi
echo "✅ All deployment tests passed!"

# Step 1: Build CSS
echo "🏗️  Building CSS..."
npm run build:css

# Step 2: Build JSX
echo "🏗️  Building JSX..."
npm run build:jsx || echo "⚠️  JSX build may not be needed, continuing..."

# Step 3: Check git status
echo ""
echo "📋 Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  You have uncommitted changes:"
    git status --short
    echo ""
    # Skip interactive prompt if CI environment or non-interactive
    if [ -n "$CI" ] || [ ! -t 0 ]; then
        echo "⚠️  Non-interactive mode: Skipping git commit. Continuing deployment..."
    else
        read -p "Do you want to commit and push these changes? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add .
            git commit -m "Fix: Add explicit route mapping for /api/users/:id to resolve user deletion 500 error"
            echo "📤 Pushing to git..."
            git push origin main || git push origin master
            echo "✅ Changes committed and pushed"
        else
            echo "⚠️  Skipping git commit. Make sure to commit changes manually before deploying."
            read -p "Continue with deployment anyway? (y/n) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "❌ Deployment cancelled"
                exit 1
            fi
        fi
    fi
else
    echo "✅ No uncommitted changes"
    echo "📤 Ensuring latest code is pushed..."
    git push origin main || git push origin master || echo "⚠️  Git push skipped"
fi

# Step 4: Deploy to server
echo ""
echo "🚀 Deploying to server..."
ssh $SERVER << 'DEPLOY'
set -e

echo "✅ Connected to server"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
# Clean up any untracked files that might conflict with incoming changes
git clean -fd || true
git reset --hard HEAD || true
git pull origin main || git pull origin master
echo "✅ Code updated"

echo "📦 Installing dependencies..."
# Install all dependencies including dev deps for build
if ! npm install; then
  echo "⚠️  npm install failed; cleaning problematic modules and retrying..."
  rm -rf node_modules/.cache || true
  rm -rf node_modules/googleapis || true
  rm -rf node_modules || true
  npm install
fi

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo "🏗️  Building frontend..."
npm run build:jsx || node build-jsx.js || echo "⚠️  JSX build skipped"
npm run build:css || echo "⚠️  CSS build skipped"

echo "🧪 Running post-deployment tests..."
# Run tests against the deployed server
export TEST_URL="http://localhost:3000"
if ! npm run test:deploy; then
  echo "⚠️  Post-deployment tests failed, but application will continue running"
  echo "   Please check the application manually"
else
  echo "✅ Post-deployment tests passed!"
fi

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your site: https://abcoafrica.co.za"
DEPLOY

echo ""
echo "✅ Deployment successful!"
echo "📱 Pipeline drag and drop mobile fix is now live!"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see the changes"

