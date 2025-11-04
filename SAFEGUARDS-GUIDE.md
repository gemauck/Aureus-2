# Database Safeguards Guide

## 🛡️ Protection Layers Implemented

### 1. **Safe Migration Wrapper** (`scripts/safe-db-migration.sh`)
Automatically creates backups and blocks dangerous flags.

**Usage:**
```bash
# Instead of:
npx prisma db push --accept-data-loss

# Use:
./scripts/safe-db-migration.sh npx prisma db push --accept-data-loss
```

**Features:**
- ✅ Automatic backup before migration
- ✅ Blocks `--force-reset` flag
- ✅ Requires confirmation for `--accept-data-loss`
- ✅ Restore instructions on failure

### 2. **Pre-Deployment Check** (`scripts/pre-deployment-check.sh`)
Scans all deployment scripts for dangerous patterns.

**Usage:**
```bash
./scripts/pre-deployment-check.sh
```

**What it checks:**
- Dangerous flags (`--force-reset`, `migrate reset`)
- Missing backup procedures
- Hardcoded credentials
- Destructive SQL commands

### 3. **Automatic Backup Script** (`scripts/backup-database.sh`)
Creates backups before any database operation.

**Usage:**
```bash
# Before any migration:
./scripts/backup-database.sh

# Or integrate into your scripts:
./scripts/backup-database.sh && npx prisma migrate deploy
```

**Features:**
- ✅ Auto-detects database type (PostgreSQL/SQLite)
- ✅ Keeps last 10 backups
- ✅ Compressed backups for PostgreSQL

### 4. **Git Pre-Commit Hook** (`.git/hooks/pre-commit`)
Prevents dangerous code from being committed.

**Automatically blocks:**
- `--force-reset` flags
- `migrate reset` commands
- `DROP TABLE` statements
- `TRUNCATE` operations
- `DELETE FROM` on critical tables

**To bypass (NOT RECOMMENDED):**
```bash
git commit --no-verify -m "message"
```

### 5. **Updated Dangerous Scripts**
- ✅ `apply-user-schema-migration.sh` - Fixed and now uses safe wrapper
- ⚠️ Other scripts should be updated to use safe wrapper

## 📋 Best Practices

### Before Any Migration:

1. **Create Backup**
   ```bash
   ./scripts/backup-database.sh
   ```

2. **Run Pre-Deployment Check**
   ```bash
   ./scripts/pre-deployment-check.sh
   ```

3. **Use Safe Wrapper**
   ```bash
   ./scripts/safe-db-migration.sh npx prisma migrate deploy
   ```

### Safe Migration Commands:

✅ **SAFE:**
```bash
npx prisma migrate deploy          # Safe - applies migrations
npx prisma db push                 # Safe - non-destructive
npx prisma generate                # Safe - just generates client
```

⚠️ **REQUIRES CONFIRMATION:**
```bash
./scripts/safe-db-migration.sh npx prisma db push --accept-data-loss
```

❌ **BLOCKED:**
```bash
npx prisma db push --force-reset   # BLOCKED - deletes all data
npx prisma migrate reset           # BLOCKED - deletes all data
```

## 🔧 Updating Existing Scripts

### Example: Making a Deployment Script Safe

**Before (DANGEROUS):**
```bash
#!/bin/bash
npx prisma db push --force-reset
```

**After (SAFE):**
```bash
#!/bin/bash
# Create backup first
./scripts/backup-database.sh

# Use safe wrapper
./scripts/safe-db-migration.sh npx prisma migrate deploy
```

## 📊 Monitoring

### Check Backup Status:
```bash
ls -lh database-backups/
```

### Verify Last Backup:
```bash
# PostgreSQL
pg_restore --list database-backups/backup_*.sql.gz | head -20

# SQLite
sqlite3 database-backups/backup_*.db ".tables"
```

### Restore from Backup:
```bash
# PostgreSQL
gunzip -c database-backups/backup_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_URL

# SQLite
cp database-backups/backup_YYYYMMDD_HHMMSS.db prisma/dev.db
```

## 🚨 Emergency Procedures

### If Database Gets Deleted:

1. **Stop the application**
   ```bash
   pm2 stop abcotronics-erp
   ```

2. **Restore from latest backup**
   ```bash
   ./scripts/restore-from-backup.sh database-backups/backup_YYYYMMDD_HHMMSS.sql.gz
   ```

3. **Or restore from DigitalOcean backup**
   ```bash
   ./restore-db-to-10pm.sh
   ```

4. **Verify data**
   ```bash
   ./check-restored-db.sh
   ```

## 📝 Deployment Checklist

Before deploying any database changes:

- [ ] Run `./scripts/backup-database.sh`
- [ ] Run `./scripts/pre-deployment-check.sh`
- [ ] Review all changes in deployment scripts
- [ ] Test on staging environment first
- [ ] Have restore plan ready
- [ ] Verify backup exists and is recent
- [ ] Use safe migration wrapper for all operations

## 🔒 Security Notes

1. **Never commit backups** - Add to `.gitignore`:
   ```
   database-backups/
   *.sql.gz
   *.db.backup
   ```

2. **Protect backup files** - Set proper permissions:
   ```bash
   chmod 600 database-backups/*.sql.gz
   ```

3. **Encrypt sensitive backups** - For production:
   ```bash
   gpg -c database-backups/backup_*.sql.gz
   ```

## 📞 Support

If you encounter issues:
1. Check `DB-DELETION-INVESTIGATION.md` for common causes
2. Review recent backups in `database-backups/`
3. Check server logs for migration errors
4. Use DigitalOcean point-in-time recovery if needed

---

**Last Updated**: November 3, 2025
**Status**: Active safeguards in place

