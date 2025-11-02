# Multi-Location Inventory Implementation

## Overview
This implementation adds support for separate inventory per stock location. Each location has its own complete inventory, and new locations automatically get their own inventory set.

## Changes Made

### 1. Database Schema
- **Added `locationId` field** to `InventoryItem` model in Prisma schema
- **Added relation** between `InventoryItem` and `StockLocation`
- **Added index** on `locationId` for performance

### 2. API Changes (`api/manufacturing.js`)
- **Inventory listing** now filters by `locationId` when query parameter is provided
- **Inventory creation** automatically assigns to main warehouse (LOC001) if no locationId specified
- **Stock location creation** automatically creates inventory items for the new location based on main warehouse inventory

### 3. Frontend Changes (`src/components/manufacturing/Manufacturing.jsx`)
- **Location selector dropdown** added to Inventory Tab
- **Inventory filtering** by selected location
- **Automatic inventory reload** when location changes
- **Location-aware item creation** - new items are assigned to the selected location

### 4. Database API (`src/utils/databaseAPI.js`)
- **Added `getStockLocations()`** method
- **Updated `getInventory()`** to accept optional `locationId` parameter

## Migration Steps

### 1. Run Database Migration
Execute the SQL migration file:
```bash
psql -d your_database -f add-location-inventory-migration.sql
```

Or using Prisma:
```bash
npx prisma db push
npx prisma generate
```

### 2. Run JavaScript Migration (Optional)
To assign existing inventory to main warehouse:
```bash
node assign-inventory-to-main-warehouse.js
```

### 3. Verify Main Warehouse Exists
Ensure LOC001 (Main Warehouse) exists. The migration SQL will create it if it doesn't exist.

## How It Works

### Main Warehouse (LOC001)
- All existing inventory is assigned to Main Warehouse
- New inventory items default to Main Warehouse if no location is selected
- Main Warehouse serves as the primary inventory location

### Creating New Stock Locations
1. Go to Manufacturing → Stock Locations tab
2. Click "Add Location"
3. Fill in location details
4. System automatically:
   - Creates the location
   - Duplicates all inventory items from Main Warehouse
   - Sets initial quantities to 0
   - Sets status to "out_of_stock"

### Viewing Location-Specific Inventory
1. Go to Manufacturing → Inventory tab
2. Use the location selector dropdown at the top
3. Select a location to view only that location's inventory
4. Select "All Locations" to see everything

### Adding Items to Specific Location
1. Select the desired location from the dropdown
2. Click "Add Item"
3. The new item will be assigned to the selected location

## Features

✅ Each location has separate inventory  
✅ Existing inventory assigned to Main Warehouse  
✅ New locations get complete inventory structure  
✅ Location selector in Inventory Tab  
✅ Location-based filtering  
✅ Automatic inventory creation for new locations  

## Notes

- The `locationId` field is nullable to support backward compatibility
- Items without a locationId are treated as Main Warehouse items
- Inventory transfers between locations should use stock movements
- The system maintains both `location` (string field) and `locationId` (relation) for compatibility

## Future Enhancements

- Stock transfer functionality between locations
- Location-specific reporting
- Bulk inventory operations per location
- Location-based reorder points

