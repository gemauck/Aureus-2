# Quick Migration Guide

## 🚨 Current Issue
Database connection slots are full. Automatic migration cannot run.

## ✅ Solution: Manual Migration

### Step 1: Get Database Connection String
Your database connection is in `.env` file:
```
DATABASE_URL=postgresql://...
```

### Step 2: Run Migration SQL

**Option A: Using psql**
```bash
psql $DATABASE_URL -f prisma/migrations/manual_add_user_task_management.sql
```

**Option B: Using Database Tool**
1. Open your database admin tool (pgAdmin, DBeaver, etc.)
2. Connect to database
3. Open file: `prisma/migrations/manual_add_user_task_management.sql`
4. Execute the SQL

**Option C: Copy & Paste**
1. Open: `prisma/migrations/manual_add_user_task_management.sql`
2. Copy all SQL
3. Paste into your database query tool
4. Execute

### Step 3: Verify Migration
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('UserTask', 'UserTaskTag', 'UserTaskTagRelation');
-- Should return 3 tables
```

### Step 4: Restart Server
```bash
npm start
```

### Step 5: Test Feature
1. Go to Dashboard
2. Task Management should appear
3. Create a test task

## 📁 Migration File
Location: `prisma/migrations/manual_add_user_task_management.sql`

## ⚡ Quick Command
If you have psql installed:
```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
psql $DATABASE_URL -f prisma/migrations/manual_add_user_task_management.sql
```

---

**The code is 100% ready. Just need to run the SQL migration!**

