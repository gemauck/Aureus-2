#!/bin/bash
# Bypass PostgreSQL password requirement by modifying config

echo "🔓 Bypassing PostgreSQL password requirement..."
echo "This will modify PostgreSQL to allow local connections without password"
echo ""

PG_HBA="/Library/PostgreSQL/18/data/pg_hba.conf"

# Check if file exists
if [ ! -f "$PG_HBA" ]; then
    echo "❌ Config file not found. Trying to locate it..."
    FOUND=$(sudo find /Library/PostgreSQL -name pg_hba.conf 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
        PG_HBA="$FOUND"
        echo "✅ Found: $PG_HBA"
    else
        echo "❌ Could not find pg_hba.conf"
        exit 1
    fi
fi

echo "📝 Config file: $PG_HBA"
echo ""
echo "You'll be prompted for your macOS password (not PostgreSQL password)"
echo ""

# Use sudo to modify the file
sudo bash << 'EOF'
PG_HBA="/Library/PostgreSQL/18/data/pg_hba.conf"

# Backup
if [ -f "$PG_HBA" ]; then
    cp "$PG_HBA" "$PG_HBA.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ Backup created"
    
    # Check if trust already exists
    if grep -q "^local.*all.*all.*trust" "$PG_HBA"; then
        echo "✅ Trust authentication already configured"
    else
        # Add trust at the very top
        {
            echo "# Local connections - trust (added $(date))"
            echo "local   all   all   trust"
            echo ""
            grep -v "^local.*all.*all.*trust" "$PG_HBA"
        } > /tmp/pg_hba_new.txt
        
        mv /tmp/pg_hba_new.txt "$PG_HBA"
        echo "✅ Config updated - added trust authentication"
    fi
else
    echo "❌ Config file not found"
    exit 1
fi
EOF

if [ $? -ne 0 ]; then
    echo "❌ Failed to modify config"
    exit 1
fi

# Restart PostgreSQL
echo ""
echo "🔄 Restarting PostgreSQL..."
sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
sleep 2
sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
sleep 3

echo "✅ PostgreSQL restarted"
echo ""
echo "Now try creating the database:"
echo "  createdb abcotronics_erp_local"
echo ""





