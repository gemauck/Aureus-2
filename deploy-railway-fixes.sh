#!/bin/bash

echo "🚀 Deploying Railway fixes for ERP system..."

# Set environment variables for Railway
export NODE_ENV=production
export PORT=${PORT:-3000}

# Ensure required environment variables are set
if [ -z "$JWT_SECRET" ]; then
    echo "❌ JWT_SECRET environment variable is required"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is required"
    exit 1
fi

echo "✅ Environment variables validated"

# Build CSS
echo "🎨 Building Tailwind CSS..."
npm run build:css

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
npx prisma generate

# Ensure dist directory exists
mkdir -p dist

# Copy built CSS to dist if it doesn't exist
if [ ! -f "dist/styles.css" ]; then
    echo "⚠️ CSS build not found, creating fallback..."
    echo "/* Fallback CSS */" > dist/styles.css
fi

echo "✅ Railway deployment fixes completed"
echo "🚀 Starting server..."

# Start the server
npm start
