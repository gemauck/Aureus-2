# 500 Error Diagnosis and Fix

## Problem Confirmed
All API endpoints are returning 500 errors with the message:
**"Database connection failed. The database server is unreachable."**

This indicates a **database connectivity issue**, not a code problem.

## Changes Made

### 1. Enhanced Error Logging (`server.js`)
- Added detailed error logging with error name, code, and stack traces
- Added handler path logging to track which handler is being loaded
- Improved timeout and response handling

### 2. Fixed Async Error Handling (`api/_lib/authRequired.js`)
- Now properly awaits handler promises to catch async errors
- Added better error logging

### 3. Improved Logging (`api/_lib/logger.js`)
- Enhanced error logging with full error details

### 4. Created Diagnostic Endpoint (`api/test-db-connection.js`)
- Tests database connectivity step-by-step
- Access at: `/api/test-db-connection`

## Next Steps to Fix

### Step 1: Check Server Logs
After deploying the changes, check your server logs for detailed error messages. You should see:
- Which handler is being loaded
- The exact database error message
- Error codes (P1001, P1002, etc.)
- Full stack traces

### Step 2: Test Database Connection
Use the diagnostic endpoint to test connectivity:

```bash
# Get your auth token first, then:
curl https://abcoafrica.co.za/api/test-db-connection \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Or test from browser console:
```javascript
fetch('/api/test-db-connection', {
  headers: {
    'Authorization': `Bearer ${window.storage.getToken()}`
  }
}).then(r => r.json()).then(console.log)
```

### Step 3: Verify Environment Variables
Check that these are set correctly on your server:
- `DATABASE_URL` - Must be a valid PostgreSQL connection string
- `JWT_SECRET` - Must be set

### Step 4: Check Database Server
1. **Is the database server running?**
2. **Is it accessible from your application server?**
3. **Are firewall rules allowing connections?**
4. **Are credentials correct?**

### Step 5: Common Database Connection Issues

#### Railway/Cloud Database
- Check if database service is running
- Verify connection string format
- Check if IP whitelist includes your app server
- Verify SSL requirements

#### Local Database
- Ensure PostgreSQL is running: `pg_isready`
- Check connection: `psql $DATABASE_URL`
- Verify port is open and accessible

## Expected Error Codes

If you see these Prisma error codes, they indicate:
- `P1001` - Can't reach database server
- `P1002` - Database server not reachable  
- `P1008` - Operations timed out
- `P1017` - Server closed the connection
- `ETIMEDOUT` - Connection timeout
- `ECONNREFUSED` - Connection refused
- `ENOTFOUND` - DNS/hostname not found

## Quick Fix Checklist

- [ ] Check server logs for detailed error messages
- [ ] Verify `DATABASE_URL` environment variable is set
- [ ] Test database connection using diagnostic endpoint
- [ ] Verify database server is running and accessible
- [ ] Check network connectivity and firewall rules
- [ ] Verify database credentials are correct
- [ ] Check if database service needs to be restarted

## After Fixing Database Connection

Once the database connection is restored:
1. All API endpoints should work normally
2. Error logs will show successful connections
3. The diagnostic endpoint will return success status

