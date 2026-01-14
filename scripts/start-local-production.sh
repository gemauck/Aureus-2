#!/bin/bash
# Start local production server (mimics droplet environment)
# This runs the app in production mode locally for testing

set -e

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Run 'npm run setup:local-prod' first to set up the environment"
    exit 1
fi

# Check if build exists
if [ ! -d "dist" ] || [ ! -f "dist/styles.css" ]; then
    echo "⚠️  Build not found. Building now..."
    npm run build
fi

# Ensure Prisma client is generated
if [ ! -d "node_modules/.prisma" ]; then
    echo "🏗️  Generating Prisma client..."
    npx prisma generate
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Set production mode
export NODE_ENV=production
export PORT=${PORT:-3000}

echo "🚀 Starting local production server..."
echo "   NODE_ENV: $NODE_ENV"
echo "   PORT: $PORT"
echo "   APP_URL: ${APP_URL:-http://localhost:3000}"
echo ""
echo "📝 Server will be available at: http://localhost:$PORT"
echo "   Press Ctrl+C to stop"
echo ""

# Start the server
node server.js










