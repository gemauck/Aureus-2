#!/bin/bash
# Master script to update ALL database references to the correct server
# This ensures consistency across all configuration files

echo "🔧 Updating All Database References"
echo "====================================="
echo ""

# CORRECT DATABASE CREDENTIALS - PRODUCTION SERVER
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

# Construct DATABASE_URL
CORRECT_DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

echo "✅ Correct DATABASE_URL:"
echo "   postgresql://${DB_USERNAME}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
echo ""

# Update ecosystem.config.mjs
if [ -f "ecosystem.config.mjs" ]; then
    echo "📝 Updating ecosystem.config.mjs..."
    # Update the fallback DATABASE_URL - use a simpler pattern
    ESCAPED_HOST=$(echo "$DB_HOST" | sed 's/[[\.*^$()+?{|]/\\&/g')
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|@.*\.ondigitalocean\.com|@${ESCAPED_HOST}|g" ecosystem.config.mjs
    else
        sed -i "s|@.*\.ondigitalocean\.com|@${ESCAPED_HOST}|g" ecosystem.config.mjs
    fi
    echo "✅ Updated ecosystem.config.mjs"
fi

# Update .env file (if exists locally)
if [ -f ".env" ]; then
    echo "📝 Updating .env file..."
    if grep -q "^DATABASE_URL=" .env; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DATABASE_URL}\"|" .env
        else
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DATABASE_URL}\"|" .env
        fi
        echo "✅ Updated DATABASE_URL in .env"
    else
        echo "" >> .env
        echo "DATABASE_URL=\"${CORRECT_DATABASE_URL}\"" >> .env
        echo "✅ Added DATABASE_URL to .env"
    fi
else
    echo "ℹ️  No .env file found locally (this is normal - .env should be on server)"
fi

echo ""
echo "✅ All local database references updated!"
echo ""
echo "📋 Summary:"
echo "   - Database Host: ${DB_HOST}"
echo "   - Port: ${DB_PORT}"
echo "   - Database: ${DB_NAME}"
echo "   - SSL Mode: ${DB_SSLMODE}"
echo ""
echo "🚀 Next Steps:"
echo "   1. For PRODUCTION: Run fix-database-hostname.sh on the server"
echo "   2. For LOCAL: Restart your development server"
echo ""

