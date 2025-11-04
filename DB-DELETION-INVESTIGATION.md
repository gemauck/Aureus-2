# Database Deletion Investigation Report

## 🔍 Possible Causes of Database Deletion

Based on code analysis, here are the most likely causes:

### 1. ⚠️ **CRITICAL: `apply-user-schema-migration.sh` - Line 20**
```bash
npx prisma db push --force-reset --skip-generate
```
**This is the MOST LIKELY culprit!**

- **Location**: `apply-user-schema-migration.sh` line 20
- **What it does**: `--force-reset` **DELETES ALL DATA** and recreates the schema
- **Risk**: ⚠️⚠️⚠️ **EXTREMELY DANGEROUS**
- **If this was run**: Your database would have been completely wiped

### 2. **Multiple Deployment Scripts Using `--accept-data-loss`**
Several scripts use this flag which can cause data loss:
- `deploy-postgresql-fix.sh` (line 31)
- `deploy-jobcard-fix.sh` (line 46, 51, 56)
- `deploy-mobile-fixes.sh` (line 39)
- `apply-rss-subscription-via-ssh.sh` (line 24)
- `apply-client-news-via-ssh.sh` (line 43, 55)
- `setup-multi-location-inventory.sh` (line 21)
- `deploy-inventory-type-update.sh` (line 21)
- `deploy-calendar-notes-fix.sh` (line 18)
- `deploy-inventory-fields.sh` (line 25, 29)
- `migrate-tags.sh` (line 52)
- `migrate-database.sh` (line 60)

**What `--accept-data-loss` does**: 
- Drops and recreates tables if schema changes
- **Can lose data** if there are schema conflicts

### 3. **Database Migration from SQLite to PostgreSQL**
From `POSTGRES-DEPLOYMENT-COMPLETE.md`:
- Database was switched from SQLite to PostgreSQL
- **This created a FRESH EMPTY database**
- Original data would not have been migrated automatically

### 4. **Recent Database Restore**
From `check-restored-db.sh`:
- There's evidence of a database restore from backup
- The restored database might have been empty or from an earlier time

### 5. **Prisma Migrate Reset (if run)**
If someone ran:
```bash
npx prisma migrate reset
```
This would **DELETE ALL DATA** and recreate the database.

## 🔎 Investigation Steps

### Check Server Logs
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
pm2 logs abcotronics-erp --lines 500 | grep -i "migrate\|reset\|push\|database"
```

### Check Recent Commands
```bash
ssh root@165.22.127.196
history | grep -i "prisma\|migrate\|db push"
```

### Check Database Backup Times
```bash
# Check when backups were created
./check-restored-db.sh
```

### Check Git History
Recent commits show:
- `0a48e47` - "Fix: Remove starredBy relation - StarredClient table doesn't exist in restored database"
- `fc8b782` - "Fix database 500 errors - switch to PostgreSQL schema"
- `99ad379` - "feat: Add Sales Orders display and Starred Clients feature"

## 🛡️ Prevention Measures

### 1. **REMOVE DANGEROUS FLAGS**
Update `apply-user-schema-migration.sh`:
```bash
# BEFORE (DANGEROUS):
npx prisma db push --force-reset --skip-generate

# AFTER (SAFE):
npx prisma migrate deploy
# OR
npx prisma db push --skip-generate
```

### 2. **Always Backup Before Migrations**
Add to all deployment scripts:
```bash
# Backup database before migration
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. **Use Migrations Instead of db push**
Prefer:
```bash
npx prisma migrate deploy
```
Instead of:
```bash
npx prisma db push --accept-data-loss
```

### 4. **Add Safety Checks**
Before running destructive commands, add confirmation:
```bash
read -p "⚠️ This will DELETE ALL DATA. Type 'YES' to continue: " confirm
if [ "$confirm" != "YES" ]; then
    echo "Aborted."
    exit 1
fi
```

## 🔧 Immediate Actions

1. ✅ **Restore from 10 PM backup** (in progress)
2. ⚠️ **Fix dangerous scripts** before next deployment
3. 📝 **Document which script was run** that caused deletion
4. 🔒 **Add backup automation** to prevent future data loss

## 📋 Scripts to Review/Fix

**HIGH PRIORITY (Dangerous):**
- `apply-user-schema-migration.sh` - Has `--force-reset`
- Any script with `--accept-data-loss` without backup

**MEDIUM PRIORITY:**
- All deployment scripts using `db push`
- Migration scripts without backups

## 💡 Recommendations

1. **Never use `--force-reset` in production**
2. **Always backup before migrations**
3. **Use `prisma migrate deploy` instead of `db push`**
4. **Test migrations on staging first**
5. **Set up automated daily backups**
6. **Add confirmation prompts for destructive operations**

---

**Last Updated**: November 3, 2025
**Status**: Investigation in progress - Awaiting restoration from 10 PM backup

