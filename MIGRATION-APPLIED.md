# BOM Inventory Item Migration - Applied

## Summary
Added `inventoryItemId` field to BOM table to link every BOM to its finished product inventory item.

## Changes Made
1. **Database Schema**: Added `inventoryItemId String?` to BOM model (nullable for backward compatibility)
2. **API Updates**: 
   - BOM creation now requires `inventoryItemId`
   - Work order completion adds finished goods to inventory automatically
   - Backward compatible: Existing BOMs without `inventoryItemId` still work (uses SKU fallback)
3. **UI Updates**: BOM creation form requires selecting finished product inventory item first

## Migration Status
✅ **Safe to apply** - Existing BOMs will continue working
✅ **Backward compatible** - No breaking changes
✅ **Production ready** - Server won't break

## To Apply Migration

### Option 1: Use the safe migration script (Recommended)
```bash
./apply-bom-migration-safe.sh
```

### Option 2: Use Prisma migrate
```bash
npx prisma migrate dev --name add_bom_inventory_item
```

### Option 3: Manual SQL (if needed)
```bash
psql $DATABASE_URL < add-bom-inventory-item-migration.sql
```

## What Happens After Migration

1. **Existing BOMs**: Continue working normally (inventoryItemId will be NULL)
2. **New BOMs**: Must have inventoryItemId selected (enforced by UI and API)
3. **Work Orders**: When completed, finished goods are automatically added to inventory with cost = sum of parts

## Testing Checklist

- [x] Existing BOMs can still be viewed/edited
- [x] New BOM creation requires inventory item selection
- [x] Work order completion adds finished goods to inventory
- [x] Cost is calculated correctly (sum of parts)

## Notes

- The migration is **non-breaking** because `inventoryItemId` is nullable
- Old BOMs without `inventoryItemId` will use SKU-based lookup as fallback
- New BOMs must have `inventoryItemId` (enforced by validation)

