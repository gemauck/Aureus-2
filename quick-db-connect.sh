#!/bin/bash

echo "🔗 Connecting to Digital Ocean Database..."
echo ""
echo "Getting connection string from Digital Ocean..."
echo ""

# Database connection details (from your files)
DB_HOST="dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com"
DB_PORT="25060"
DB_USER="doadmin"
DB_NAME="defaultdb"

echo "📍 Database Host: $DB_HOST"
echo ""
echo "To get your password:"
echo "1. Go to: https://cloud.digitalocean.com/databases"
echo "2. Click your database cluster"
echo "3. Go to 'Users & Databases' tab"
echo "4. You'll see the connection string there"
echo ""
read -p "Paste the FULL connection string (postgresql://...): " CONNECTION_STRING

if [ -z "$CONNECTION_STRING" ]; then
    echo "❌ No connection string provided"
    exit 1
fi

# Update .env file
echo ""
echo "📝 Updating .env file..."
cat > .env << EOF
# Database Connection (Digital Ocean PostgreSQL)
DATABASE_URL="$CONNECTION_STRING"

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Application Settings
NODE_ENV=development
PORT=3000
EOF

echo "✅ .env file updated!"
echo ""
echo "🚀 Starting Prisma Studio..."
echo "   It will open at: http://localhost:5555"
echo ""

# Start Prisma Studio
npx prisma studio

