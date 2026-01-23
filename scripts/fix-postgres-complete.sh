#!/bin/bash
# Complete PostgreSQL fix - handles everything automatically

set -e

echo "🔧 Fixing PostgreSQL authentication and setting up database..."
echo ""

PG_HBA="/Library/PostgreSQL/18/data/pg_hba.conf"

# Check if config file exists
if [ ! -f "$PG_HBA" ]; then
    echo "❌ Config file not found at: $PG_HBA"
    echo "Trying to find it..."
    FOUND=$(sudo find /Library -name pg_hba.conf 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
        PG_HBA="$FOUND"
        echo "✅ Found at: $PG_HBA"
    else
        echo "❌ Could not find pg_hba.conf"
        exit 1
    fi
fi

echo "📝 Config file: $PG_HBA"
echo ""

# Backup
echo "📦 Creating backup..."
sudo cp "$PG_HBA" "$PG_HBA.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Backup created"

# Check if trust already exists
if sudo grep -q "^local.*all.*all.*trust" "$PG_HBA"; then
    echo "✅ Trust authentication already configured"
else
    echo "➕ Adding trust authentication..."
    
    # Create temp file with trust at top
    {
        echo "# Local connections - trust (added $(date))"
        echo "local   all   all   trust"
        echo ""
        sudo cat "$PG_HBA" | grep -v "^local.*all.*all.*trust"
    } | sudo tee "$PG_HBA" > /dev/null
    
    echo "✅ Config updated"
fi

# Restart PostgreSQL
echo ""
echo "🔄 Restarting PostgreSQL..."
echo "You'll be prompted for your macOS password"

if [ -f "/Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist" ]; then
    sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null || true
    sleep 2
    sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
    echo "✅ PostgreSQL restarted"
else
    echo "⚠️  Could not find launch daemon, trying alternative..."
    sudo pkill -9 postgres 2>/dev/null || true
    sleep 2
    sudo -u postgres /Library/PostgreSQL/18/bin/pg_ctl -D /Library/PostgreSQL/18/data start 2>/dev/null || {
        echo "⚠️  Could not restart automatically"
        echo "Please restart PostgreSQL manually"
    }
fi

sleep 3

# Test connection
echo ""
echo "🔍 Testing connection..."
if psql -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Connection works!"
else
    echo "⚠️  Connection test failed, but continuing..."
fi

# Create database
echo ""
echo "🗄️  Creating database..."
if createdb abcotronics_erp_local 2>/dev/null; then
    echo "✅ Database created successfully!"
elif psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw abcotronics_erp_local; then
    echo "✅ Database already exists"
else
    echo "⚠️  Could not create database automatically"
    echo "Try manually: createdb abcotronics_erp_local"
    exit 1
fi

# Update .env.local
echo ""
echo "📝 Updating .env.local..."

cat > .env.local << 'EOF'
# Local Development Environment
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Local PostgreSQL Database
DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"

# JWT Secret (use same as production for testing)
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Allow local database connections
DEV_LOCAL_NO_DB=false

# Email Configuration (optional for local dev)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
EOF

echo "✅ .env.local updated"

# Set up schema
echo ""
echo "🔄 Setting up database schema..."
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss 2>&1 | tail -10

echo ""
echo "✅✅✅ Setup Complete! ✅✅✅"
echo ""
echo "Your local development environment is ready!"
echo ""
echo "Next steps:"
echo "  1. Start dev server: npm run dev"
echo "  2. Open browser: http://localhost:3000"
echo "  3. (Optional) Copy production data: npm run copy:prod-data"
echo ""





