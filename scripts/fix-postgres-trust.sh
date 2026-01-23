#!/bin/bash
# Fix PostgreSQL to allow local connections without password (trust method)

echo "🔧 Fixing PostgreSQL authentication for local development..."
echo ""

# Find PostgreSQL data directory
PG_DATA_DIRS=(
    "/Library/PostgreSQL/18/data"
    "/Library/PostgreSQL/17/data"
    "/Library/PostgreSQL/16/data"
    "$HOME/Library/Application Support/Postgres/var-18"
    "$HOME/Library/Application Support/Postgres/var-17"
)

PG_DATA=""
for dir in "${PG_DATA_DIRS[@]}"; do
    if [ -d "$dir" ] && [ -f "$dir/pg_hba.conf" ]; then
        PG_DATA="$dir"
        break
    fi
done

if [ -z "$PG_DATA" ]; then
    echo "❌ Could not find PostgreSQL data directory"
    echo ""
    echo "Please find it manually:"
    echo "  sudo find /Library/PostgreSQL -name pg_hba.conf"
    exit 1
fi

PG_HBA="$PG_DATA/pg_hba.conf"

echo "Found PostgreSQL config: $PG_HBA"
echo ""

# Backup
sudo cp "$PG_HBA" "$PG_HBA.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Backed up original config"

# Check if trust already configured
if sudo grep -q "^local.*all.*all.*trust" "$PG_HBA"; then
    echo "✅ Trust authentication already configured"
else
    echo "Adding trust authentication for local connections..."
    
    # Create temp file with trust at the top
    {
        echo "# Local connections - trust (added by setup script)"
        echo "local   all   all   trust"
        echo ""
        sudo cat "$PG_HBA" | grep -v "^local.*all.*all.*trust"
    } | sudo tee "$PG_HBA" > /dev/null
    
    echo "✅ Updated pg_hba.conf"
fi

# Restart PostgreSQL
echo ""
echo "🔄 Restarting PostgreSQL..."
echo "You may be prompted for your macOS password"

# Try different restart methods
if [ -f "/Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist" ]; then
    sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
    sleep 1
    sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
elif [ -f "/Library/LaunchDaemons/com.edb.launchd.postgresql-17.plist" ]; then
    sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-17.plist 2>/dev/null
    sleep 1
    sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-17.plist 2>/dev/null
else
    echo "⚠️  Could not find PostgreSQL launch daemon"
    echo "Please restart PostgreSQL manually:"
    echo "  sudo launchctl list | grep postgres"
    echo "  Then unload and load the appropriate service"
fi

sleep 3

echo ""
echo "✅ PostgreSQL configured for trust authentication"
echo ""
echo "Now try creating the database:"
echo "  createdb abcotronics_erp_local"
echo ""





