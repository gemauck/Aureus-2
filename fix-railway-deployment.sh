#!/bin/bash

# Railway Deployment Fix Script
echo "🚀 Starting Railway deployment fix..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Remove conflicting configuration files
echo "🧹 Cleaning up configuration conflicts..."
rm -f railway.toml  # Remove old toml config to avoid conflicts

# Ensure proper build configuration
echo "🔧 Updating build configuration..."
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

# Create nixpacks configuration for better build control
cat > nixpacks.toml << 'EOF'
[phases.setup]
nixPkgs = ["nodejs", "npm"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm start"
EOF

# Update package.json build script
echo "📦 Updating package.json build script..."
npm pkg set scripts.build="prisma generate"
npm pkg set scripts.railway-build="prisma generate && prisma migrate deploy"

# Check for required environment variables
echo "🔍 Checking environment setup..."
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  Warning: DATABASE_URL not set. Make sure it's configured in Railway."
fi

if [ -z "$JWT_SECRET" ]; then
    echo "⚠️  Warning: JWT_SECRET not set. Make sure it's configured in Railway."
fi

# Test local build
echo "🧪 Testing local build..."
if npm run build; then
    echo "✅ Build test successful"
else
    echo "❌ Build test failed"
    exit 1
fi

# Test server startup
echo "🧪 Testing server startup..."
timeout 10s npm start &
SERVER_PID=$!
sleep 5

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server startup test successful"
    kill $SERVER_PID
else
    echo "❌ Server startup test failed"
    exit 1
fi

echo "🎉 Railway deployment fix completed!"
echo ""
echo "Next steps:"
echo "1. Commit these changes: git add . && git commit -m 'Fix Railway deployment configuration'"
echo "2. Push to trigger deployment: git push origin main"
echo "3. Monitor Railway dashboard for deployment progress"
echo ""
echo "If deployment still stalls, check Railway logs for specific error messages."
