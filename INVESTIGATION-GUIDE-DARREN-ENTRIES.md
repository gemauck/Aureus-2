# Investigation Guide: Lost Entries from Darren (Yesterday)

## Overview
This guide helps investigate entries made by user "darren" yesterday that appear to have been lost.

## Quick Start

### 1. Run the Investigation Script
```bash
# Set your database password
export DB_PASS=your_database_password

# Run the investigation script
./investigate-darren-entries.sh
```

This script will:
- Find darren's user account in the database
- Check AuditLog entries from yesterday
- Search all key tables for entries created/updated yesterday
- Check for orphaned entries or failed saves
- Provide a comprehensive report

### 2. Check Server Logs
```bash
# SSH into production server
ssh root@abcoafrica.co.za

# Navigate to app directory
cd /var/www/abcotronics-erp

# Check PM2 logs for darren's activity
pm2 logs abcotronics-erp --lines 1000 | grep -i darren

# Or check all logs from yesterday
pm2 logs abcotronics-erp --lines 5000 | grep "$(date -v-1d +%Y-%m-%d)"
```

### 3. Check Database Directly

If you have Prisma Studio set up:
```bash
npx prisma studio
```

Then navigate to:
- **AuditLog** table → Filter by `createdAt` = yesterday
- **User** table → Find darren's user ID
- Check relevant tables (Project, Client, TimeEntry, JobCard, UserTask) for entries with darren's `ownerId` from yesterday

## Common Causes of Data Loss

### 1. **Transaction Rollbacks**
- Database operations wrapped in transactions that failed
- Partial saves that were rolled back due to errors
- **Check**: Look for error logs around the time darren was working

### 2. **Validation Errors**
- Data failed validation and was rejected
- **Check**: Look for validation error messages in logs
- **Check**: Look for entries with `temp_` IDs (indicates failed saves)

### 3. **Optimistic Updates Not Persisted**
- Frontend showed data but backend save failed
- **Check**: Look for entries that exist in localStorage but not in database
- **Check**: Look for API errors in browser console logs

### 4. **Database Connection Issues**
- Temporary connection loss during save
- **Check**: Server logs for connection errors
- **Check**: Network request logs

### 5. **Race Conditions**
- Multiple saves overwriting each other
- **Check**: Look for duplicate entries or missing updates
- **Check**: AuditLog for multiple rapid updates

### 6. **Database Restore/Migration**
- Database was restored from backup (losing recent data)
- Schema migration that dropped data
- **Check**: `UPDATE-PRODUCTION-DATABASE.sh` or other migration scripts run yesterday
- **Check**: Database backup/restore logs

### 7. **User Permission Issues**
- Entries created but not visible due to permission filters
- **Check**: Verify darren's user permissions
- **Check**: Check if entries exist but are filtered out

### 8. **Component-Specific Issues**
If darren was working in **MonthlyDocumentCollectionTracker**:
- Auto-save debounce might have been interrupted
- Browser refresh before save completed
- **Check**: Look for `documentSections` updates in Project table
- **Check**: Check localStorage for unsaved snapshots

## Investigation Steps

### Step 1: Identify Darren's User Account
```sql
SELECT id, email, name, role, "createdAt", "lastLoginAt"
FROM "User"
WHERE LOWER(name) LIKE '%darren%' 
   OR LOWER(email) LIKE '%darren%';
```

### Step 2: Check Audit Logs
```sql
-- All audit logs from yesterday
SELECT 
    al.id,
    al."createdAt",
    al.action,
    al.entity,
    al."entityId",
    al.diff,
    u.name as actor_name
FROM "AuditLog" al
JOIN "User" u ON al."actorId" = u.id
WHERE (LOWER(u.name) LIKE '%darren%' OR LOWER(u.email) LIKE '%darren%')
  AND al."createdAt" >= CURRENT_DATE - INTERVAL '1 day'
  AND al."createdAt" < CURRENT_DATE
ORDER BY al."createdAt" DESC;
```

### Step 3: Check All Tables for Darren's Entries
Replace `DARREN_USER_ID` with darren's actual user ID:

