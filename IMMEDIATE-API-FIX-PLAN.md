# 🚨 IMMEDIATE ACTION PLAN - API 500 Errors

## Current Status
✅ JavaScript errors fixed (isPerformanceMode, performanceMode)
✅ Fast-loader updated to wait longer for components
❌ **CRITICAL:** Backend API returning 500 errors preventing data load

## What's Happening
Your frontend is loading successfully, but when it tries to fetch data from the API:
```
GET https://abcoafrica.co.za/api/clients 500 (Internal Server Error)
```

This means the **server is running** but there's an internal error (likely database).

---

## 🔧 Immediate Diagnostic Steps

### Step 1: Test the API (Browser)
1. Open this diagnostic tool: `/diagnostics/api-test.html`
   ```bash
   # Just open this file in your browser:
   open diagnostics/api-test.html
   ```
2. Click "Test Health Endpoint" - should show ✅ if server is up
3. Click "Test /api/clients (No Auth)" - will show the exact error

### Step 2: Check Server Logs (Railway)
```bash
# View recent server logs
railway logs --tail 100

# Look for these errors:
# - "❌ Prisma connection failed"
# - "❌ Database error"
# - "Error: connect ECONNREFUSED"
# - "P1001: Can't reach database server"
```

### Step 3: Verify Environment Variables
```bash
# Check if DATABASE_URL is set correctly
railway vars

# Should show:
# DATABASE_URL=postgresql://...

# If missing or incorrect, set it:
railway variables set DATABASE_URL="postgresql://..."
```

---

## 🎯 Most Likely Causes & Fixes

### Cause 1: Database Not Connected
**Symptoms:** 500 error, "Prisma connection failed" in logs

**Fix:**
```bash
# Check if database is accessible
railway ps

# Restart database service if it exists
railway restart

# OR reconnect database
# In Railway dashboard: Settings → Database → Reconnect
```

### Cause 2: DATABASE_URL Environment Variable Wrong
**Symptoms:** 500 error, "P1001: Can't reach database server"

**Fix:**
```bash
# Get correct DATABASE_URL from Railway dashboard
# Then set it:
railway variables set DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Restart server to pick up new variable
railway restart
```

### Cause 3: Prisma Schema Mismatch
**Symptoms:** 500 error, "Column does not exist", "Invalid prisma schema"

**Fix:**
```bash
# Run migrations to sync database schema
npx prisma migrate deploy

# OR reset and resync (⚠️ DELETES ALL DATA)
npx prisma migrate reset --force
npx prisma migrate deploy
```

### Cause 4: Server Build Issue
**Symptoms:** Old code running, changes not reflected

**Fix:**
```bash
# Force a new deployment
railway up

# OR redeploy from Railway dashboard
# Settings → Deployments → Redeploy
```

---

## 🔍 Debug Commands

### Check Database Connection (Local)
```bash
# Try to connect to database directly
npx prisma studio

# If it opens, database is accessible
# If it fails, database connection is the issue
```

### Check Server Status
```bash
# Test if server responds
curl https://abcoafrica.co.za/health

# Should return:
# {"status":"ok","timestamp":"...","platform":"railway","version":"1.0.0"}
```

### Check API Endpoint
```bash
# Test API (will return 401 if working, 500 if broken)
curl -v https://abcoafrica.co.za/api/clients

# Look for response code:
# - 401 = ✅ Working (auth required)
# - 500 = ❌ Broken (server error)
# - 000 = ❌ Server not responding
```

---

## 🚀 Quick Fix Attempt

Try this sequence (takes ~2 minutes):

```bash
# 1. Check current status
railway status

# 2. View logs for errors
railway logs --tail 50

# 3. Check environment variables
railway vars

# 4. Restart the service
railway restart

# 5. Watch logs for startup
railway logs --follow
```

Look for:
- ✅ "Prisma database connection established"
- ✅ "Railway Server running on port 3000"
- ❌ Any error messages

---

## 📝 What to Report Back

After running diagnostics, share:

1. **Health check result** (from api-test.html)
   - Server UP or DOWN?
   
2. **API test result** (from api-test.html)
   - What error appears?
   - Any error messages?

3. **Railway logs** (from `railway logs`)
   - Any "❌" error messages?
   - What's the last successful message?

4. **Environment check**
   - Is DATABASE_URL set? (from `railway vars`)
   - Does it start with "postgresql://"?

---

## 💡 If All Else Fails

### Nuclear Option: Recreate Database
```bash
# ⚠️ WARNING: This will DELETE ALL DATA

# 1. In Railway dashboard, delete database
# 2. Create new PostgreSQL database
# 3. Copy new DATABASE_URL
# 4. Set it:
railway variables set DATABASE_URL="<new_url>"

# 5. Run migrations:
npx prisma migrate deploy

# 6. Seed database:
npm run seed  # or your seed command

# 7. Restart
railway restart
```

---

## ✅ Success Indicators

You'll know it's fixed when:
- Health check returns 200 ✅
- API test shows 401 (auth required) ✅
- Logs show "Prisma database connection established" ✅
- Frontend loads and displays data ✅

---

## 📞 Next Steps

1. Run diagnostic tool: `open diagnostics/api-test.html`
2. Share screenshot of results
3. Run `railway logs --tail 100` and share output
4. I'll help pinpoint exact issue

**The frontend is working fine - we just need to fix the backend!** 🎯
