# Deployment Safety Tests

This document describes the pre-deployment safety tests that ensure deployments do not accidentally change or connect to the wrong database.

## Overview

The deployment safety test suite (`tests/deployment-safety-test.js`) runs automatically before every deployment via `npm run deploy` or `deploy-production.sh`. These tests prevent:

- ❌ Connecting to the wrong database (localhost in production)
- ❌ Database schema changes that could cause data loss
- ❌ Dangerous file/process operations
- ❌ Missing environment variables
- ❌ Hardcoded credentials in deployment scripts

## Database Connection Validation Test

The most important test for preventing database connection issues is the **Database Connection Validation Test** (`testDatabaseConnectionValidation`).

### What It Checks

1. **DATABASE_URL is set** - Verifies the environment variable exists
2. **Production database validation** - In production environments:
   - Blocks localhost/local file connections (`localhost`, `127.0.0.1`, `file:./prisma/dev.db`)
   - Requires DigitalOcean database host pattern (`.db.ondigitalocean.com`)
3. **`.env.local` override check** - Prevents `.env.local` from overriding DATABASE_URL with localhost in production
4. **Database connection** - Actually connects to the database to verify it's accessible
5. **Database contains data** - Verifies the database is not empty (prevents connecting to wrong/empty database)
6. **Client records check** - Specifically checks for client records to ensure data integrity

### Example Test Output

```
🗄️  Testing Database Connection Validation (CRITICAL)...
✅ [PASS] DATABASE_URL Set: Database URL configured (postgresql://doadmin:...)
✅ [PASS] Production Database URL: DATABASE_URL points to DigitalOcean database
❌ [FAIL] .env.local Override: .env.local is overriding DATABASE_URL with localhost in production
```

### When Tests Block Deployment

The test will **block deployment** (exit code 1) if:

- DATABASE_URL is not set
- DATABASE_URL points to localhost in production
- DATABASE_URL doesn't match DigitalOcean host pattern in production
- `.env.local` overrides DATABASE_URL with localhost in production
- Database connection fails
- Database is empty (0 users, 0 clients) in production

### Running Tests Manually

```bash
# Run all safety tests
npm run test:safety

# Run with production environment
NODE_ENV=production APP_URL=https://abcoafrica.co.za npm run test:safety

# Skip database tests (for local development)
DEV_LOCAL_NO_DB=true npm run test:safety
```

## Other Safety Tests

### 1. Dangerous File Operations
- Checks for `rm -rf`, `rm -r`, and other dangerous file deletion operations
- Focuses on `deploy-production.sh` for critical checks
- Legacy scripts are flagged as warnings only

### 2. Dangerous Database Operations
- Checks for `prisma db push --accept-data-loss`, `DROP TABLE`, `TRUNCATE`, etc.
- Focuses on `deploy-production.sh` for critical checks
- Requires backup procedures for destructive operations

### 3. Dangerous Process Operations
- Checks for `pm2 delete`, `killall node`, `shutdown`, etc.
- Focuses on `deploy-production.sh` for critical checks

### 4. Environment Variable Safety
- Verifies required env vars are set (`DATABASE_URL`, `JWT_SECRET`)
- Checks for hardcoded credentials in scripts

### 5. Backup Procedures
- Verifies backup scripts exist
- Checks that destructive operations have backup procedures

### 6. Safe Migration Wrapper
- Ensures database migrations use safe wrapper scripts

## Test Configuration

### Legacy Scripts

The test suite distinguishes between:
- **Main deployment script** (`deploy-production.sh`) - Critical failures block deployment
- **Legacy scripts** (old fix/migrate scripts) - Warnings only, don't block deployment

Legacy scripts are automatically detected by patterns like:
- `apply-*`, `migrate-*`, `fix-*`
- `deploy-*-fix`, `deploy-*-migration`
- `setup-*`

### Production Detection

The test detects production environment when:
- `NODE_ENV=production`
- `APP_URL` contains `abcoafrica.co.za`
- `APP_URL` contains `https://`

## Fixing Test Failures

### If DATABASE_URL points to localhost:

1. **Check `.env.local` file:**
   ```bash
   cat .env.local | grep DATABASE_URL
   ```

2. **Delete or fix `.env.local`:**
   ```bash
   # Remove localhost override
   rm .env.local
   # OR update it with correct database URL
   ```

3. **Verify `.env` file has correct DATABASE_URL:**
   ```bash
   cat .env | grep DATABASE_URL
   ```

### If database connection fails:

1. **Check DATABASE_URL format:**
   ```bash
   echo $DATABASE_URL
   ```

2. **Test connection manually:**
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1;"
   ```

3. **Verify database credentials and host are correct**

### If database is empty:

1. **Verify you're connecting to the correct database:**
   ```bash
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"User\";"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Client\";"
   ```

2. **Check if you need to restore from backup**

## Integration with Deployment

The safety tests are automatically run:

1. **Before deployment** - Via `npm run predeploy` (which runs `test:safety`)
2. **In deployment script** - `deploy-production.sh` runs tests before deploying
3. **Can be skipped** - Set `SKIP_SAFETY_TESTS=true` (not recommended)

## Best Practices

1. **Always run tests before deploying** - Don't skip safety tests
2. **Fix `.env.local` issues** - Remove or fix localhost overrides
3. **Use environment variables** - Never hardcode database URLs
4. **Verify database connection** - Test connection before deploying
5. **Check test output** - Review warnings even if tests pass

## Troubleshooting

### Test fails but DATABASE_URL looks correct:

1. Check if `.env.local` is overriding it
2. Verify `NODE_ENV` and `APP_URL` are set correctly
3. Check if database is actually accessible from test environment

### Legacy scripts causing warnings:

- These are warnings only and won't block deployment
- Consider removing or updating legacy scripts if they're not needed

### Test timeout:

- Database connection test may timeout if database is unreachable
- Check network connectivity and firewall rules
