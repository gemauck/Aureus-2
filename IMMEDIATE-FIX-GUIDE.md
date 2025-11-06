# 🚨 IMMEDIATE FIX - Database Connection Issue

## The Problem
**ALL API endpoints are returning 500 errors** because the database cannot be reached.

## ⚡ IMMEDIATE STEPS (Do These Now)

### Step 1: Test Database Connection Locally
Run this command in your terminal:

```bash
node test-db-connection-script.js
```

This will tell you EXACTLY what's wrong with the database connection.

### Step 2: Check Your Server Logs
**This is CRITICAL** - The server logs will show the exact error.

#### If using Railway:
1. Go to https://railway.app
2. Click your project
3. Click "Deployments" → Latest deployment → "View Logs"
4. Look for errors with:
   - `P1001` - Can't reach database server
   - `P1002` - Database server not reachable  
   - `ECONNREFUSED` - Connection refused
   - `ETIMEDOUT` - Connection timeout
   - `ENOTFOUND` - Hostname not found

#### If using PM2:
```bash
pm2 logs --lines 50
```

### Step 3: Check DATABASE_URL Environment Variable

**This is likely the issue!** The DATABASE_URL might be:
- ❌ Not set
- ❌ Wrong format
- ❌ Pointing to wrong database
- ❌ Using wrong credentials

#### Check if DATABASE_URL is set:
```bash
# On your server, run:
echo $DATABASE_URL

# Or check Railway dashboard:
# Settings → Variables → DATABASE_URL
```

#### DATABASE_URL should look like:
```
postgresql://username:password@host:port/database?sslmode=require
```

### Step 4: Verify Database Service is Running

#### Railway:
- Go to Railway dashboard
- Check if PostgreSQL service exists
- Check if it's running (not paused/stopped)
- If paused, click "Resume"

#### Local PostgreSQL:
```bash
# Check if PostgreSQL is running
pg_isready

# If not running, start it:
# macOS:
brew services start postgresql

# Linux:
sudo systemctl start postgresql
```

## 🔍 Common Issues & Quick Fixes

### Issue 1: DATABASE_URL Not Set
**Symptom**: Error says "DATABASE_URL is not set"  
**Fix**: Set DATABASE_URL in Railway dashboard or .env file

### Issue 2: Database Service Paused/Stopped
**Symptom**: Connection timeout or refused  
**Fix**: Resume/restart database service in Railway

### Issue 3: Wrong Connection String Format
**Symptom**: ENOTFOUND or connection refused  
**Fix**: Verify DATABASE_URL format matches: `postgresql://user:pass@host:port/db`

### Issue 4: SSL Required
**Symptom**: Connection fails silently  
**Fix**: Add `?sslmode=require` to DATABASE_URL

### Issue 5: Wrong Credentials
**Symptom**: Authentication failed  
**Fix**: Update username/password in DATABASE_URL

## 🎯 Quick Test Commands

### Test from Browser Console:
```javascript
// Test database connection endpoint
fetch('/api/test-db-connection', {
  headers: {
    'Authorization': `Bearer ${window.storage.getToken()}`
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error)

// Test health endpoint (no auth required)
fetch('/health')
.then(r => r.json())
.then(console.log)
```

### Test from Terminal:
```bash
# Test database connection script
node test-db-connection-script.js

# Test health endpoint
curl https://abcoafrica.co.za/health
```

## 📋 Checklist

- [ ] Ran `node test-db-connection-script.js` locally
- [ ] Checked Railway/server logs for error messages
- [ ] Verified DATABASE_URL is set in environment variables
- [ ] Verified DATABASE_URL format is correct
- [ ] Checked if database service is running
- [ ] Tested `/health` endpoint
- [ ] Tested `/api/test-db-connection` endpoint

## 🆘 Still Not Working?

Share these details:
1. Output from `node test-db-connection-script.js`
2. Error messages from server logs
3. DATABASE_URL format (hide password): `postgresql://user:***@host:port/db`
4. Whether database service is running

## ✅ After Fixing

1. Restart your application server
2. Test `/health` endpoint - should show `"database": "connected"`
3. Test any API endpoint - should return data, not 500 error
4. Check browser console - errors should stop

---

**Remember**: The database connection MUST work before any API endpoints will work. This is a database issue, not a code issue.

