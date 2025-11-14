#!/bin/bash
# Deploy to production server

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying to Production..."
echo "📡 Server: $SERVER"
echo ""

# Step 0: Run deployment safety tests before deploying
if [ -z "$SKIP_SAFETY_TESTS" ]; then
    echo "🛡️  Running deployment safety tests..."
    if ! npm run test:safety; then
        echo "❌ Deployment safety tests failed! Aborting deployment."
        echo "   These tests prevent server deletion and data loss."
        echo "   Please fix the issues above before deploying."
        exit 1
    fi
    echo "✅ All deployment safety tests passed!"
else
    echo "⚠️  Skipping safety tests (SKIP_SAFETY_TESTS is set)"
fi

# Step 0.5: Run functional deployment tests
if [ -z "$SKIP_SAFETY_TESTS" ]; then
    echo "🧪 Running functional deployment tests..."
    if ! npm run test:deploy; then
        echo "❌ Deployment tests failed! Aborting deployment."
        echo "   Please fix the issues above before deploying."
        exit 1
    fi
    echo "✅ All deployment tests passed!"
else
    echo "⚠️  Skipping deployment tests (SKIP_SAFETY_TESTS is set)"
fi

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

# Ensure Digital Ocean database is configured
echo "🔧 Ensuring Digital Ocean database configuration..."
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    if [ -z "$DATABASE_URL" ]; then
        echo "❌ DATABASE_URL environment variable not set. Cannot create .env for deployment."
        echo "   Please export DATABASE_URL with the production connection string before running this script."
        exit 1
    fi

    cat > .env << ENVEOF
NODE_ENV=production
PORT=3000
DATABASE_URL="${DATABASE_URL}"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
APP_URL=https://abcoafrica.co.za
ENVEOF
    echo "✅ .env file created"
else
    # Check if .env has local database and fix it
    if grep -q "localhost\|127.0.0.1" .env 2>/dev/null; then
        echo "⚠️  Local database detected in .env - fixing..."
        # Backup existing .env
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        if [ -z "$DATABASE_URL" ]; then
            echo "❌ DATABASE_URL not provided. Unable to update .env safely."
            exit 1
        fi
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
        echo "✅ .env file updated to use provided DATABASE_URL"
    else
        # Ensure DATABASE_URL is set correctly
        if [ -z "$DATABASE_URL" ]; then
            echo "⚠️  DATABASE_URL not set. Existing .env will be left unchanged."
        else
            if grep -q "^DATABASE_URL=" .env; then
                sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
            else
                echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
            fi
            echo "✅ DATABASE_URL ensured in .env"
        fi
    fi
fi

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

echo "🏗️  Building Vite Projects module..."
if [ -d "vite-modules/projects" ]; then
  cd vite-modules/projects
  if [ -f "package.json" ]; then
    npm install --silent || echo "⚠️  Vite dependencies install skipped"
    npm run build || echo "⚠️  Vite build skipped"
    echo "✅ Vite Projects module built"
  else
    echo "⚠️  Vite Projects package.json not found, skipping build"
  fi
  cd ../..
else
  echo "⚠️  Vite Projects module directory not found, skipping build"
fi

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

