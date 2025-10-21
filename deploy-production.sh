#!/bin/bash

# Production Deployment Script for Abcotronics ERP
echo "🚀 Starting production deployment to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Restore PostgreSQL schema for production
echo "🔄 Restoring PostgreSQL schema for production..."
cp prisma/schema-postgres.prisma prisma/schema.prisma

# Generate Prisma client for PostgreSQL
echo "🔨 Generating Prisma client for PostgreSQL..."
npx prisma generate

# Create production environment file
echo "🔑 Setting up production environment variables..."
cat > .env.production << EOF
# Production Environment Variables
NODE_ENV=production
PORT=3000

# Database will be set by Railway
# DATABASE_URL will be automatically provided by Railway PostgreSQL service

# JWT Secret - Generate a secure random key
JWT_SECRET="$(openssl rand -base64 32)"

# App URL - Will be set to Railway domain
APP_URL="https://abco-erp-2-production.up.railway.app"

# Email Configuration (optional - configure in Railway dashboard)
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""

# Google OAuth (optional - configure in Railway dashboard)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
EOF

echo "✅ Production environment configured"

# Build CSS for production
echo "🎨 Building CSS for production..."
npm run build:css

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "Please log in to Railway:"
    railway login
fi

# Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up --detach

# Wait for deployment to complete
echo "⏳ Waiting for deployment to complete..."
sleep 30

# Get the deployment URL
DEPLOYMENT_URL=$(railway domain)
echo "🌐 Deployment URL: $DEPLOYMENT_URL"

# Run database migrations
echo "📊 Running database migrations..."
railway run npx prisma db push

# Create admin user in production
echo "👤 Creating admin user in production..."
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
    console.log('✅ Admin user created/updated:', admin.email);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

createAdmin();
"

echo ""
echo "🎉 Production deployment complete!"
echo ""
echo "📝 Production login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🌐 Production URL: $DEPLOYMENT_URL"
echo ""
echo "📋 Next steps:"
echo "   1. Test the production deployment"
echo "   2. Update DNS settings if needed"
echo "   3. Configure email settings in Railway dashboard"
echo "   4. Set up monitoring and backups"
echo ""
echo "🔧 To manage your deployment:"
echo "   - View logs: railway logs"
echo "   - Open dashboard: railway open"
echo "   - Scale service: railway scale"