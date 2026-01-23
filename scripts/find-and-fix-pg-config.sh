#!/bin/bash
# Find and fix PostgreSQL config

echo "🔍 Finding PostgreSQL configuration..."
echo ""

# Try to find pg_hba.conf
CONFIG_LOCATIONS=(
    "/Library/PostgreSQL/18/data/pg_hba.conf"
    "/Library/PostgreSQL/17/data/pg_hba.conf"
    "/Library/PostgreSQL/16/data/pg_hba.conf"
    "/usr/local/pgsql/data/pg_hba.conf"
    "$HOME/Library/Application Support/Postgres/var-18/pg_hba.conf"
    "$HOME/Library/Application Support/Postgres/var-17/pg_hba.conf"
)

FOUND_CONFIG=""
for loc in "${CONFIG_LOCATIONS[@]}"; do
    if [ -f "$loc" ]; then
        FOUND_CONFIG="$loc"
        echo "✅ Found config at: $loc"
        break
    fi
done

if [ -z "$FOUND_CONFIG" ]; then
    echo "❌ Could not find pg_hba.conf automatically"
    echo ""
    echo "Let's check common locations:"
    echo ""
    
    # Check if PostgreSQL directory exists
    if [ -d "/Library/PostgreSQL/18" ]; then
        echo "PostgreSQL 18 directory exists"
        echo "Checking for data directory..."
        if [ -d "/Library/PostgreSQL/18/data" ]; then
            echo "✅ Found: /Library/PostgreSQL/18/data"
            ls -la /Library/PostgreSQL/18/data/ | grep pg_hba
        fi
    fi
    
    echo ""
    echo "Please run this command to find it:"
    echo "  sudo find /Library -name pg_hba.conf 2>/dev/null"
    echo ""
    echo "Or check:"
    echo "  ls -la /Library/PostgreSQL/18/data/"
    exit 1
fi

echo ""
echo "📝 Current authentication settings:"
sudo grep -E "^local|^host.*127.0.0.1" "$FOUND_CONFIG" | head -5

echo ""
read -p "Do you want to add trust authentication? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

# Backup
sudo cp "$FOUND_CONFIG" "$FOUND_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Backed up config"

# Add trust if not exists
if ! sudo grep -q "^local.*all.*all.*trust" "$FOUND_CONFIG"; then
    echo "Adding trust authentication..."
    
    # Create new file with trust at top
    {
        echo "# Local connections - trust (added $(date))"
        echo "local   all   all   trust"
        echo ""
        sudo cat "$FOUND_CONFIG" | grep -v "^local.*all.*all.*trust"
    } | sudo tee "$FOUND_CONFIG" > /dev/null
    
    echo "✅ Updated config"
else
    echo "✅ Trust already configured"
fi

echo ""
echo "🔄 Restarting PostgreSQL..."
echo "You'll be prompted for your macOS password"

# Find and restart PostgreSQL service
if [ -f "/Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist" ]; then
    sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
    sleep 2
    sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
    echo "✅ PostgreSQL restarted"
elif [ -f "/Library/LaunchDaemons/com.edb.launchd.postgresql.plist" ]; then
    sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql.plist 2>/dev/null
    sleep 2
    sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql.plist 2>/dev/null
    echo "✅ PostgreSQL restarted"
else
    echo "⚠️  Could not find launch daemon"
    echo "Please restart PostgreSQL manually"
fi

sleep 3

echo ""
echo "✅ Done! Now try:"
echo "  createdb abcotronics_erp_local"
echo ""





