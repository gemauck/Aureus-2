# User Schema Migration Fix

## Problem

The production application was returning a 500 error when trying to fetch users:

```
GET http://165.22.127.196:3000/api/users 500 (Internal Server Error)
```

The error details showed:
```
Invalid `prisma.user.findMany()` invocation:
The column `main.User.department` does not exist in the current database.
```

## Root Cause

The production database was missing several columns on the `User` table that were defined in the Prisma schema but had never been added to the actual database. This is a schema mismatch between the Prisma schema definition and the database schema.

Missing columns included:
- `department`
- `jobTitle`
- `phone`
- `avatar`
- `mustChangePassword`
- `employeeNumber`
- `position`
- `employmentDate`
- `idNumber`
- `taxNumber`
- `bankName`
- `accountNumber`
- `branchCode`
- `salary`
- `employmentStatus`
- `address`
- `emergencyContact`

## Solution

### For Local Development

The fix has been applied to your local database. The User table now includes all required columns.

### For Production Deployment

To fix the production database, you need to apply the migration:

**Option 1: Use the automated script**
```bash
./apply-user-schema-migration.sh
```

**Option 2: Manual deployment**
1. Copy the migration file to the production server:
   ```bash
   scp migrate-user-schema.sql root@165.22.127.196:/var/www/abcotronics-erp/
   ```

2. SSH into the production server and apply the migration:
   ```bash
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   sqlite3 prisma/dev.db < migrate-user-schema.sql
   npx prisma generate
   pm2 restart abcotronics-erp
   ```

**Option 3: Use Prisma commands**
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
npx prisma db push
npx prisma generate
pm2 restart abcotronics-erp
```

## Files Created

1. `migrate-user-schema.sql` - SQL migration script to add missing columns
2. `apply-user-schema-migration.sh` - Automated deployment script
3. `USER-SCHEMA-FIX.md` - This documentation

## Verification

After applying the migration, the `/api/users` endpoint should work correctly without errors. You can verify by:

1. Checking the browser console - the 500 error should be gone
2. Checking the Users page in the application
3. Running the following to check the schema:
   ```bash
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   sqlite3 prisma/dev.db ".schema User"
   ```

## Prevention

To prevent this issue in the future:

1. Always run migrations locally before deploying
2. Use `npx prisma migrate deploy` for production deployments
3. Set up a proper migration tracking system (the `_prisma_migrations` table)
4. Test schema changes in a staging environment before production

## Status

- ✅ Local database fixed
- ⏳ Production database needs migration (use one of the options above)

