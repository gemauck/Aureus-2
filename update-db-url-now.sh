#!/bin/bash
# Quick script to update DATABASE_URL on production server

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-${DATABASE_URL:-}}"
CLEAN_DB_URL="${TARGET_DATABASE_URL//\"/}"

if [ -z "$CLEAN_DB_URL" ]; then
    echo "❌ TARGET_DATABASE_URL (or DATABASE_URL) is required"
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

echo "🔄 Updating DATABASE_URL on production server ($PARSED)..."

ESCAPED_DB_URL=$(printf "%s" "$CLEAN_DB_URL" | sed "s/'/'\"'\"'/g")

ssh root@${DROPLET_IP} "DATABASE_URL='$ESCAPED_DB_URL' bash -s" <<'ENDSSH'
set -e
cd ${APP_DIR}

echo "✅ Connected to server"

# Backup .env
if [ -f .env ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up .env"
fi

# Update DATABASE_URL
if grep -q "DATABASE_URL=" .env 2>/dev/null; then
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

# Update ecosystem config if exists
for config in ecosystem.config.cjs ecosystem.config.js ecosystem.config.mjs; do
    if [ -f "$config" ]; then
        cp "$config" "$config.backup.$(date +%Y%m%d_%H%M%S)"
        if grep -q "DATABASE_URL" "$config"; then
            sed -i "s|DATABASE_URL:.*|DATABASE_URL: '${DATABASE_URL}',|" "$config"
        else
            # Add to env section
            sed -i "/env:/a\    DATABASE_URL: '${DATABASE_URL}'," "$config"
        fi
        echo "✅ Updated $config"
        break
    fi
done

# Regenerate Prisma client
echo "🔄 Regenerating Prisma client..."
export DATABASE_URL="${DATABASE_URL}"
if command -v npx &> /dev/null && [ -f prisma/schema.prisma ]; then
    npx prisma generate 2>&1 | head -10
    echo "✅ Prisma client regenerated"
fi

# Restart PM2
echo "🔄 Restarting application..."
if pm2 list | grep -q abcotronics-erp; then
    pm2 restart abcotronics-erp
    echo "✅ Application restarted"
else
    echo "⚠️  PM2 process not found, you may need to start it manually"
fi

echo ""
echo "✅ Update complete!"
echo "Check logs: pm2 logs abcotronics-erp"

ENDSSH

echo ""
echo "✅ Database URL updated on production server!"
echo "Test: curl https://abcoafrica.co.za/api/health"

