#!/bin/bash

# Railway Production Deployment Script
echo "🚀 Deploying to Railway with proper database configuration..."

# Check if Railway CLI is installed and user is logged in
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please log in to Railway first:"
    echo "Run: railway login"
    echo "Then run this script again."
    exit 1
fi

echo "✅ Railway CLI ready"

# Ensure we're using the working SQLite schema for now
echo "🔄 Setting up SQLite schema for Railway..."
cp prisma/schema.sqlite.prisma prisma/schema.prisma

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npx prisma generate

# Build CSS
echo "🎨 Building CSS..."
npm run build:css

# Create production environment
echo "🔑 Setting up production environment..."
cat > .env << EOF
DATABASE_URL="file:./dev.db"
JWT_SECRET="$(openssl rand -base64 32)"
NODE_ENV="production"
PORT=3000
APP_URL="https://abco-erp-2-production.up.railway.app"
EOF

echo "✅ Environment configured"

# Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up --detach

# Wait for deployment
echo "⏳ Waiting for deployment to complete..."
sleep 30

# Get deployment URL
DEPLOYMENT_URL=$(railway domain 2>/dev/null || echo "https://abco-erp-2-production.up.railway.app")
echo "🌐 Deployment URL: $DEPLOYMENT_URL"

# Set up database
echo "📊 Setting up database..."
railway run npx prisma db push

# Create admin user
echo "👤 Creating admin user..."
railway run node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const prisma = new PrismaClient();
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@abcotronics.com' },
      update: { passwordHash: hashedPassword },
      create: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash: hashedPassword,
        role: 'admin',
        provider: 'local'
      }
    });
    console.log('✅ Admin user created:', admin.email);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

createAdmin();
"

# Test the deployment
echo "🧪 Testing deployment..."
sleep 5
curl -X POST "$DEPLOYMENT_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@abcotronics.com","password":"admin123"}' \
  --max-time 10 \
  --silent --show-error || echo "❌ Login test failed"

echo ""
echo "🎉 Railway deployment complete!"
echo ""
echo "📝 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🌐 Production URL: $DEPLOYMENT_URL"
echo ""
echo "📋 Next steps:"
echo "   1. Test login at: $DEPLOYMENT_URL"
echo "   2. View logs: railway logs"
echo "   3. Open dashboard: railway open"
echo ""
echo "⚠️  Note: Currently using SQLite for quick deployment."
echo "   For production scaling, consider upgrading to PostgreSQL."
