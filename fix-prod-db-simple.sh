#!/bin/bash
# Simple script to fix production database - run this on production server

cd /var/www/abcotronics-erp || exit 1

# Use environment variable for password - set DB_PASSWORD before running this script
if [ -z "$DB_PASSWORD" ]; then
    echo "❌ ERROR: DB_PASSWORD environment variable must be set"
    echo "   Example: export DB_PASSWORD='your-password-here'"
    exit 1
fi

CORRECT_DB_URL="postgresql://doadmin:${DB_PASSWORD}@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"

echo "=== Updating .env ==="
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DB_URL}\"|" .env
    echo "✅ Updated .env"
else
    echo "DATABASE_URL=\"${CORRECT_DB_URL}\"" >> .env
    echo "✅ Added to .env"
fi

echo ""
echo "=== Updating .env.local (CRITICAL - this overrides .env!) ==="
if grep -q "^DATABASE_URL=" .env.local 2>/dev/null; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DB_URL}\"|" .env.local
    echo "✅ Updated .env.local"
else
    echo "DATABASE_URL=\"${CORRECT_DB_URL}\"" > .env.local
    echo "✅ Created .env.local"
fi

echo ""
echo "=== Verifying ==="
echo ".env:"
grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
echo ".env.local:"
grep "^DATABASE_URL=" .env.local | sed 's/:[^@]*@/:***@/'

echo ""
echo "=== Restarting PM2 ==="
pm2 restart all --update-env

sleep 5

echo ""
echo "=== Checking logs ==="
pm2 logs --lines 20 --nostream | grep -i "database\|prisma\|nov-3-backup5" | tail -10

