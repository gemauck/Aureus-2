#!/bin/bash

# 🚀 Railway Production Deployment Script
echo "🚀 Deploying to Railway with correct configuration..."
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found project directory"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Deploy database migrations
echo "🗄️ Deploying database migrations..."
npx prisma migrate deploy

# Create admin user if it doesn't exist
echo "👤 Ensuring admin user exists..."
node -e "
import('./api/create-admin-user.js').then(m => m.default()).then(() => {
    console.log('✅ Admin user ready');
    process.exit(0);
}).catch(err => {
    console.error('❌ Error creating admin user:', err);
    process.exit(1);
});
"

echo ""
echo "🎯 RAILWAY DEPLOYMENT READY!"
echo "============================="
echo "✅ Dependencies installed"
echo "✅ Prisma client generated"
echo "✅ Database migrations deployed"
echo "✅ Admin user created"
echo ""
echo "🚀 DEPLOYMENT STEPS:"
echo "1. Go to Railway dashboard: https://railway.app/dashboard"
echo "2. Select your project: abco-erp-2-production"
echo "3. Go to Settings → Deploy"
echo "4. Set Start Command to: npm start"
echo "5. Click 'Redeploy' button"
echo "6. Wait for deployment to complete (2-3 minutes)"
echo ""
echo "🧪 TEST AFTER DEPLOYMENT:"
echo "1. Open: https://abco-erp-2-production.up.railway.app/"
echo "2. Login: admin@abcotronics.com / admin123"
echo "3. Create a client with contacts"
echo "4. Refresh the page - data should persist! ✅"
echo ""
echo "📊 EXPECTED RESULTS:"
echo "✅ Frontend authentication working"
echo "✅ Data saves to PostgreSQL database"
echo "✅ Data persists across page refreshes"
echo "✅ No more localStorage fallback"
echo "✅ Real JWT tokens"
echo ""
echo "🔑 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
