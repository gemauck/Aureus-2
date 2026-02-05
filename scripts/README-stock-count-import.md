# Stock Count Excel Import

Imports **ABCOTRONICS STOCK COUNT - 2026.xlsx** (or similar stock take Excel) into Manufacturing inventory.

## What it does

- **Reads** the first sheet (or one named with "stock" / "take" / "inventory" / "count")
- **Creates missing locations**: e.g. "PMB" or "LOC001" → ensures a `StockLocation` exists (creates if not)
- **Creates missing suppliers**: e.g. "RS", "MANTECH" → ensures a `Supplier` record exists
- **Imports each row** as an inventory item with:
  - Box Number, Part Name, Category, Type, Quantity, Unit, Unit Cost, Total Value
  - Reorder Point / Qty (or defaults from quantity)
  - Location (resolved to DB location)
  - Supplier name
  - Supplier Part Number (stored as `supplierPartNumbers` JSON)
- **Creates** `LocationInventory` and `StockMovement` for audit

## Usage

1. **Dry run** (no DB changes, just report what would be done):

   ```bash
   node scripts/import-stock-count-excel.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx" --dry-run
   ```

2. **Run import** (requires `DATABASE_URL` in `.env` or environment):

   ```bash
   node scripts/import-stock-count-excel.js "/path/to/ABCOTRONICS STOCK COUNT - 2026.xlsx"
   ```

   Or:

   ```bash
   npm run import:stock-count -- "/Users/you/Downloads/ABCOTRONICS STOCK COUNT - 2026.xlsx"
   ```

## Excel columns (mapped)

| Sheet column | Maps to |
|-------------|--------|
| BOX NUMBER (NO LONGER SKU) | boxNumber |
| PART NAME (NO LONGER NAME) | name |
| Category | category |
| Type | type |
| Quantity, Unit, Unit Cost, Total Value | quantity, unit, unitCost, totalValue |
| Reorder Point, Reorder Qty | reorderPoint, reorderQty |
| Location | location (text); used to resolve/create StockLocation |
| Location Code | locationCode (e.g. LOC001) to resolve location |
| Supplier | supplier |
| SUPPLIER Part Number | supplierPartNumbers (with supplier name) |

Rows with an empty Part Name are skipped.
