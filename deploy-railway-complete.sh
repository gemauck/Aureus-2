#!/bin/bash

# Complete Railway Deployment Solution
echo "🚀 Complete Railway Deployment Solution"
echo "========================================"

# Step 1: Login to Railway
echo "Step 1: Login to Railway"
echo "Please run: railway login"
echo "Then press Enter to continue..."
read -p "Press Enter after logging in to Railway..."

# Step 2: Deploy the working version
echo ""
echo "Step 2: Deploying working version to Railway..."
railway up --detach

# Step 3: Wait for deployment
echo ""
echo "Step 3: Waiting for deployment to complete..."
sleep 30

# Step 4: Set up database
echo ""
echo "Step 4: Setting up database..."
railway run npx prisma db push

# Step 5: Create admin user
echo ""
echo "Step 5: Creating admin user..."
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

# Step 6: Test the deployment
echo ""
echo "Step 6: Testing deployment..."
DEPLOYMENT_URL=$(railway domain 2>/dev/null || echo "https://abco-erp-2-production.up.railway.app")
echo "Testing login at: $DEPLOYMENT_URL"

curl -X POST "$DEPLOYMENT_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@abcotronics.com","password":"admin123"}' \
  --max-time 10 \
  --silent --show-error

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📝 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🌐 Production URL: $DEPLOYMENT_URL"
echo ""
echo "📋 If login still doesn't work, check:"
echo "   1. Railway logs: railway logs"
echo "   2. Database status: railway run npx prisma db push"
echo "   3. Environment variables: railway variables"
