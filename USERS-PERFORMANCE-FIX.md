# Users Page Performance Fix

## 🚨 Problem
Users page was loading very slowly, similar to the clients/leads performance issues that were previously fixed.

## ✅ Fixes Applied

### 1. **Added Database Indexes for User Table** (CRITICAL)
**Files:** `add-performance-indexes.sql`, `apply-indexes.js`

**New Indexes:**
- `User_status_idx` - **CRITICAL** for filtering active/inactive users (used in non-admin queries)
- `User_createdAt_idx` - **CRITICAL** for sorting users by creation date (used in admin queries)
- `User_name_idx` - For sorting users by name (used in non-admin queries)
- `User_role_idx` - For filtering by role

**Impact:**
- Dramatically speeds up user queries, especially with WHERE clauses on `status`
- Essential for sorting by `createdAt` and `name`
- Similar performance improvements as seen with clients/leads fixes

## 📊 Expected Performance Improvements

### Before:
- Users API: **5-15+ seconds** (no indexes on status, createdAt, name)
- Users page load: **Slow** (waiting for database queries)

### After:
- Users API: **<1 second** (with indexes)
- Users page load: **Fast** (indexed queries)

## 🔧 Action Required: Apply Database Indexes

The indexes MUST be applied to see the full performance improvement:

### Option 1: Using the Script (Recommended)
```bash
node apply-indexes.js
```

This will create all indexes including the new User indexes.

### Option 2: Using SQL File
```bash
psql $DATABASE_URL -f add-performance-indexes.sql
```

Or connect to your database and run the SQL commands manually.

### Option 3: Via API (If Available)
If you have an `/api/apply-indexes` endpoint, you can call it with authentication.

## 📋 Indexes Created

```sql
-- User table indexes (CRITICAL for users page performance)
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_name_idx" ON "User"("name");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
```

## 🔍 Query Analysis

The users API uses these queries that benefit from indexes:

1. **Admin Query** (`api/users.js` line 46-76):
   - `orderBy: { createdAt: 'desc' }` → **User_createdAt_idx**
   - Fetches all users with full details

2. **Non-Admin Query** (`api/users.js` line 30-41):
   - `where: { status: { not: 'inactive' } }` → **User_status_idx**
   - `orderBy: { name: 'asc' }` → **User_name_idx**
   - Fetches minimal data for @mentions

## ✅ Verification

After applying indexes, verify they were created:

```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'User' AND indexname LIKE 'User_%'
ORDER BY indexname;
```

You should see:
- `User_status_idx`
- `User_createdAt_idx`
- `User_name_idx`
- `User_role_idx`

## 📝 Notes

- This follows the same optimization pattern used for clients/leads
- Indexes are safe to add and won't affect existing functionality
- Indexes improve read performance but have minimal impact on write performance
- The users API queries are already optimized (using WHERE clauses, not fetching all then filtering)







