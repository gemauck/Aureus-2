# Inventory Duplicates Fix

## Problem
Inventory items are appearing duplicated in the inventory list, with each item showing twice - one with 0 quantity ("Out Of_stock") and another with actual quantities ("In Stock" or "Low Stock").

## Root Cause
The `InventoryItem` model in the database doesn't have a unique constraint on `[locationId, sku]`, which means duplicate items can exist with:
- Same SKU, different `locationId` values (or null)
- Same SKU, same `locationId` (due to bugs in data creation)

The duplicates likely occurred when:
1. Items were created without a `locationId` (null)
2. Later, the same items were created again with a proper `locationId`
3. When viewing "All Locations", both sets are shown

## Solution

### 1. Immediate Fix (API-level deduplication)
The inventory API endpoint (`/api/manufacturing/inventory`) now automatically deduplicates items before returning them:
- Groups items by SKU + locationId
- Keeps the best item (prefers non-zero quantity, valid locationId, most recent)
- Returns only unique items to the frontend

**File modified:** `api/manufacturing.js`

### 2. Database Cleanup Script
A script is available to permanently fix duplicates in the database:

```bash
node fix-duplicate-inventory.js
```

This script will:
- Find all duplicate inventory items (same SKU + locationId)
- Merge quantities and values from duplicates into one item
- Delete the duplicate records
- Verify no duplicates remain

## How to Use

### Step 1: Test for Duplicates
First, check if duplicates exist in the database:
```bash
node test-inventory-duplicates.js
```

This will show you:
- How many items are in the database
- Which SKUs have duplicates
- Details about each duplicate

### Step 2: Apply the Fix

#### Option A: API-level fix (immediate, temporary)
The API fix is in place and will automatically deduplicate items when fetching. However, you need to:
1. **Restart your server** for the changes to take effect:
   ```bash
   # If using PM2:
   pm2 restart server
   
   # If running directly:
   # Stop the server (Ctrl+C) and restart it
   ```
2. **Clear browser cache** or do a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. **Refresh the inventory page**

The API will now merge duplicates on-the-fly before sending data to the frontend.

#### Option B: Database cleanup (permanent fix)
Run the cleanup script to permanently remove duplicates from the database:
```bash
node fix-duplicate-inventory.js
```

The script will:
1. Show all duplicate groups found
2. Ask for confirmation (if interactive)
3. Merge duplicates (keeping the best one)
4. Delete duplicate records
5. Verify the fix

## Future Prevention

To prevent this issue from happening again, consider:

1. **Add unique constraint** to the database schema:
   ```sql
   ALTER TABLE "InventoryItem" 
   ADD CONSTRAINT "InventoryItem_sku_locationId_unique" 
   UNIQUE ("sku", "locationId");
   ```

2. **Update Prisma schema** to include the constraint:
   ```prisma
   model InventoryItem {
     // ... existing fields ...
     @@unique([sku, locationId])
   }
   ```

3. **Add validation** in the API when creating inventory items to check for existing items before creating new ones.

## Testing

After applying the fix:
1. Open the Inventory tab in Manufacturing
2. Verify that each SKU appears only once
3. Check that quantities are correct (not doubled)
4. Verify that items with 0 quantity are properly merged with items that have quantities

