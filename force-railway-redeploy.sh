#!/bin/bash

# 🚀 FORCE RAILWAY REDEPLOYMENT SCRIPT
echo "🚀 FORCING RAILWAY REDEPLOYMENT"
echo "==============================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found project directory"

# Remove all Railway config files to force detection
echo "🗑️ Removing old Railway config files..."
rm -f railway.json railway.toml Procfile

# Create a simple railway.json that forces Node.js detection
echo "📝 Creating new Railway configuration..."
cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

# Create a Procfile
echo "📝 Creating Procfile..."
echo "web: npm start" > Procfile

# Create a railway.toml
echo "📝 Creating railway.toml..."
cat > railway.toml << 'EOF'
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
EOF

# Ensure package.json has correct start script
echo "📝 Ensuring package.json has correct start script..."
if ! grep -q '"start": "node server-production.js"' package.json; then
    echo "⚠️ Warning: package.json start script may not be correct"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Deploy database migrations
echo "🗄️ Deploying database migrations..."
npx prisma migrate deploy

echo ""
echo "🎯 RAILWAY CONFIGURATION UPDATED!"
echo "=================================="
echo "✅ Removed old config files"
echo "✅ Created new railway.json"
echo "✅ Created Procfile"
echo "✅ Created railway.toml"
echo "✅ Dependencies installed"
echo "✅ Prisma client generated"
echo "✅ Database migrations deployed"
echo ""
echo "🚀 NEXT STEPS:"
echo "1. Commit and push these changes:"
echo "   git add ."
echo "   git commit -m 'Force Railway redeployment with correct config'"
echo "   git push origin main"
echo ""
echo "2. Go to Railway dashboard: https://railway.app/dashboard"
echo "3. Select your project: abco-erp-2-production"
echo "4. Go to Settings → Deploy"
echo "5. Verify Start Command is: npm start"
echo "6. Click 'Redeploy' button"
echo "7. Wait for deployment to complete (2-3 minutes)"
echo ""
echo "🧪 TEST AFTER DEPLOYMENT:"
echo "1. Run: ./test-railway-deployment.sh"
echo "2. Open: https://abco-erp-2-production.up.railway.app/"
echo "3. Login: admin@abcotronics.com / admin123"
echo "4. Create a client with contacts"
echo "5. Refresh the page - data should persist! ✅"
