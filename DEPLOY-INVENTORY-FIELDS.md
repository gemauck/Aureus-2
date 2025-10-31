# Inventory Fields Deployment Guide

## ✅ Code Changes Completed

All code changes have been implemented and are ready for deployment:

1. **Database Schema** (`prisma/schema.prisma`)
   - ✅ Added `supplierPartNumbers` field (JSON array)
   - ✅ Added `legacyPartNumber` field (text)

2. **Frontend** (`src/components/manufacturing/Manufacturing.jsx`)
   - ✅ Added "Supplier Part No." column to inventory table
   - ✅ Added "Legacy Part Number" column to inventory table
   - ✅ Updated add/edit modal with fields for new data
   - ✅ Removed display of 0 values (shows "-" instead)

3. **Backend API** (`api/manufacturing.js`)
   - ✅ All create/update operations handle new fields
   - ✅ Backwards compatible - won't crash if columns don't exist yet
   - ✅ Safe error handling for missing columns

4. **Migration Scripts**
   - ✅ `add-inventory-fields-migration.sql` - SQL migration
   - ✅ `apply-inventory-fields-migration.sh` - Automated migration script

## 🚀 Deployment Steps

### Step 1: Commit and Push Code Changes

```bash
git add prisma/schema.prisma api/manufacturing.js src/components/manufacturing/Manufacturing.jsx
git add add-inventory-fields-migration.sql apply-inventory-fields-migration.sh
git commit -m "Add Supplier Part Numbers and Legacy Part Number fields to inventory items"
git push origin main
```

### Step 2: Apply Database Migration on Server

SSH into your production server and run:

```bash
# SSH to server
ssh root@165.22.127.196  # or your server address

# Navigate to project
cd /var/www/abcotronics-erp  # or your project path

# Pull latest code
git pull origin main

# Run migration script
./apply-inventory-fields-migration.sh
```

### Alternative: Manual Migration

If the script doesn't work, apply manually:

**For PostgreSQL:**
```bash
npx prisma db push --accept-data-loss
npx prisma generate
pm2 restart abcotronics-erp
```

**For SQLite (if applicable):**
```bash
sqlite3 prisma/dev.db "ALTER TABLE InventoryItem ADD COLUMN supplierPartNumbers TEXT DEFAULT '[]';"
sqlite3 prisma/dev.db "ALTER TABLE InventoryItem ADD COLUMN legacyPartNumber TEXT DEFAULT '';"
npx prisma generate
pm2 restart abcotronics-erp
```

### Step 3: Verify Deployment

1. Visit the Manufacturing/Inventory page
2. Check that new columns appear in the table:
   - "Supplier Part No." (after Item Name)
   - "Legacy Part Number" (after Supplier Part No.)
3. Edit an inventory item and verify:
   - Can add multiple supplier part numbers
   - Can add legacy part number
   - Changes save successfully

## 🔒 Safety Features

- ✅ **Backwards Compatible**: App works even if migration hasn't run yet
- ✅ **No Downtime**: Migration is non-destructive (only adds columns)
- ✅ **Safe Errors**: API handles missing columns gracefully
- ✅ **Database Backup**: Migration script creates backup automatically

## 📊 What Was Changed

### New Database Fields

- `supplierPartNumbers` (TEXT, default: '[]')
  - JSON array format: `[{"supplier": "Supplier Name", "partNumber": "PART123"}, ...]`
  - Supports multiple supplier/part number pairs per item

- `legacyPartNumber` (TEXT, default: '')
  - Single text field for legacy part numbers

### UI Changes

- **Table**: New columns appear after "Item Name"
- **Modal**: New form fields in add/edit inventory item modal
- **Display**: Empty/zero values show as "-" instead of "0"

## 🐛 Troubleshooting

### Migration fails with "column already exists"
- This is safe - columns already exist, nothing to do

### New columns don't appear
- Run `npx prisma generate` to regenerate Prisma client
- Restart server: `pm2 restart abcotronics-erp`

### Can't save new fields
- Verify migration ran successfully
- Check server logs for errors
- Ensure Prisma client is regenerated

## ✅ Verification Checklist

- [ ] Code committed and pushed
- [ ] Migration script runs successfully on server
- [ ] Prisma client regenerated
- [ ] Server restarted
- [ ] New columns visible in inventory table
- [ ] Can add/edit supplier part numbers
- [ ] Can add/edit legacy part number
- [ ] Changes persist after save

