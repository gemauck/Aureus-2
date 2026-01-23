#!/bin/bash
# Fix PostgreSQL authentication to allow local connections without password

echo "🔧 Fixing PostgreSQL authentication..."
echo ""

# Find PostgreSQL config directory
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - Homebrew PostgreSQL
    PG_VERSION=$(psql --version | grep -oE '[0-9]+' | head -1)
    
    # Try common Homebrew locations
    PGDATA_DIRS=(
        "/opt/homebrew/var/postgresql@${PG_VERSION}"
        "/usr/local/var/postgresql@${PG_VERSION}"
        "/opt/homebrew/var/postgres"
        "/usr/local/var/postgres"
        "$HOME/Library/Application Support/Postgres/var-${PG_VERSION}"
    )
    
    PGDATA=""
    for dir in "${PGDATA_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            PGDATA="$dir"
            break
        fi
    done
    
    if [ -z "$PGDATA" ]; then
        echo "⚠️  Could not find PostgreSQL data directory automatically"
        echo ""
        echo "Please find your PostgreSQL config file (pg_hba.conf) and edit it:"
        echo "  Location might be: ~/Library/Application Support/Postgres/var-*/pg_hba.conf"
        echo "  Or: /opt/homebrew/var/postgresql@*/pg_hba.conf"
        echo ""
        echo "Add this line at the top of the file:"
        echo "  local   all   all   trust"
        echo ""
        echo "Then restart PostgreSQL:"
        echo "  brew services restart postgresql@${PG_VERSION}"
        exit 1
    fi
    
    PG_HBA="$PGDATA/pg_hba.conf"
    
    if [ ! -f "$PG_HBA" ]; then
        echo "❌ Could not find pg_hba.conf at: $PG_HBA"
        exit 1
    fi
    
    echo "Found PostgreSQL config: $PG_HBA"
    echo ""
    
    # Backup original
    cp "$PG_HBA" "$PG_HBA.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ Backed up original config"
    
    # Check if trust already exists
    if grep -q "^local.*all.*all.*trust" "$PG_HBA"; then
        echo "✅ Trust authentication already configured"
    else
        # Add trust method for local connections (at the top, before other rules)
        echo "Adding trust authentication for local connections..."
        
        # Create temp file with new rule at top
        {
            echo "# Local connections - added by setup script"
            echo "local   all   all   trust"
            echo ""
            cat "$PG_HBA"
        } > "$PG_HBA.tmp"
        
        mv "$PG_HBA.tmp" "$PG_HBA"
        echo "✅ Updated pg_hba.conf"
    fi
    
    # Restart PostgreSQL
    echo ""
    echo "🔄 Restarting PostgreSQL..."
    brew services restart postgresql@${PG_VERSION} 2>/dev/null || \
    brew services restart postgresql 2>/dev/null || {
        echo "⚠️  Could not restart via brew services"
        echo "Please restart PostgreSQL manually:"
        echo "  brew services restart postgresql"
    }
    
    sleep 2
    
    echo ""
    echo "✅ PostgreSQL authentication configured!"
    echo ""
    echo "Now try creating the database again:"
    echo "  createdb abcotronics_erp_local"
    
else
    echo "This script is for macOS. For Linux, edit:"
    echo "  /etc/postgresql/*/main/pg_hba.conf"
    echo ""
    echo "Add this line:"
    echo "  local   all   all   trust"
    echo ""
    echo "Then restart: sudo systemctl restart postgresql"
fi





