# 🚨 DEPLOY DATABASE FIX NOW

## Quick Deploy Command

Run this command to fix the database connection issue:

```bash
./deploy-database-fix.sh
```

This script will:
1. ✅ Install PostgreSQL if needed
2. ✅ Start PostgreSQL service
3. ✅ Create database `abcotronics_erp`
4. ✅ Update DATABASE_URL in `.env` to PostgreSQL
5. ✅ Update DATABASE_URL in `ecosystem.config.mjs` to PostgreSQL
6. ✅ Generate Prisma client
7. ✅ Push database schema
8. ✅ Restart application with PM2

## What It Fixes

**Before:**
```javascript
DATABASE_URL: 'file:./prisma/dev.db'  // ❌ SQLite
```

**After:**
```javascript
DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/abcotronics_erp'  // ✅ PostgreSQL
```

## After Running

1. **Check if it worked:**
   ```bash
   ssh root@165.22.127.196
   pm2 logs abcotronics-erp --lines 20
   ```

2. **Test health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should show: `"database": "connected"`

3. **Test in browser:**
   - Go to https://abcoafrica.co.za
   - Open browser console
   - Check if API calls return 200 instead of 500

## If Script Fails

Run diagnostic manually:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
/root/diagnose-droplet-db.sh
```

Then check logs:
```bash
pm2 logs abcotronics-erp --err --lines 100
```

## Manual Fix (If Script Doesn't Work)

SSH into droplet and run:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp

# Install PostgreSQL
apt-get update && apt-get install -y postgresql postgresql-contrib
systemctl start postgresql

# Create database
sudo -u postgres createdb abcotronics_erp

# Update .env
sed -i 's|DATABASE_URL=.*|DATABASE_URL="postgresql://postgres:postgres@localhost:5432/abcotronics_erp"|' .env

# Update ecosystem.config.mjs
sed -i "s|DATABASE_URL: '.*'|DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/abcotronics_erp'|" ecosystem.config.mjs

# Generate Prisma and restart
npx prisma generate
npx prisma db push
pm2 restart abcotronics-erp
pm2 save
```

---

**Run `./deploy-database-fix.sh` now to fix the issue!**

