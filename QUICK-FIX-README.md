# 🚨 Production Database 500 Error - Quick Fix

## The Problem

Your production site at `https://abcoafrica.co.za` is returning **500 Internal Server Error** for all API requests.

**Root Cause**: The `DATABASE_URL` environment variable is not being passed to your application, causing Prisma to fail.

## 🚀 The Solution (2 Minutes)

**Run this command from your project directory:**

```bash
./quick-fix-database.sh
```

That's it! The script will automatically:
1. SSH into your production server
2. Fix the PM2 configuration
3. Restart your application
4. Verify everything works

---

## Alternative: Manual Fix

If you can't run the script, SSH into your server and follow these commands:

```bash
# Connect to server
ssh root@165.22.127.196

# Navigate to app directory
cd /var/www/abcotronics-erp

# Ensure database exists
mkdir -p prisma
touch prisma/dev.db
chmod 666 prisma/dev.db

# Create PM2 config file
cat > ecosystem.config.mjs << 'EOFPM2'
export default {
  apps: [{
    name: 'abcotronics-erp',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'file:./prisma/dev.db',
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOFPM2

# Restart PM2 with new config
pm2 delete abcotronics-erp
pm2 start ecosystem.config.mjs
pm2 save

# Check logs
pm2 logs abcotronics-erp --lines 50
```

Look for these success messages in the logs:
- ✅ `Prisma client initialized`
- ✅ `🔗 DATABASE_URL: file:./prisma/dev.db`

---

## Verify the Fix

After running the fix:

1. **Check your browser console** - should no longer see 500 errors
2. **Test the API**:
   ```bash
   curl https://abcoafrica.co.za/api/health
   ```
   Expected: `{"status":"ok",...}`

3. **Check PM2 status**:
   ```bash
   ssh root@165.22.127.196 'pm2 status'
   ```

---

## What Changed?

**Before**: PM2 was started without environment variables:
```bash
pm2 start server.js --name abcotronics-erp  # ❌ No DATABASE_URL
```

**After**: PM2 now uses a config file with environment variables:
```bash
pm2 start ecosystem.config.mjs  # ✅ DATABASE_URL included
```

---

## Need More Details?

See `DATABASE-500-FIX.md` for:
- Detailed troubleshooting
- Migration to PostgreSQL (recommended for production)
- Environment variable configuration
- JWT_SECRET setup

---

## Quick Reference

**Server IP**: `165.22.127.196`  
**App Directory**: `/var/www/abcotronics-erp`  
**Database**: `file:./prisma/dev.db`  
**Domain**: `https://abcoafrica.co.za`

