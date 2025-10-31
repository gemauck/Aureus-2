# Seed Inventory SQL Script

This SQL script will add all ~350 stock items directly to your PostgreSQL database.

## Usage

### Method 1: Using psql command line
```bash
psql -d your_database_name -f seed-inventory.sql
```

### Method 2: Using a database client (DBeaver, pgAdmin, etc.)
1. Open your database client
2. Connect to your database
3. Open the `seed-inventory.sql` file
4. Execute the script

### Method 3: Using Prisma Studio or database URL
```bash
# If you have DATABASE_URL in .env
psql $DATABASE_URL -f seed-inventory.sql
```

## What the Script Does

1. **Finds existing SKUs** - Automatically detects the highest existing SKU number (e.g., SKU0042)
2. **Generates sequential SKUs** - Continues from the next number (e.g., SKU0043, SKU0044, etc.)
3. **Auto-categorizes items**:
   - `components` - Electronic components (resistors, capacitors, ICs, etc.)
   - `accessories` - Hardware, enclosures, batteries, screws, etc.
   - `finished_goods` - Completed products
   - `work_in_progress` - Housing components, PCB cards
4. **Auto-determines types**:
   - `raw_material` - Most items
   - `finished_good` - Completed units
   - `work_in_progress` - Housing/card items
5. **Calculates values**:
   - Unit cost = Total value / Quantity
   - Reorder point = 20% of quantity (min 1)
   - Reorder quantity = 30% of quantity (min 10)
   - Status = `in_stock` (if quantity > reorder point), `low_stock` (if 0 < quantity ≤ reorder point), `out_of_stock` (if quantity = 0)

## Items Added

The script adds approximately **350 stock items** including:
- Electronic components (resistors, capacitors, diodes, transistors, ICs, LEDs, etc.)
- Hardware (screws, nuts, washers, enclosures, boxes)
- Connectors and headers
- Batteries and power supplies
- Completed fuel track units
- Work-in-progress items (housing components, PCB cards)

## Verification

After running the script, verify the import:

```sql
-- Check total count
SELECT COUNT(*) FROM "InventoryItem";

-- Check items by category
SELECT category, COUNT(*) as count 
FROM "InventoryItem" 
GROUP BY category;

-- Check items by status
SELECT status, COUNT(*) as count 
FROM "InventoryItem" 
GROUP BY status;

-- View first 10 items
SELECT sku, name, quantity, "unitCost", "totalValue", category, status 
FROM "InventoryItem" 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

## Notes

- The script uses helper functions to auto-categorize items, which are cleaned up after execution
- If items already exist, the script will continue from the next available SKU number
- Items with 0 quantity will be marked as `out_of_stock`
- The script is idempotent - you can run it multiple times (though it will create duplicates if items with same names exist)

## Troubleshooting

**Error: "function gen_random_uuid() does not exist"**
- Enable the uuid extension: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

**Error: "permission denied"**
- Make sure you're connected as a user with INSERT permissions on the InventoryItem table

**Error: "duplicate key value"**
- Some items may already exist. The script will continue with other items.

