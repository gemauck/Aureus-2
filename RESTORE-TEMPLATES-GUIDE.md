# 🔄 Restore Weekly FMS Review Templates from Backup

## Overview

Your Weekly FMS Review templates were likely deleted. This guide will help you restore them from a Digital Ocean backup.

## 📋 Step 1: Find Your Backup Database

### Option A: Use an Existing Restored Backup

If you've already restored a backup database in Digital Ocean:

1. Go to: **https://cloud.digitalocean.com/databases**
2. Find your restored backup database (it will have a different name than your main database)
3. Click on it and go to **"Connection Details"** or **"Connection String"**
4. Copy the PostgreSQL connection string

It will look like:
```
postgresql://doadmin:xxxxx@backup-db-xxxxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

### Option B: Restore a New Backup

If you need to restore a backup first:

1. Go to: **https://cloud.digitalocean.com/databases**
2. Click on your main database cluster
3. Click the **"Backups"** tab
4. Find a backup from **before your templates were deleted**
5. Click **"Restore"** or **"Create Database from Backup"**
6. Wait 5-10 minutes for it to restore
7. Get the connection string from the restored database

## 🚀 Step 2: Extract Templates from Backup

### Method 1: Connect to Backup Database (Recommended)

This method connects directly to the backup database and extracts templates:

```bash
node extract-templates-from-backup-db.js "postgresql://doadmin:xxxxx@backup-db.example.com:25060/defaultdb?sslmode=require"
```

Or set as environment variable:

```bash
export BACKUP_DATABASE_URL="postgresql://doadmin:xxxxx@backup-db.example.com:25060/defaultdb?sslmode=require"
node extract-templates-from-backup-db.js
```

**What it does:**
- ✅ Connects to the backup database
- ✅ Finds all Weekly FMS Review templates
- ✅ Restores them to your current database
- ✅ Skips templates that already exist
- ✅ Shows you what was restored

### Method 2: Restore from SQL Dump File

If you have a SQL dump file from the backup:

```bash
node restore-templates-from-backup.js database-backups/backup_20240101_120000.sql.gz
```

Or for uncompressed SQL:

```bash
node restore-templates-from-backup.js database-backups/backup_20240101_120000.sql
```

**Note:** This method requires you to download the SQL dump from Digital Ocean first.

## 🔍 Step 3: Verify Templates Were Restored

After running the restore script, verify the templates are back:

```bash
node check-templates.js
```

This will show you:
- How many templates exist in the database
- Which templates have the correct type (`weekly-fms-review`)
- Details about each template

## ✅ Step 4: Check in the Application

1. Open your Weekly FMS Review Tracker
2. Click the template management button
3. You should see your templates listed

## 🆘 Troubleshooting

### "No templates found in backup database"

**Possible causes:**
1. The backup was taken before templates were created
2. Templates have a different `type` value in the backup
3. Templates were deleted before the backup was taken

**Solution:**
- Check when the backup was created vs when you last saw templates
- Try a different backup from a later date
- Check if templates exist with a different type (the script will show this)

### "Connection failed"

**Possible causes:**
1. Backup database URL is incorrect
2. Backup database is not accessible
3. Network/firewall issues

**Solution:**
- Double-check the connection string from Digital Ocean
- Make sure the backup database is running
- Check your network connection

### "Templates already exist"

This means the templates are already in your current database. The script will skip them.

**To check:**
```bash
node check-templates.js
```

## 📝 Quick Reference

### Check Current Templates
```bash
node check-templates.js
```

### Restore from Backup Database
```bash
node extract-templates-from-backup-db.js "<backup-database-url>"
```

### Restore from SQL File
```bash
node restore-templates-from-backup.js <backup-file.sql.gz>
```

## 💡 Tips

1. **Always check backups first**: Use `check-templates.js` to see what's in your current database
2. **Use the most recent backup**: Choose a backup from when you know templates existed
3. **Backup before restoring**: The restore scripts are safe, but it's good practice to backup your current database first
4. **Verify after restore**: Always run `check-templates.js` after restoring to confirm templates are back

## 🔗 Related Files

- `check-templates.js` - Check what templates exist in database
- `extract-templates-from-backup-db.js` - Extract from backup database
- `restore-templates-from-backup.js` - Extract from SQL dump file







