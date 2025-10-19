#!/bin/bash

# Production Deployment Script for Railway ERP
echo "🚀 Deploying Production ERP Server with Database Connection"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
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

echo "✅ Production deployment ready!"
echo ""
echo "🔑 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🚀 To start the production server:"
echo "   npm start"
echo ""
echo "🌐 The server will be available at:"
echo "   http://localhost:3000"
echo ""
echo "📊 Database persistence is now enabled!"
echo "   All client/contact data will be saved to PostgreSQL"
echo "   Data will persist across page refreshes"
