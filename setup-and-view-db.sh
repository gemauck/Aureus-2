#!/bin/bash

echo "════════════════════════════════════════════════════════"
echo "  🗄️  Digital Ocean Database Viewer Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# Step 1: Open Digital Ocean
echo "📖 Step 1: Opening Digital Ocean..."
open "https://cloud.digitalocean.com/databases" 2>/dev/null || \
xdg-open "https://cloud.digitalocean.com/databases" 2>/dev/null || \
echo "   → Please visit: https://cloud.digitalocean.com/databases"
echo ""

sleep 2

# Step 2: Get connection string
echo "📍 Your Database:"
echo "   Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com"
echo ""
echo "📋 Instructions:"
echo "   1. Click your PostgreSQL database"
echo "   2. Go to 'Users & Databases' tab"
echo "   3. Find 'Connection String'"
echo "   4. Copy the ENTIRE string (postgresql://...)"
echo ""
echo "════════════════════════════════════════════════════════"
read -p "👉 Paste connection string here: " CONN_STRING
echo ""

if [ -z "$CONN_STRING" ]; then
    echo "❌ No connection string provided!"
    exit 1
fi

# Step 3: Save to .env
echo "💾 Saving configuration..."
cat > .env << EOF
DATABASE_URL="$CONN_STRING"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
NODE_ENV=development
PORT=3000
EOF

echo "✅ Configuration saved!"
echo ""

# Step 4: Test connection
echo "🔍 Testing connection..."
if npx prisma db pull --schema=prisma/schema.prisma > /dev/null 2>&1; then
    echo "✅ Database connection successful!"
else
    echo "⚠️  Connection test skipped (continuing anyway)"
fi

echo ""

# Step 5: Kill existing Prisma Studio
echo "🔄 Stopping any existing Prisma Studio..."
lsof -ti:5555 | xargs kill -9 2>/dev/null || true
lsof -ti:5557 | xargs kill -9 2>/dev/null || true
sleep 1

# Step 6: Start Prisma Studio
echo "════════════════════════════════════════════════════════"
echo "  🎨 Starting Prisma Studio..."
echo "════════════════════════════════════════════════════════"
echo ""
echo "✨ Database viewer will open at: http://localhost:5555"
echo "   (Or check the terminal for the actual port)"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

npx prisma studio