```sql
-- Projects
SELECT id, name, "createdAt", "updatedAt"
FROM "Project"
WHERE "ownerId" = 'DARREN_USER_ID'
  AND ("createdAt" >= CURRENT_DATE - INTERVAL '1 day' 
       OR "updatedAt" >= CURRENT_DATE - INTERVAL '1 day');

-- Clients
SELECT id, name, type, "createdAt", "updatedAt"
FROM "Client"
WHERE "ownerId" = 'DARREN_USER_ID'
  AND ("createdAt" >= CURRENT_DATE - INTERVAL '1 day' 
       OR "updatedAt" >= CURRENT_DATE - INTERVAL '1 day');

-- Time Entries
SELECT id, date, hours, "projectName", "createdAt", "updatedAt"
FROM "TimeEntry"
WHERE "ownerId" = 'DARREN_USER_ID'
  AND ("createdAt" >= CURRENT_DATE - INTERVAL '1 day' 
       OR "updatedAt" >= CURRENT_DATE - INTERVAL '1 day');

-- Job Cards
SELECT id, "jobCardNumber", "clientName", status, "createdAt", "updatedAt"
FROM "JobCard"
WHERE "ownerId" = 'DARREN_USER_ID'
  AND ("createdAt" >= CURRENT_DATE - INTERVAL '1 day' 
       OR "updatedAt" >= CURRENT_DATE - INTERVAL '1 day');

-- User Tasks
SELECT id, title, status, "createdAt", "updatedAt"
FROM "UserTask"
WHERE "ownerId" = 'DARREN_USER_ID'
  AND ("createdAt" >= CURRENT_DATE - INTERVAL '1 day' 
       OR "updatedAt" >= CURRENT_DATE - INTERVAL '1 day');
```

### Step 4: Check for Failed Saves
```sql
-- Look for entries with temp IDs (failed saves)
SELECT 'Project' as table_name, COUNT(*) as temp_count
FROM "Project" WHERE id LIKE 'temp_%'
UNION ALL
SELECT 'Client', COUNT(*) FROM "Client" WHERE id LIKE 'temp_%'
UNION ALL
SELECT 'TimeEntry', COUNT(*) FROM "TimeEntry" WHERE id LIKE 'temp_%';
```

### Step 5: Check for Orphaned Entries
```sql
-- Entries with ownerId that doesn't exist (might indicate user deletion)
SELECT 'Project' as table_name, COUNT(*) as orphaned
FROM "Project" p
WHERE p."ownerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = p."ownerId")
UNION ALL
SELECT 'Client', COUNT(*)
FROM "Client" c
WHERE c."ownerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = c."ownerId");
```

## Recovery Options

### If Data Exists But Not Visible
1. Check user permissions and filters
2. Verify database connection is working
3. Check if entries are in a different database/backup

### If Data Was Never Saved
1. Check browser localStorage for unsaved data
2. Check if there are any pending operations in the operation queue
3. Review error logs to understand why saves failed

### If Data Was Deleted
1. Check if there's a database backup from before the deletion
2. Check AuditLog for delete actions
3. Check if a migration or script deleted the data

### If Data Was Rolled Back
1. Check transaction logs (if available)
2. Review error logs around the time of the save
3. Check if there were database connection issues

## Prevention

To prevent future data loss:

1. **Enable Audit Logging**: Ensure `auditLogging` is enabled in SystemSettings
2. **Monitor Error Logs**: Set up alerts for database errors
3. **Regular Backups**: Ensure database backups are running daily
4. **Transaction Safety**: Ensure all critical operations use transactions
5. **User Feedback**: Show clear success/error messages when saves complete
6. **Offline Support**: Ensure offline changes are queued and synced when online

## Next Steps After Investigation

1. **Document Findings**: Record what was found (or not found)
2. **Identify Root Cause**: Determine why the data was lost
3. **Implement Fix**: Address the underlying issue
4. **Recover Data**: If possible, restore from backup or recreate entries
5. **Notify User**: Inform darren about the findings and any recovery actions

## Support Contacts

- **Database Admin**: Check Digital Ocean dashboard for database issues
- **Server Admin**: Check PM2 logs and server status
- **Development Team**: Review code for potential bugs

---

**Last Updated**: $(date)
**Investigation Script**: `./investigate-darren-entries.sh`

