# 502 Bad Gateway Error - Fix Instructions

## Summary

Your production server at https://abcoafrica.co.za is experiencing 502 Bad Gateway errors because the database schema is out of sync with the Prisma schema. The restored 10 PM backup database is missing the `accessibleProjectIds` column in the `User` table.

## Root Cause

1. **Database restored** from 10 PM backup
2. **Schema mismatch**: The restored database doesn't have `accessibleProjectIds` column
3. **Application errors**: Prisma queries fail when trying to access this column
4. **502 errors**: Intermittent failures when the app restarts or requests fail

## Quick Fix

SSH into your production server and run this command:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp

# Add the missing column
node -e "
import('dotenv/config').then(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    await prisma.\$executeRawUnsafe('ALTER TABLE \"User\" ADD COLUMN IF NOT EXISTS \"accessibleProjectIds\" TEXT NOT NULL DEFAULT \\'[]\\';');
    console.log('✅ Column added successfully');
    
    const result = await prisma.\$queryRawUnsafe('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \\'User\\' AND column_name = \\'accessibleProjectIds\\';');
    console.log('✅ Verified:', result);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
});
"

# Regenerate Prisma client
npx prisma generate

# Restart the app
pm2 restart abcotronics-erp

# Check logs
pm2 logs abcotronics-erp --lines 50
```

## Verification

After running the fix, check:

```bash
# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs abcotronics-erp | grep -i "error\|accessibleProjectIds" | tail -20

# Test the application
curl http://localhost:3000/health
```

## Expected Outcome

After the fix:
- ✅ No more "accessibleProjectIds does not exist" errors
- ✅ Application responds without 502 errors
- ✅ All API endpoints work correctly
- ✅ Database schema matches Prisma schema

## Prevention

To prevent this in the future:

1. **Always run migrations** after restoring a database
2. **Check schema alignment** before deploying
3. **Use Prisma migrations** instead of direct SQL when possible

---

**Date**: November 3, 2025  
**Status**: Ready to deploy

