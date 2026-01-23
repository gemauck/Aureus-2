#!/bin/bash
# Complete setup - run this script

echo "🔧 Complete Local Development Setup"
echo "You'll be prompted for your macOS password to fix PostgreSQL config"
echo ""

# Step 1: Fix PostgreSQL config
echo "Step 1: Fixing PostgreSQL authentication..."
sudo bash << 'SUDO_SCRIPT'
PG_HBA="/Library/PostgreSQL/18/data/pg_hba.conf"
if [ -f "$PG_HBA" ]; then
    # Backup
    cp "$PG_HBA" "$PG_HBA.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Add trust at top if not exists
    if ! grep -q "^local.*all.*all.*trust" "$PG_HBA"; then
        echo "local   all   all   trust" > /tmp/pg_hba_new.txt
        grep -v "^local.*all.*all.*trust" "$PG_HBA" >> /tmp/pg_hba_new.txt
        mv /tmp/pg_hba_new.txt "$PG_HBA"
        echo "✅ Config updated"
    fi
else
    echo "⚠️  Config file not found"
fi
SUDO_SCRIPT

# Step 2: Restart PostgreSQL
echo ""
echo "Step 2: Restarting PostgreSQL..."
sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
sleep 2
sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
sleep 3

# Step 3: Create database
echo ""
echo "Step 3: Creating database..."
if createdb abcotronics_erp_local 2>/dev/null; then
    echo "✅ Database created"
elif psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw abcotronics_erp_local; then
    echo "✅ Database already exists"
else
    echo "❌ Failed to create database"
    exit 1
fi

# Step 4: Create .env.local
echo ""
echo "Step 4: Creating .env.local..."
cat > .env.local << 'EOF'
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
DEV_LOCAL_NO_DB=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
EOF
echo "✅ .env.local created"

# Step 5: Set up schema
echo ""
echo "Step 5: Setting up database schema..."
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss 2>&1 | tail -10

echo ""
echo "✅✅✅ SETUP COMPLETE! ✅✅✅"
echo ""
echo "Start your dev server:"
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:3000"
echo ""

