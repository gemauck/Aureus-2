#!/bin/bash
# Check contents of restored database

DB_USER="doadmin"
DB_PASSWORD="YOUR_PASSWORD_HERE"
DB_HOST="dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "🔍 Checking restored database contents..."
echo "📍 Host: ${DB_HOST}"
echo ""

# Connect and check tables
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
SELECT 
    schemaname,
    tablename,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = schemaname AND table_name = tablename) as column_count
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "⚠️  psql not available, trying via Prisma..."
    echo ""
    echo "📊 Table List:"
    echo ""
    # Try using Node.js/Prisma
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: '${DATABASE_URL}'
        }
      }
    });
    
    prisma.\$queryRaw\`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    \`.then(tables => {
      console.log('Tables:', tables);
      if (tables.length === 0) {
        console.log('⚠️  No tables found in database!');
      }
      process.exit(0);
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
    " 2>/dev/null || echo "❌ Could not connect. Please check credentials."
fi

echo ""
echo "📈 Checking record counts in key tables..."
echo ""

# Check record counts
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" <<EOF 2>/dev/null
SELECT 
    'User' as table_name, 
    (SELECT COUNT(*) FROM \"User\" WHERE \"User\".id IS NOT NULL) as record_count
UNION ALL
SELECT 
    'Client', 
    (SELECT COUNT(*) FROM \"Client\" WHERE \"Client\".id IS NOT NULL)
UNION ALL
SELECT 
    'Project', 
    (SELECT COUNT(*) FROM \"Project\" WHERE \"Project\".id IS NOT NULL)
UNION ALL
SELECT 
    'JobCard', 
    (SELECT COUNT(*) FROM \"JobCard\" WHERE \"JobCard\".id IS NOT NULL)
UNION ALL
SELECT 
    'InventoryItem', 
    (SELECT COUNT(*) FROM \"InventoryItem\" WHERE \"InventoryItem\".id IS NOT NULL)
UNION ALL
SELECT 
    'Lead', 
    (SELECT COUNT(*) FROM \"Lead\" WHERE \"Lead\".id IS NOT NULL);
EOF

echo ""
echo "📅 Checking creation dates to verify backup date..."
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
SELECT 
    'User' as table_name,
    MIN(\"createdAt\") as earliest_record,
    MAX(\"createdAt\") as latest_record,
    COUNT(*) as total_records
FROM \"User\"
UNION ALL
SELECT 
    'Client',
    MIN(\"createdAt\"),
    MAX(\"createdAt\"),
    COUNT(*)
FROM \"Client\"
LIMIT 1;
" 2>/dev/null

echo ""
echo "✅ Check complete!"

