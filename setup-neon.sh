#!/bin/bash

echo "🚀 ERP System Setup with Neon Database"
echo "======================================"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo ""
    echo "📝 Please create a .env file with your Neon database connection:"
    echo ""
    echo "DATABASE_URL=\"postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require\""
    echo "JWT_SECRET=\"your-super-secret-jwt-key-change-this-in-production\""
    echo "APP_URL=\"http://localhost:3000\""
    echo ""
    echo "🔗 Get your connection string from: https://neon.tech"
    echo ""
    read -p "Press Enter after creating .env file..."
fi

# Check if .env file exists now
if [ ! -f ".env" ]; then
    echo "❌ .env file still not found. Exiting."
    exit 1
fi

echo "✅ .env file found"

# Kill any existing server
echo "🔄 Stopping any existing server..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "No existing server found"

# Deploy database schema
echo "🗄️  Deploying database schema..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo "✅ Database schema deployed successfully"
else
    echo "❌ Database deployment failed. Check your DATABASE_URL in .env"
    exit 1
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

if [ $? -eq 0 ]; then
    echo "✅ Prisma client generated successfully"
else
    echo "❌ Prisma client generation failed"
    exit 1
fi

# Start the server
echo "🚀 Starting server..."
echo "📱 Open http://localhost:3000 in your browser"
echo "🔍 Use debug-persistence.html to test data persistence"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

node server/local.js
