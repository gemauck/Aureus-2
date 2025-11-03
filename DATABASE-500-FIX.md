# Database 500 Error Fix - Production Server

## Problem Summary

Your production server at `https://abcoafrica.co.za` is returning **500 Internal Server Error** for all database API requests (projects, clients, leads, invoices, users, time-entries).

### Error Details

From the browser console logs:
```
Invalid `prisma.calendarNote.findMany()` invocation:
error: Error validating datasource `db`: the URL must start with the protocol `file:`.
```

### Root Cause

The production server's PM2 configuration was **not setting the `DATABASE_URL` environment variable**, causing Prisma to fail initialization.

## Solution

I've created automated fix scripts. You have **two options**:

---

## Option 1: Quick Fix (Recommended - 2 minutes)

Run this one-line command from your local machine:

```bash
./quick-fix-database.sh
```

This script will:
1. ✅ SSH into your production server
2. ✅ Create the missing database file
3. ✅ Update PM2 configuration with correct `DATABASE_URL`
4. ✅ Restart the application
5. ✅ Verify the fix worked

**What this does:**
- Creates `ecosystem.config.mjs` with proper `DATABASE_URL="file:./prisma/dev.db"`
- Restarts PM2 to pick up the new configuration
- The app will then have access to the database

---

## Option 2: Manual Fix via SSH

If you prefer to do it manually:

```bash
# SSH into production server
ssh root@165.22.127.196

# Navigate to app directory
cd /var/www/abcotronics-erp

# Ensure database file exists
mkdir -p prisma
touch prisma/dev.db
chmod 666 prisma/dev.db

# Create ecosystem.config.mjs
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

---

## Verification

After running the fix, verify it worked:

### 1. Check PM2 Logs
```bash
ssh root@165.22.127.196 'pm2 logs abcotronics-erp --lines 50'
```

Look for:
- ✅ `Prisma client initialized`
- ✅ `🔗 DATABASE_URL: file:./prisma/dev.db`
- ❌ Should **NOT** see: `DATABASE_URL is not set` or `Error validating datasource`

### 2. Test Health Endpoint
```bash
curl https://abcoafrica.co.za/api/health
```

Expected response: `{"status":"ok","timestamp":"..."}`

### 3. Test Database Endpoints
```bash
# Get auth token first (login via browser), then:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://abcoafrica.co.za/api/clients
```

Should return clients array (not 500 error).

---

## What Was Fixed

### Before (Broken)
```bash
# PM2 was started without environment variables:
pm2 start server.js --name abcotronics-erp
# This resulted in no DATABASE_URL being set
```

### After (Fixed)
```javascript
// PM2 now uses ecosystem.config.mjs with proper env vars:
pm2 start ecosystem.config.mjs

// ecosystem.config.mjs contains:
{
  env: {
    DATABASE_URL: 'file:./prisma/dev.db',  // ✅ Now set!
    APP_URL: 'https://abcoafrica.co.za'     // ✅ Now set!
  }
}
```

---

## Files Modified

1. **`quick-fix-database.sh`** - Automated fix script
2. **`fix-production-database-url.sh`** - Interactive fix script for server-side use
3. **`deploy-to-droplet.sh`** - Updated deployment script for future deployments

---

## Important Notes

### ⚠️ SQLite on Production

**Current Setup**: Using SQLite (`file:./prisma/dev.db`)

**Limitations**:
- ✅ Works for small to medium databases
- ⚠️ Data loss on server redeployment/reimage
- ⚠️ Not ideal for high-traffic scenarios
- ⚠️ Single-threaded writes

**Recommendation**: Consider migrating to PostgreSQL for production:
- Digital Ocean managed PostgreSQL ($15/month)
- Or PostgreSQL on a separate droplet
- See: `DATABASE-SETUP-GUIDE.md`

### 🔒 Environment Variables

Make sure your `.env` file on the production server has:

```bash
NODE_ENV=production
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="your-actual-secret-here"  # ⚠️ CHANGE THIS!
PORT=3000
APP_URL="https://abcoafrica.co.za"
```

**Critical**: The `JWT_SECRET` must be set to a strong random value. Generate one with:
```bash
openssl rand -hex 32
```

---

## Troubleshooting

### Still Getting 500 Errors?

1. **Check PM2 logs**:
   ```bash
   ssh root@165.22.127.196 'pm2 logs abcotronics-erp --lines 100'
   ```

2. **Verify database file exists**:
   ```bash
   ssh root@165.22.127.196 'ls -lh /var/www/abcotronics-erp/prisma/dev.db'
   ```

3. **Check PM2 environment**:
   ```bash
   ssh root@165.22.127.196 'pm2 env 0'
   ```
   Look for `DATABASE_URL` in the output.

4. **Restart PM2**:
   ```bash
   ssh root@165.22.127.196 'pm2 restart abcotronics-erp'
   ```

### Database File Not Found?

If the database file is missing or corrupted:

```bash
# SSH into server
ssh root@165.22.127.196

# Navigate to app directory
cd /var/www/abcotronics-erp

# Generate Prisma client
npx prisma generate

# Create and push schema to database
npx prisma db push

# Restart PM2
pm2 restart abcotronics-erp
```

---

## Next Steps After Fix

1. ✅ Run the quick fix script
2. ✅ Verify API endpoints work
3. ✅ Check browser console for any remaining errors
4. ⚠️ Consider setting up PostgreSQL for better reliability
5. ⚠️ Generate and set a strong `JWT_SECRET` in production `.env`

---

## Questions?

If the fix doesn't work:
1. Run `pm2 logs abcotronics-erp --lines 100` and look for Prisma errors
2. Check `/var/www/abcotronics-erp/prisma/dev.db` exists and has correct permissions
3. Verify `ecosystem.config.mjs` exists and has the correct configuration

