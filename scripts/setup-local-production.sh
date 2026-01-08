#!/bin/bash
# Setup script for local production-like environment
# This mimics the droplet environment for testing before deployment

set -e

echo "🔧 Setting up local production environment..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    if [ -f docs/env.template ]; then
        cp docs/env.template .env
        echo "✅ Created .env file from template"
        echo "⚠️  Please edit .env and add your production-like values"
        echo "   (You can use the same DATABASE_URL, JWT_SECRET, etc. from production)"
    else
        echo "❌ docs/env.template not found. Creating minimal .env..."
        cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
APP_URL="http://localhost:3000"
EOF
        echo "✅ Created minimal .env file"
    fi
else
    echo "✅ .env file already exists"
fi

# Check for required environment variables
echo ""
echo "🔍 Checking required environment variables..."

REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET")
MISSING_VARS=()

for VAR in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${VAR}=" .env 2>/dev/null || grep -q "^${VAR}=$" .env 2>/dev/null || grep -q "^${VAR}=\"\"$" .env 2>/dev/null; then
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "⚠️  Missing required environment variables:"
    for VAR in "${MISSING_VARS[@]}"; do
        echo "   - $VAR"
    done
    echo ""
    echo "Please add these to your .env file before running the local production server."
    echo ""
    echo "To get production values, you can SSH into the droplet:"
    echo "  ssh root@165.22.127.196 'cat /var/www/abcotronics-erp/.env | grep -E \"^(DATABASE_URL|JWT_SECRET)=\"'"
    echo ""
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Build the application
echo "🏗️  Building application (matching production build)..."
npm run build

echo ""
echo "✅ Local production environment setup complete!"
echo ""
echo "To start the local production server, run:"
echo "  npm run start:local-prod"
echo ""
echo "Or use PM2 (like production):"
echo "  npm run start:local-prod:pm2"
echo ""


