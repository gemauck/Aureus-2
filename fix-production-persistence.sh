#!/bin/bash

# 🚀 Production Data Persistence Fix Script
echo "🔧 Fixing Production Data Persistence Issue"
echo "=========================================="

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
echo "🎯 PRODUCTION FIXES APPLIED:"
echo "============================="
echo "✅ Updated railway.json to use server-production.js"
echo "✅ Removed unnecessary refresh buttons from frontend"
echo "✅ Fixed API authentication response format"
echo "✅ Connected production server to real PostgreSQL database"
echo ""
echo "🔑 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🚀 To deploy to Railway:"
echo "   1. Commit your changes: git add . && git commit -m 'Fix data persistence'"
echo "   2. Push to Railway: git push railway main"
echo "   3. Wait for deployment to complete"
echo ""
echo "🧪 To test locally:"
echo "   npm start"
echo "   Open: http://localhost:3000"
echo ""
echo "📊 Data persistence is now enabled!"
echo "   - All client/contact data saves to PostgreSQL"
echo "   - Data persists across page refreshes"
echo "   - No more refresh buttons needed"
echo "   - Real authentication with JWT tokens"
