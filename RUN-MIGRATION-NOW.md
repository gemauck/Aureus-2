# 🚀 Run Migration Now - Quick Guide

The database migration couldn't run automatically because of DATABASE_URL format. Here are the easiest ways to complete it:

## Option 1: Via API Endpoint (Easiest if server is running)

1. **Make sure your server is running**
   ```bash
   npm start
   # or your usual start command
   ```

2. **Log in to the application as admin**

3. **Open browser console** (F12) and run:
   ```javascript
   const token = window.storage?.getToken();
   fetch('/api/run-location-migration', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${token}`
     }
   }).then(r => r.json()).then(console.log).catch(console.error);
   ```

4. **Check the console** - you should see migration results

## Option 2: Using SQL Directly

If you have direct database access:

```bash
# Connect to your database and run:
psql your_database_name -f add-location-inventory-migration.sql

# Then assign inventory:
node assign-inventory-to-main-warehouse.js
```

## Option 3: Fix DATABASE_URL and Run Prisma

1. **Check your .env file** - make sure DATABASE_URL starts with `postgresql://` or `postgres://`

2. **Run migration:**
   ```bash
   npx prisma migrate dev --name add_location_inventory
   ```

## Option 4: Manual SQL (If you have DB access)

Run these SQL commands in your database:

```sql
-- Add column
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" ON "InventoryItem"("locationId");

-- Ensure Main Warehouse exists
INSERT INTO "StockLocation" (id, code, name, type, status, address, "contactPerson", "contactPhone", meta, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  'LOC001',
  'Main Warehouse',
  'warehouse',
  'active',
  '',
  '',
  '',
  '{}',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "StockLocation" WHERE code = 'LOC001');

-- Assign existing inventory
UPDATE "InventoryItem"
SET "locationId" = (SELECT id FROM "StockLocation" WHERE code = 'LOC001' LIMIT 1)
WHERE "locationId" IS NULL OR "locationId" = '';
```

## Verification

After migration, verify in your database:

```sql
-- Check column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'InventoryItem' AND column_name = 'locationId';

-- Check Main Warehouse
SELECT code, name FROM "StockLocation" WHERE code = 'LOC001';

-- Count assigned inventory
SELECT COUNT(*) FROM "InventoryItem" WHERE "locationId" IS NOT NULL;
```

Then restart your server and test the feature!

