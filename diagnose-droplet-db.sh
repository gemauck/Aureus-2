#!/bin/bash
# Quick diagnostic script for Droplet database connection issue
# Run this on your droplet: ssh root@165.22.127.196

set -e

APP_DIR="/var/www/abcotronics-erp"
APP_NAME="abcotronics-erp"

echo "🔍 Droplet Database Connection Diagnostic"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "$APP_DIR" ]; then
    echo "❌ App directory not found: $APP_DIR"
    exit 1
fi

cd $APP_DIR
echo "📁 Current directory: $(pwd)"
echo ""

# 1. Check PostgreSQL status
echo "1️⃣ Checking PostgreSQL status..."
if systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
    systemctl status postgresql --no-pager -l | head -5
else
    echo "❌ PostgreSQL is NOT running!"
    echo "   Attempting to start..."
    systemctl start postgresql || echo "   Failed to start PostgreSQL"
fi
echo ""

# 2. Check PM2 status
echo "2️⃣ Checking PM2 application status..."
if command -v pm2 &> /dev/null; then
    pm2 list
    echo ""
    echo "📋 Recent PM2 logs (errors only):"
    pm2 logs $APP_NAME --err --lines 20 --nostream || echo "   No errors in recent logs"
else
    echo "⚠️  PM2 not found"
fi
echo ""

# 3. Check DATABASE_URL
echo "3️⃣ Checking DATABASE_URL environment variable..."
if [ -f .env ]; then
    if grep -q "DATABASE_URL" .env; then
        echo "✅ DATABASE_URL found in .env"
        DB_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
        echo "   Format: ${DB_URL:0:50}..."
        
        # Check if it's a PostgreSQL URL
        if [[ $DB_URL == postgresql://* ]] || [[ $DB_URL == postgres://* ]]; then
            echo "✅ Valid PostgreSQL connection string format"
        else
            echo "⚠️  Warning: DATABASE_URL doesn't look like PostgreSQL URL"
            echo "   Expected: postgresql://user:pass@host:port/db"
        fi
    else
        echo "❌ DATABASE_URL NOT found in .env file!"
    fi
else
    echo "❌ .env file not found!"
fi

# Check PM2 environment
if command -v pm2 &> /dev/null; then
    echo ""
    echo "   PM2 environment variables:"
    pm2 env $APP_NAME 2>/dev/null | grep DATABASE_URL || echo "   DATABASE_URL not set in PM2"
fi
echo ""

# 4. Test database connection
echo "4️⃣ Testing database connection..."
if [ -n "$DB_URL" ]; then
    if command -v psql &> /dev/null; then
        echo "   Attempting to connect..."
        if psql "$DB_URL" -c "SELECT 1;" 2>&1 | head -3; then
            echo "✅ Database connection successful!"
        else
            echo "❌ Database connection failed!"
            echo "   Check the error above"
        fi
    else
        echo "⚠️  psql not installed, skipping direct connection test"
    fi
else
    echo "⚠️  DATABASE_URL not set, skipping connection test"
fi
echo ""

# 5. Check application logs
echo "5️⃣ Checking application logs for database errors..."
if [ -f "logs/pm2-error.log" ]; then
    echo "   Recent errors from pm2-error.log:"
    tail -20 logs/pm2-error.log | grep -i "database\|prisma\|connection\|P1001\|P1002\|ECONNREFUSED" || echo "   No database-related errors found"
elif command -v pm2 &> /dev/null; then
    echo "   Recent PM2 errors:"
    pm2 logs $APP_NAME --err --lines 30 --nostream | grep -i "database\|prisma\|connection\|P1001\|P1002\|ECONNREFUSED" || echo "   No database-related errors found"
fi
echo ""

# 6. Check if PostgreSQL is listening
echo "6️⃣ Checking if PostgreSQL is listening..."
if command -v netstat &> /dev/null; then
    netstat -tlnp 2>/dev/null | grep 5432 || echo "   PostgreSQL not listening on port 5432"
elif command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep 5432 || echo "   PostgreSQL not listening on port 5432"
fi
echo ""

# 7. Summary and recommendations
echo "📋 SUMMARY AND RECOMMENDATIONS"
echo "=============================="
echo ""

if ! systemctl is-active --quiet postgresql; then
    echo "❌ ACTION REQUIRED: PostgreSQL is not running"
    echo "   Run: sudo systemctl start postgresql"
    echo ""
fi

if [ ! -f .env ] || ! grep -q "DATABASE_URL" .env; then
    echo "❌ ACTION REQUIRED: DATABASE_URL not configured"
    echo "   Edit .env file and add:"
    echo "   DATABASE_URL=\"postgresql://user:password@localhost:5432/database\""
    echo ""
fi

echo "🔄 To restart the application:"
echo "   pm2 restart $APP_NAME"
echo ""
echo "📋 To view live logs:"
echo "   pm2 logs $APP_NAME"
echo ""
echo "✅ Diagnostic complete!"

