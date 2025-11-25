#!/bin/bash
# Update Application Configuration to Use DigitalOcean Database
# This updates the production server's DATABASE_URL after restore

set -e

# Database connection string (set TARGET_DATABASE_URL or DATABASE_URL)
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-${DATABASE_URL:-}}"
CLEAN_DB_URL="${TARGET_DATABASE_URL//\"/}"

if [ -z "$CLEAN_DB_URL" ]; then
    echo "❌ TARGET_DATABASE_URL (or DATABASE_URL) is required"
    echo "   export TARGET_DATABASE_URL=\"postgresql://doadmin:<DIGITALOCEAN_DB_PASSWORD>@db-host:25060/defaultdb?sslmode=require\""
    exit 1
fi

if [[ "$CLEAN_DB_URL" != postgresql* ]]; then
    echo "❌ TARGET_DATABASE_URL must be a PostgreSQL connection string"
    exit 1
fi

PARSED=$(python3 - <<'PY' "$CLEAN_DB_URL"
import sys
from urllib.parse import urlparse
url = urlparse(sys.argv[1])
user = url.username or 'unknown'
host = url.hostname or 'unknown-host'
port = url.port or 'default'
db = (url.path or '/').lstrip('/') or 'postgres'
masked_password = '***' if url.password else ''
if url.password:
    netloc = f"{user}:{masked_password}@{host}:{port}"
else:
    netloc = f"{user}@{host}:{port}"
print(f"{netloc}/{db}")
PY
)

MASKED_INFO="$PARSED"

# Production server details
DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "Update Application to DigitalOcean Database"
echo "=========================================="
echo ""
echo "📍 Server: $DROPLET_IP"
echo "📊 Database: $MASKED_INFO"
echo ""

# Confirm
read -p "⚠️  This will update the production server configuration. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Update cancelled"
    exit 0
fi

echo ""
echo "🔄 Connecting to production server..."

ESCAPED_DB_URL=$(printf "%s" "$CLEAN_DB_URL" | sed "s/'/'\"'\"'/g")

ssh root@${DROPLET_IP} "DATABASE_URL='$ESCAPED_DB_URL' bash -s" <<'ENDSSH'
set -e

echo "✅ Connected to droplet"

cd ${APP_DIR}

# Backup existing .env
if [ -f .env ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up existing .env file"
fi

# Update DATABASE_URL in .env
echo "📝 Updating .env file..."
if grep -q "DATABASE_URL=" .env 2>/dev/null; then
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
else
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
fi
echo "✅ Updated DATABASE_URL in .env"

# Update PM2 ecosystem config if it exists
if [ -f ecosystem.config.cjs ] || [ -f ecosystem.config.js ] || [ -f ecosystem.config.mjs ]; then
    CONFIG_FILE=""
    if [ -f ecosystem.config.cjs ]; then
        CONFIG_FILE="ecosystem.config.cjs"
    elif [ -f ecosystem.config.js ]; then
        CONFIG_FILE="ecosystem.config.js"
    elif [ -f ecosystem.config.mjs ]; then
        CONFIG_FILE="ecosystem.config.mjs"
    fi
    
    if [ -n "$CONFIG_FILE" ]; then
        echo "📝 Updating $CONFIG_FILE..."
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        
        # Update DATABASE_URL in ecosystem config
        if grep -q "DATABASE_URL" "$CONFIG_FILE"; then
            sed -i "s|DATABASE_URL:.*|DATABASE_URL: '${DATABASE_URL}',|" "$CONFIG_FILE"
        else
            # Add to env section if it exists
            if grep -q "env:" "$CONFIG_FILE"; then
                sed -i "/env:/a\    DATABASE_URL: '${DATABASE_URL}'," "$CONFIG_FILE"
            fi
        fi
        echo "✅ Updated $CONFIG_FILE"
    fi
fi

# Test connection
echo "🧪 Testing database connection..."
export DATABASE_URL="${DATABASE_URL}"
if command -v npx &> /dev/null; then
    npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1 && echo "✅ Database connection test successful" || echo "⚠️  Database connection test failed - please verify manually"
else
    echo "⚠️  npx not found, skipping connection test"
fi

# Regenerate Prisma client if needed
if [ -f prisma/schema.prisma ]; then
    echo "🔄 Regenerating Prisma client..."
    if command -v npx &> /dev/null; then
        npx prisma generate 2>&1 | head -20
        echo "✅ Prisma client regenerated"
    fi
fi

# Restart PM2
echo "🔄 Restarting application..."
if pm2 list | grep -q "abcotronics-erp"; then
    pm2 restart abcotronics-erp
    echo "✅ Application restarted"
else
    echo "⚠️  PM2 process not found, starting manually..."
    if [ -f ecosystem.config.cjs ] || [ -f ecosystem.config.js ] || [ -f ecosystem.config.mjs ]; then
        pm2 start "$CONFIG_FILE" || pm2 start server.js --name abcotronics-erp
    else
        pm2 start server.js --name abcotronics-erp
    fi
    pm2 save
fi

echo ""
echo "✅ Configuration update complete!"
echo ""
echo "Check logs: pm2 logs abcotronics-erp"
echo "Check status: pm2 status"

ENDSSH

echo ""
echo -e "${GREEN}✅ Application configuration updated!${NC}"
echo ""
echo "Next steps:"
echo "1. Check server logs: ssh root@${DROPLET_IP} 'cd ${APP_DIR} && pm2 logs abcotronics-erp'"
echo "2. Test health endpoint: curl https://abcoafrica.co.za/api/health"
echo "3. Verify application: https://abcoafrica.co.za"
echo ""

