# Database Connection Issue - Troubleshooting Guide

## Current Status
All API endpoints returning 500 errors - **Database connection failure**

## Quick Start (Do This First)

From the project root, test the database connection directly (no server or browser needed):

```bash
npm run db:test
```

Or:

```bash
node test-db-connection-script.js
```

The script reports whether `DATABASE_URL` is set and whether it can reach PostgreSQL. It also suggests fixes for common Prisma codes (`P1001`, `P1002`, `ECONNREFUSED`, etc.).

**If you need to run the app without a database** (e.g. UI-only work):

```bash
DEV_LOCAL_NO_DB=true npm run dev:backend
```

API calls will still fail, but the frontend can load.

---

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
Run this in your browser console while the app is open (no auth required):

```javascript
fetch('/api/test-db-connection')
  .then(r => r.json())
  .then(data => {
    console.log('Database Test Result:', data);
    if (data.error) console.error('Error:', data.error);
  })
  .catch(err => console.error('Request failed:', err));
```

Same logic is available at `/api/db-health`. Both return `{ status: 'healthy', ... }` when the DB is reachable, or error details when it is not.

### Step 3: Verify Environment Variables

**Quick check**: Run `npm run db:test` from the project root; it will say if `DATABASE_URL` is missing.

#### Check DATABASE_URL is set:
Ensure `.env` or `.env.local` (in the project root) contains:
```
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
```

The server loads `.env` first, then overrides with `.env.local` in development.

#### Common Issues:
1. **Missing DATABASE_URL** - Variable not set in environment
2. **Wrong format** - Connection string malformed
3. **Database server down** - PostgreSQL not running
4. **Network blocked** - Firewall blocking connection
5. **Wrong credentials** - Username/password incorrect
6. **SSL required** - Need `?sslmode=require` in connection string

### Step 4: Quick Database Connection Test

**From your machine** (project root, with `DATABASE_URL` in `.env`):

```bash
npm run db:test
```

**With psql** (if installed and `DATABASE_URL` is set):

```bash
# Load .env and test PostgreSQL
source .env 2>/dev/null || export $(grep -v '^#' .env | xargs)
psql "$DATABASE_URL" -c "SELECT 1;"
```

**If you have SSH access to the server**:

```bash
psql $DATABASE_URL -c "SELECT 1;"
# Or with explicit params:
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

## Related Scripts and Endpoints

| Script or endpoint | Purpose |
|--------------------|---------|
| `npm run db:test` | Test DB from terminal (uses `.env` in project root even if run from another directory) |
| `GET /api/test-db-connection` | Same as `/api/db-health`; no auth. Use in browser console or curl to test DB. |
| `GET /api/db-health` | Returns `{ status: 'healthy', ... }` or error details when DB is unreachable. |
| `npm run db:studio` | Open Prisma Studio (requires working `DATABASE_URL`) |
| `ensure-client-site-stage-aida.sql` | Add `siteLead`/`stage`/`aidaStatus` to `ClientSite` if missing; run with `psql "$DATABASE_URL" -f ensure-client-site-stage-aida.sql` |

## Need More Help?

Share the output of `npm run db:test` or the server log error message to diagnose the specific issue.

