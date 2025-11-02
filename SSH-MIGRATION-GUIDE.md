# 🔧 SSH Migration Guide

I've created 3 methods to run the migration via SSH. Choose the one that works best for your setup.

## Method 1: Direct SQL via SSH (Easiest) ⭐

**Use this if you have SSH and database access:**

```bash
./migrate-via-ssh-direct.sh user@your-server.com database_name
```

**Example:**
```bash
./migrate-via-ssh-direct.sh root@example.com abcotronics_db
# or if you know your DB name
./migrate-via-ssh-direct.sh user@192.168.1.100 postgres
```

**What it does:**
- Connects via SSH
- Runs SQL directly on the database
- No Node.js required

---

## Method 2: SQL File Upload

**Use this if Method 1 doesn't work:**

```bash
./migrate-via-ssh.sh user@your-server.com database_name
```

**Example:**
```bash
./migrate-via-ssh.sh user@example.com my_database
```

**What it does:**
- Uploads SQL file to server
- Runs it via psql
- Cleans up afterwards

---

## Method 3: Node.js on Server (If app is on server)

**Use this if your app is deployed on the server:**

```bash
./migrate-via-ssh-node.sh user@your-server.com /path/to/your/app
```

**Example:**
```bash
./migrate-via-ssh-node.sh user@example.com /var/www/erp
# or
./migrate-via-ssh-node.sh user@example.com ~/abcotronics-erp-modular
```

**What it does:**
- Uses your app's existing Prisma connection
- Runs migration script on server
- Uses server's DATABASE_URL format

---

## Manual SQL (If scripts don't work)

If none of the scripts work, you can run SQL directly:

```bash
ssh user@your-server.com
psql -d your_database_name
```

Then paste this SQL:

```sql
-- Add column
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" ON "InventoryItem"("locationId");

-- Ensure Main Warehouse
INSERT INTO "StockLocation" (id, code, name, type, status, address, "contactPerson", "contactPhone", meta, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'LOC001', 'Main Warehouse', 'warehouse', 'active', '', '', '', '{}', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "StockLocation" WHERE code = 'LOC001');

-- Assign inventory
UPDATE "InventoryItem"
SET "locationId" = (SELECT id FROM "StockLocation" WHERE code = 'LOC001' LIMIT 1)
WHERE ("locationId" IS NULL OR "locationId" = '');

-- Verify
SELECT 
    (SELECT COUNT(*) FROM "StockLocation" WHERE code = 'LOC001') as warehouse_exists,
    (SELECT COUNT(*) FROM "InventoryItem" WHERE "locationId" IS NOT NULL) as assigned_items,
    (SELECT COUNT(*) FROM "InventoryItem") as total_items;
```

---

## Which Method Should I Use?

1. **Method 1 (Direct SQL)** - If you have SSH + database access ⭐ Recommended
2. **Method 3 (Node.js)** - If your app is deployed on the server
3. **Method 2 (File Upload)** - If Method 1 fails
4. **Manual SQL** - Last resort

---

## After Migration

1. ✅ Restart your server
2. ✅ Go to Manufacturing → Inventory Tab
3. ✅ You should see the location selector dropdown
4. ✅ Test by filtering by different locations

---

## Troubleshooting

**"Permission denied":**
- Make sure you have SSH access
- Check database user permissions

**"Database not found":**
- Use correct database name
- Check with: `psql -l` to list databases

**"Table does not exist":**
- Make sure you're in the correct database
- Check table name: `\dt` in psql

---

**All migration scripts are ready!** Just run the appropriate one for your setup. 🚀

