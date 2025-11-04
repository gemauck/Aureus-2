#!/bin/bash
# Quick connection test for restored database
# Run this to verify the restored database connection

DB_USER="doadmin"
DB_PASSWORD="${DB_PASSWORD:-YOUR_PASSWORD_HERE}"
DB_HOST="dbaas-db-6934625-nov-3-backup-nov-3-backup2-do-user-28031752-0.e.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "🔍 Testing connection to restored database..."
echo "📍 Host: ${DB_HOST}"
echo ""

# Test connection with Prisma
if command -v npx &> /dev/null; then
    echo "🧪 Testing with Prisma..."
    export DATABASE_URL="$DATABASE_URL"
    
    # Generate Prisma client if needed
    npx prisma generate > /dev/null 2>&1
    
    # Test query
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    Promise.all([
        prisma.\$queryRaw\`SELECT COUNT(*) as count FROM \"User\"\`,
        prisma.\$queryRaw\`SELECT COUNT(*) as count FROM \"Client\"\`,
        prisma.\$queryRaw\`SELECT COUNT(*) as count FROM \"Project\"\`
    ])
    .then(([users, clients, projects]) => {
        console.log('✅ Connection successful!');
        console.log('');
        console.log('📊 Database Contents:');
        console.log('   Users:', users[0].count);
        console.log('   Clients:', clients[0].count);
        console.log('   Projects:', projects[0].count);
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    });
    " 2>&1
else
    echo "⚠️  npx not found. Trying direct psql connection..."
    
    if command -v psql &> /dev/null; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) as users FROM \"User\";" 2>&1
    else
        echo "❌ Neither npx nor psql found. Cannot test connection."
        exit 1
    fi
fi

echo ""
echo "✅ Connection test complete!"
echo ""
echo "📋 Connection String:"
echo "   ${DATABASE_URL}"

