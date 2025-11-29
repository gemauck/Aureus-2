#!/bin/bash

# Update Database Connection Script
# This script updates the DATABASE_URL with the provided credentials

echo "🔧 Updating database connection configuration..."
echo ""

# Database credentials - CORRECT PRODUCTION DATABASE
# Use environment variables for security - set these in your deployment environment
DB_USERNAME="${DB_USERNAME:-doadmin}"
DB_PASSWORD="${DB_PASSWORD:-${DATABASE_PASSWORD}}"
DB_HOST="${DB_HOST:-dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com}"
DB_PORT="${DB_PORT:-25060}"
DB_NAME="${DB_NAME:-defaultdb}"
DB_SSLMODE="${DB_SSLMODE:-require}"

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ ERROR: DB_PASSWORD or DATABASE_PASSWORD environment variable must be set"
    exit 1
fi

# URL encode password (in case it has special characters)
# For this password, no encoding needed, but we'll construct it properly
DB_PASSWORD_ENCODED="$DB_PASSWORD"

# Construct DATABASE_URL
DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD_ENCODED}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

echo "📝 Constructed DATABASE_URL:"
echo "   postgresql://${DB_USERNAME}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
echo ""

# Update .env file
if [ -f ".env" ]; then
    echo "📝 Updating existing .env file..."
    # Check if DATABASE_URL already exists in .env
    if grep -q "^DATABASE_URL=" .env; then
        # Update existing DATABASE_URL
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
        else
            # Linux
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
        fi
        echo "✅ Updated DATABASE_URL in .env"
    else
        # Add DATABASE_URL if it doesn't exist
        echo "" >> .env
        echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
        echo "✅ Added DATABASE_URL to .env"
    fi
else
    echo "📝 Creating new .env file..."
    cat > .env << EOF
# Database Connection (Digital Ocean PostgreSQL)
DATABASE_URL="${DATABASE_URL}"

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Application Settings
NODE_ENV=production
PORT=3000
APP_URL=https://abcoafrica.co.za
EOF
    echo "✅ Created .env file with DATABASE_URL"
fi

# Update ecosystem.config.mjs (for reference, but actual value should come from .env)
echo ""
echo "📝 Updating ecosystem.config.mjs (fallback value)..."
if [ -f "ecosystem.config.mjs" ]; then
    # Update the fallback DATABASE_URL in ecosystem.config.mjs
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:\[PASSWORD_FROM_ENV\]@.*'|DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:***@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}'|" ecosystem.config.mjs
    else
        # Linux
        sed -i "s|DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:\[PASSWORD_FROM_ENV\]@.*'|DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:***@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}'|" ecosystem.config.mjs
    fi
    echo "✅ Updated ecosystem.config.mjs (fallback value - password hidden)"
fi

echo ""
echo "✅ Database connection configuration updated!"
echo ""
echo "⚠️  SECURITY WARNING:"
echo "   - The .env file contains sensitive credentials"
echo "   - Make sure .env is in .gitignore (should not be committed to git)"
echo "   - For production server, update the .env file on the server directly"
echo ""
echo "🚀 Next steps:"
echo "   1. For local development: Restart your server"
echo "   2. For production: SSH into server and update .env file there"
echo "   3. Test connection: npm run test:db (if available) or restart server"
echo ""
echo "📋 To update production server:"
echo "   ssh root@abcoafrica.co.za"
echo "   cd /path/to/your/app"
echo "   # Edit .env file with the DATABASE_URL above"
echo "   pm2 restart all --update-env"
echo ""
