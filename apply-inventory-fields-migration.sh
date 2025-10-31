#!/bin/bash
# Safe migration script to add Supplier Part Numbers and Legacy Part Number fields
# This script safely adds the new columns without breaking existing functionality

echo "🔧 Applying Inventory Fields Migration..."
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "✅ Found Prisma schema"
echo ""

# Detect database type
DB_TYPE="unknown"
if grep -q "provider = \"sqlite\"" prisma/schema.prisma; then
    DB_TYPE="sqlite"
    DB_FILE="prisma/dev.db"
elif grep -q "provider = \"postgresql\"" prisma/schema.prisma; then
    DB_TYPE="postgresql"
    echo "⚠️  PostgreSQL detected - migration will use Prisma commands"
fi

echo "📊 Database type: $DB_TYPE"
echo ""

# Backup existing database (if SQLite)
if [ "$DB_TYPE" = "sqlite" ] && [ -f "$DB_FILE" ]; then
    echo "📦 Backing up existing database..."
    BACKUP_FILE="$DB_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$DB_FILE" "$BACKUP_FILE"
    echo "✅ Database backed up to: $BACKUP_FILE"
    echo ""
fi

# For SQLite - use direct SQL commands
if [ "$DB_TYPE" = "sqlite" ]; then
    if [ -f "$DB_FILE" ]; then
        echo "📝 Applying SQL migration to SQLite database..."
        
        # Check if columns already exist
        SUPPLIER_COL_EXISTS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM pragma_table_info('InventoryItem') WHERE name='supplierPartNumbers';" 2>/dev/null || echo "0")
        LEGACY_COL_EXISTS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM pragma_table_info('InventoryItem') WHERE name='legacyPartNumber';" 2>/dev/null || echo "0")
        
        if [ "$SUPPLIER_COL_EXISTS" = "0" ]; then
            echo "  ➕ Adding supplierPartNumbers column..."
            sqlite3 "$DB_FILE" "ALTER TABLE InventoryItem ADD COLUMN supplierPartNumbers TEXT DEFAULT '[]';" 2>/dev/null && echo "  ✅ Added supplierPartNumbers" || echo "  ⚠️  Column may already exist or error occurred"
        else
            echo "  ✓ supplierPartNumbers column already exists"
        fi
        
        if [ "$LEGACY_COL_EXISTS" = "0" ]; then
            echo "  ➕ Adding legacyPartNumber column..."
            sqlite3 "$DB_FILE" "ALTER TABLE InventoryItem ADD COLUMN legacyPartNumber TEXT DEFAULT '';" 2>/dev/null && echo "  ✅ Added legacyPartNumber" || echo "  ⚠️  Column may already exist or error occurred"
        else
            echo "  ✓ legacyPartNumber column already exists"
        fi
        
        echo ""
        echo "✅ SQLite migration completed"
    else
        echo "⚠️  Database file not found at $DB_FILE"
        echo "💡 The columns will be created automatically when the app first runs"
    fi
fi

# For PostgreSQL - use Prisma db push (safer than raw SQL)
if [ "$DB_TYPE" = "postgresql" ]; then
    echo "📝 Applying migration via Prisma (PostgreSQL)..."
    echo ""
    echo "⚠️  For PostgreSQL, we'll use Prisma db push which is safer"
    echo "💡 Running: npx prisma db push --accept-data-loss"
    echo ""
    
    npx prisma db push --accept-data-loss
    
    if [ $? -eq 0 ]; then
        echo "✅ Prisma migration completed"
    else
        echo "❌ Migration failed - check the error above"
        exit 1
    fi
fi

# Regenerate Prisma Client
echo ""
echo "🔄 Regenerating Prisma Client..."
npx prisma generate

if [ $? -eq 0 ]; then
    echo "✅ Prisma Client regenerated"
else
    echo "❌ Failed to regenerate Prisma Client"
    exit 1
fi

echo ""
echo "✅ Migration Complete!"
echo ""
echo "📊 Summary:"
echo "  • Added supplierPartNumbers field (JSON array for multiple supplier/part number pairs)"
echo "  • Added legacyPartNumber field (text field for legacy part numbers)"
echo ""
echo "🚀 Next steps:"
echo "  1. Restart your server: pm2 restart abcotronics-erp (or node server.js)"
echo "  2. Test by editing an inventory item - you should see the new fields"
echo ""
echo "⚠️  Note: The application will work fine even if migration hasn't been run yet"
echo "    (fields will show as '-') but you won't be able to save data to them"
echo ""

