#!/bin/bash

echo "🚀 Setting up Digital Ocean database connection..."
echo ""

# Open Digital Ocean databases page
echo "📖 Opening Digital Ocean databases page..."
open "https://cloud.digitalocean.com/databases" 2>/dev/null || xdg-open "https://cloud.digitalocean.com/databases" 2>/dev/null || echo "Please visit: https://cloud.digitalocean.com/databases"

echo ""
echo "📍 Your database host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com"
echo ""
echo "Follow these steps:"
echo "1. Click on your PostgreSQL database"
echo "2. Go to 'Users & Databases' tab"
echo "3. Copy the 'Connection String' (starts with postgresql://)"
echo ""
read -p "Paste the connection string here: " DB_CONNECTION

if [ -z "$DB_CONNECTION" ]; then
    echo "❌ No connection string provided. Exiting."
    exit 1
fi

# Update .env file
echo ""
echo "📝 Updating .env file..."
cat > .env << EOF
DATABASE_URL="$DB_CONNECTION"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
NODE_ENV=development
PORT=3000
EOF

echo "✅ Configuration saved!"
echo ""
echo "🔍 Testing connection..."
npx prisma db pull > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Connected successfully!"
else
    echo "⚠️  Connection test failed, but continuing..."
fi

echo ""
echo "🎨 Starting Prisma Studio..."
echo "   It will open at: http://localhost:5555"
echo "   Press Ctrl+C to stop"
echo ""

# Kill any existing Prisma Studio
lsof -ti:5555 | xargs kill -9 2>/dev/null || true
lsof -ti:5557 | xargs kill -9 2>/dev/null || true

# Start Prisma Studio
npx prisma studio

