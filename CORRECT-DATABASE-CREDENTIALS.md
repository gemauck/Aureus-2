# Correct Database Credentials - Production Server

## ✅ CORRECT DATABASE CONNECTION DETAILS

**Use these credentials for ALL database connections:**

```
username = doadmin
password = [Set via DB_PASSWORD or DATABASE_PASSWORD environment variable]
host = dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com
port = 25060
database = defaultdb
sslmode = require
```

## 📝 DATABASE_URL Connection String

**⚠️ SECURITY: Never hardcode passwords. Use environment variables:**

```bash
# Set password as environment variable
export DB_PASSWORD="your-password-here"

# Or use DATABASE_URL directly
export DATABASE_URL="postgresql://doadmin:${DB_PASSWORD}@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
```

## ⚠️ IMPORTANT: Correct Hostname

**✅ CORRECT Hostname:**
- `dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com`
- Note: `nov-3-backup5` (not `nov-3-backup4-nov-6-backup`)

**❌ WRONG Hostname (DO NOT USE):**
- `dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com`

## 🚀 Quick Update Commands

### For Production Server:

```bash
cd /var/www/abcotronics-erp
# Set password as environment variable first
export DB_PASSWORD="your-password-here"
# Then update .env (password will be read from environment variable)
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://doadmin:\${DB_PASSWORD}@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require\"|" .env
pm2 restart all --update-env
```

### Or Use the Fix Script:

```bash
# Upload fix-database-hostname.sh to server, then:
chmod +x fix-database-hostname.sh
./fix-database-hostname.sh
```

## 📋 Files Updated

All scripts and configuration files have been updated to use the correct credentials:

- ✅ `fix-database-hostname.sh` - Production server fix script
- ✅ `update-database-connection.sh` - Local development update
- ✅ `update-production-database.sh` - Production server update
- ✅ `fix-database-now.sh` - Complete fix script
- ✅ `ecosystem.config.mjs` - PM2 configuration (fallback)
- ✅ `DATABASE-CONNECTION-UPDATE.md` - Documentation
- ✅ `PRODUCTION-DATABASE-FIX.md` - Production fix guide

## 🔍 Verification

After updating, verify the connection:

1. **Check PM2 logs:**
   ```bash
   pm2 logs --lines 50 | grep -i "prisma\|database\|connection"
   ```

2. **Look for success messages:**
   - ✅ `Prisma database connection established`
   - ✅ `Prisma client initialized`

3. **Test API endpoint:**
   ```bash
   curl https://abcoafrica.co.za/api/me
   ```

## 🔐 Security

- Never commit `.env` file to git
- Credentials are stored in `.env` file on server only
- Rotate credentials if they were exposed publicly

