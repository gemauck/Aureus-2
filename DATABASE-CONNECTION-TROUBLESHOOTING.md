# Database Connection Issue - Troubleshooting Guide

## Current Status
All API endpoints returning 500 errors - **Database connection failure**

## Immediate Actions Required

### Step 1: Check Server Logs
**This is the most important step** - The server logs will show the exact error.

#### If using Railway:
1. Go to Railway dashboard
2. Click on your project
3. Click on "Deployments" or "Logs"
4. Look for error messages containing:
   - `PrismaClientInitializationError`
   - `Can't reach database server`
   - `P1001`, `P1002`, `P1008` (Prisma error codes)
   - `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`

#### If using PM2 locally:
```bash
pm2 logs
# or
pm2 logs --lines 100
```

#### If using Node directly:
Check the terminal where you ran `node server.js` or `npm start`

### Step 2: Test Database Connection
Run this in your browser console to test the diagnostic endpoint:

```javascript
fetch('/api/test-db-connection', {
  headers: {
    'Authorization': `Bearer ${window.storage.getToken()}`
  }
})
.then(r => r.json())
.then(data => {
  console.log('Database Test Result:', data);
  if (data.error) {
    console.error('Error:', data.error);
  }
})
.catch(err => console.error('Request failed:', err));
```

### Step 3: Verify Environment Variables

#### Check DATABASE_URL is set:
The connection string should look like:
```
postgresql://user:password@host:port/database?sslmode=require
```

#### Common Issues:
1. **Missing DATABASE_URL** - Variable not set in environment
2. **Wrong format** - Connection string malformed
3. **Database server down** - PostgreSQL not running
4. **Network blocked** - Firewall blocking connection
5. **Wrong credentials** - Username/password incorrect
6. **SSL required** - Need `?sslmode=require` in connection string

### Step 4: Quick Database Connection Test

If you have SSH access to your server:

```bash
# Test if PostgreSQL is accessible
psql $DATABASE_URL -c "SELECT 1;"

# Or test connection manually
psql -h YOUR_HOST -U YOUR_USER -d YOUR_DATABASE -c "SELECT version();"
```

### Step 5: Check Database Service Status

#### Railway:
- Go to Railway dashboard
- Check if PostgreSQL service is running
- Check if it's paused or stopped

#### Local PostgreSQL:
```bash
# Check if PostgreSQL is running
pg_isready

# Or check service status
sudo systemctl status postgresql
# or
brew services list | grep postgres
```

## Common Error Codes and Solutions

### P1001 - Can't reach database server
- **Cause**: Database server is not running or unreachable
- **Fix**: Start database service, check network connectivity

### P1002 - Database server not reachable
- **Cause**: Network/firewall blocking connection
- **Fix**: Check firewall rules, verify host/port

### P1008 - Operations timed out
- **Cause**: Database server too slow or overloaded
- **Fix**: Check database performance, increase timeout

### ECONNREFUSED
- **Cause**: Connection refused by database server
- **Fix**: Verify database is running and accepting connections

### ETIMEDOUT
- **Cause**: Connection timeout
- **Fix**: Check network, verify host/port, check firewall

## Next Steps After Finding Error

1. **If DATABASE_URL is missing**: Set it in your environment variables
2. **If database is down**: Start/restart the database service
3. **If connection string is wrong**: Fix the DATABASE_URL format
4. **If network is blocked**: Update firewall rules
5. **If credentials are wrong**: Update username/password in DATABASE_URL

## After Fixing

1. Restart your application server
2. Test the diagnostic endpoint again
3. Check that API endpoints start working
4. Monitor logs to ensure no new errors

## Need More Help?

Share the server log error message and I can help diagnose the specific issue.

