# 🚨 DROPLET DATABASE FIX - Quick Guide

## The Problem
Your `ecosystem.config.mjs` shows:
```javascript
DATABASE_URL: 'file:./prisma/dev.db'  // ❌ SQLite
```

But your application code expects **PostgreSQL**! This mismatch is causing all the 500 errors.

## ⚡ Quick Fix Options

### Option 1: Run Diagnostic Script (Recommended First)
```bash
# Copy script to droplet
scp diagnose-droplet-db.sh root@165.22.127.196:/root/

# SSH and run
ssh root@165.22.127.196
chmod +x /root/diagnose-droplet-db.sh
/root/diagnose-droplet-db.sh
```

This will show you exactly what's wrong.

### Option 2: Run Auto-Fix Script
```bash
# Run the fix script
./fix-droplet-database.sh
```

This will:
- Install PostgreSQL if needed
- Create database if needed
- Update DATABASE_URL in .env
- Update PM2 config
- Restart the application

### Option 3: Manual Fix (If scripts don't work)

#### SSH into droplet:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
```

#### Check current setup:
```bash
# Check .env
cat .env | grep DATABASE_URL

# Check PM2 config
cat ecosystem.config.mjs | grep DATABASE_URL

# Check PostgreSQL
systemctl status postgresql
```

#### Install PostgreSQL (if needed):
```bash
apt-get update
apt-get install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
```

#### Create database:
```bash
sudo -u postgres createdb abcotronics_erp
```

#### Update DATABASE_URL:
```bash
# Edit .env
nano .env
# Change to:
DATABASE_URL="postgresql://postgres@localhost:5432/abcotronics_erp"

# Edit ecosystem.config.mjs
nano ecosystem.config.mjs
# Change DATABASE_URL to:
DATABASE_URL: 'postgresql://postgres@localhost:5432/abcotronics_erp'
```

#### Generate Prisma and restart:
```bash
npx prisma generate
npx prisma db push
pm2 restart abcotronics-erp
pm2 save
```

## 🔍 Check Logs After Fix

```bash
# View PM2 logs
pm2 logs abcotronics-erp --lines 50

# Check for database errors
pm2 logs abcotronics-erp | grep -i "database\|prisma\|connection"
```

## ✅ Verify It's Working

```bash
# Test health endpoint
curl http://localhost:3000/health

# Should show: "database": "connected"

# Test database connection endpoint (from browser console)
fetch('/api/test-db-connection', {
  headers: {
    'Authorization': `Bearer ${window.storage.getToken()}`
  }
}).then(r => r.json()).then(console.log)
```

## 📋 Most Likely Issues

1. **PostgreSQL not installed** → Install it
2. **PostgreSQL not running** → `systemctl start postgresql`
3. **DATABASE_URL points to SQLite** → Change to PostgreSQL URL
4. **Database doesn't exist** → Create it with `createdb`
5. **PM2 using old config** → Restart PM2 after updating config

## 🆘 Still Not Working?

Run diagnostic and share output:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
./diagnose-droplet-db.sh
```

Then check logs:
```bash
pm2 logs abcotronics-erp --err --lines 100
```

---

**The root cause**: Your PM2 config has `DATABASE_URL: 'file:./prisma/dev.db'` (SQLite) but your code needs PostgreSQL. Update it to use PostgreSQL!

