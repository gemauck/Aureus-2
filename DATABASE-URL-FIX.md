# DATABASE_URL Configuration Fix

## Problem
Your production server is returning 500 errors because Prisma cannot connect to the database. The error message indicates:
```
Error validating datasource `db`: the URL must start with the protocol `file:`.
```

## Cause
The `DATABASE_URL` environment variable on your production server (`abcoafrica.co.za`) is either:
1. Not set at all ✅ **CONFIRMED - This is the issue**
2. Set without the required `file:` protocol prefix (e.g., `./prisma/dev.db` instead of `file:./prisma/dev.db`)
3. Set incorrectly for SQLite

## ⚡ Quick Fix - Run This Now!

**The easiest solution**: Run the automated fix script:

```bash
./quick-fix-database.sh
```

This will fix the issue automatically in 2 minutes.

---

## Manual Fix Options

### Option 1: Fix on Production Server (Immediate)

SSH into your production server and verify/set the `DATABASE_URL`:

```bash
# SSH into server
ssh root@abcoafrica.co.za  # or your server IP

# Check current DATABASE_URL
echo $DATABASE_URL

# Set correct DATABASE_URL
export DATABASE_URL="file:./prisma/dev.db"

# Or if using absolute path:
export DATABASE_URL="file:/var/www/abcotronics-erp/prisma/dev.db"

# Make it permanent (add to your server's environment configuration)
# For PM2:
pm2 restart all --update-env

# Or add to your .env file or systemd service file
```

### Option 2: Code Auto-Fix (Applied)

The code has been updated to automatically detect and fix common `DATABASE_URL` format issues:

- ✅ Auto-adds `file:` prefix if missing
- ✅ Validates format before Prisma initialization
- ✅ Provides clear error messages

**Note**: The auto-fix will handle cases where `DATABASE_URL` is set to `./prisma/dev.db` but will still fail if the variable is completely missing or set to an invalid value.

### Option 3: Update Server Configuration

If you're using a process manager (PM2, systemd, etc.), update your configuration:

**PM2 Ecosystem File** (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'erp-app',
    script: './server.js',
    env: {
      DATABASE_URL: 'file:./prisma/dev.db',
      NODE_ENV: 'production',
      // ... other vars
    }
  }]
}
```

**Systemd Service** (`.service` file):
```ini
[Service]
Environment="DATABASE_URL=file:./prisma/dev.db"
```

## Verification

After fixing, restart your server and check the logs:

```bash
# Restart server
pm2 restart all

# Check logs
pm2 logs

# Look for these messages:
# ✅ Prisma client initialized
# 🔗 DATABASE_URL: file:./prisma/dev.db
```

## Expected DATABASE_URL Formats

### SQLite (Current Setup):
```
file:./prisma/dev.db          # Relative path (recommended)
file:/absolute/path/to/db.db   # Absolute path
```

### PostgreSQL (If migrating):
```
postgresql://user:password@host:port/database
```

## Important Notes

1. **File Paths**: Ensure the database file path exists and is writable
2. **Permissions**: The database file and directory need write permissions
3. **SQLite Limitations**: SQLite on production may lose data on redeploy (consider PostgreSQL for production)

## Testing

After setting the correct `DATABASE_URL`, test the API:

```bash
curl https://abcoafrica.co.za/api/health
```

The 500 errors should be resolved once `DATABASE_URL` is correctly configured.

