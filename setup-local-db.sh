#!/bin/bash
# Setup local .env file for Digital Ocean database access

echo "🔧 Setting up local database connection..."
echo ""
echo "📋 Please get your database connection string from:"
echo "   https://cloud.digitalocean.com/databases"
echo ""
echo "   1. Click on your database cluster"
echo "   2. Go to 'Users & Databases' tab"
echo "   3. Copy the connection string"
echo ""
read -p "Paste your DATABASE_URL connection string: " DB_URL

if [ -z "$DB_URL" ]; then
    echo "❌ No connection string provided"
    exit 1
fi

# Create .env file
cat > .env << EOF
# Database Connection (Digital Ocean PostgreSQL)
DATABASE_URL=$DB_URL

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Application Settings
NODE_ENV=development
PORT=3000
EOF

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "🚀 Now you can:"
echo "   1. Restart Prisma Studio: npx prisma studio"
echo "   2. View your database at http://localhost:5555"
echo ""

