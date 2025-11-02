# Quick Setup: Multi-Location Inventory

## Automated Setup (Recommended)

Run the setup script:
```bash
./setup-multi-location-inventory.sh
```

## Manual Setup Steps

### Option 1: Using Prisma Migrate (Recommended)
```bash
# 1. Create and apply migration
npx prisma migrate dev --name add_location_inventory

# 2. Generate Prisma client
npx prisma generate

# 3. Assign existing inventory to Main Warehouse
node assign-inventory-to-main-warehouse.js
```

### Option 2: Using Prisma DB Push
```bash
# 1. Push schema changes
npx prisma db push --accept-data-loss

# 2. Generate Prisma client
npx prisma generate

# 3. Run SQL migration (optional, for Main Warehouse setup)
psql your_database -f add-location-inventory-migration.sql

# 4. Assign existing inventory
node assign-inventory-to-main-warehouse.js
```

### Option 3: Direct SQL (If Prisma is not available)
```bash
# Run the SQL migration directly
psql your_database -f add-location-inventory-migration.sql

# Then assign inventory
node assign-inventory-to-main-warehouse.js
```

## Verification

After setup, verify the changes:

1. **Check database schema:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'InventoryItem' AND column_name = 'locationId';
   ```

2. **Check Main Warehouse:**
   ```sql
   SELECT code, name, COUNT(i.id) as item_count 
   FROM "StockLocation" s
   LEFT JOIN "InventoryItem" i ON i."locationId" = s.id
   WHERE s.code = 'LOC001'
   GROUP BY s.code, s.name;
   ```

3. **Check inventory assignments:**
   ```sql
   SELECT 
     COUNT(*) as total_items,
     COUNT("locationId") as assigned_items,
     COUNT(*) - COUNT("locationId") as unassigned_items
   FROM "InventoryItem";
   ```

## Testing

1. Restart your server
2. Go to **Manufacturing → Inventory Tab**
3. You should see a **location selector dropdown** at the top
4. Select different locations to filter inventory
5. Create a new stock location - it should automatically get inventory items

## Troubleshooting

### If Prisma migration fails:
- Make sure DATABASE_URL is set in `.env`
- Check database connection
- Run SQL migration manually

### If location selector doesn't appear:
- Clear browser cache
- Check browser console for errors
- Verify `getStockLocations()` is working in Network tab

### If existing inventory isn't showing:
- Run `node assign-inventory-to-main-warehouse.js`
- Check if Main Warehouse (LOC001) exists
- Verify inventory items have locationId set

## Support

For detailed documentation, see: `MULTI-LOCATION-INVENTORY-IMPLEMENTATION.md`

