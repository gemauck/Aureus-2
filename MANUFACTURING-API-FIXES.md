# Manufacturing API Fixes

## Issues Fixed

### 1. Production Order Update Error (HTTP 500)
**Error**: `Failed to update production order` when updating production orders  
**Root Cause**: The API was trying to update the production order status AFTER running transaction-based stock operations, which caused conflicts and errors.

**Solution Applied**:
- Modified the `PATCH /api/manufacturing/production-orders/:id` endpoint in `api/manufacturing.js`
- Now updates status INSIDE the transaction for all status changes:
  - When completing an order (adding finished goods to inventory)
  - When starting production (deducting stock)
  - When returning stock (cancelling/reverting orders)
- Removed duplicate status updates from `updateData` after transactions
- Added logic to skip empty update operations

**Code Changes**:
```javascript
// Line 1285-1289: Update status to 'completed' in transaction
await tx.productionOrder.update({
  where: { id },
  data: { status: 'completed' }
})

// Line 1631-1635: Update status for stock returns in transaction
await tx.productionOrder.update({
  where: { id },
  data: { status: newStatus }
})

// Line 1647-1653: Remove status from updateData if handled in transaction
const fieldsToUpdate = { ...updateData }
if ((newStatus === 'completed' && oldStatus !== 'completed') ||
    (newStatus === 'in_production' && oldStatus === 'requested') ||
    (newStatus === 'requested' && oldStatus === 'in_production') ||
    newStatus === 'cancelled') {
  delete fieldsToUpdate.status
}
```

### 2. BOM Table Not Found Error (HTTP 500)
**Error**: `BOM table not found. Please run database migrations.`  
**Root Cause**: The production database is missing the BOM table or hasn't had migrations applied.

**Migration Status**:
- Prisma schema defines the `BOM` model correctly
- Migration exists: `prisma/migrations/20251101130734_add_bom_inventory_item/migration.sql`
- Local database likely needs migration applied
- Production database needs migration deployed

**Solution Required**:
Run the following on the production server:
```bash
# On production server
cd /path/to/app
npx prisma migrate deploy
# OR if using db push
npx prisma db push
```

**Migration SQL**:
```sql
-- Create BOM table and add inventoryItemId column
CREATE TABLE "BOM" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'active',
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laborCost" REAL NOT NULL DEFAULT 0,
    "overheadCost" REAL NOT NULL DEFAULT 0,
    "totalMaterialCost" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "estimatedTime" INTEGER NOT NULL DEFAULT 0,
    "components" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "thumbnail" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "BOM_productSku_idx" ON "BOM"("productSku");
CREATE INDEX "BOM_status_idx" ON "BOM"("status");
CREATE INDEX "BOM_ownerId_idx" ON "BOM"("ownerId");
CREATE INDEX "BOM_inventoryItemId_idx" ON "BOM"("inventoryItemId");
```

## Testing

### Test Production Order Updates
1. Navigate to Manufacturing → Production Orders
2. Create a new production order (or edit existing)
3. Try changing status to:
   - `in_production` (should deduct stock)
   - `completed` (should add finished goods)
   - `requested` from `in_production` (should return stock)
   - `cancelled` (should release allocation)
4. Verify no HTTP 500 errors occur
5. Check browser console for any error logs

### Test BOM Operations
1. Navigate to Manufacturing → BOMs
2. Try to list BOMs (should not show "table not found" error)
3. Create a new BOM
4. Link it to an inventory item
5. Add components
6. Verify operations complete successfully

## Files Modified
- `api/manufacturing.js` - Fixed production order update logic

## Migration Files
- `prisma/migrations/20251101130734_add_bom_inventory_item/migration.sql`

## Status
✅ **Fixed**: Production order update error  
⚠️ **Pending**: BOM table migration needs to be applied on production database

## Next Steps
1. Deploy code changes to production
2. Run `npx prisma migrate deploy` on production server
3. Test manufacturing operations
4. Monitor for any remaining errors

