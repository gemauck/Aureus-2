# 🔄 Meeting Notes Migration - Retry Instructions

## Current Situation

**Status**: Code deployed ✅ | Database migration pending ⚠️

The database connection slots are currently full, preventing the migration from completing. This is a temporary issue that typically resolves within 5-15 minutes.

## What's Deployed

✅ All code files are on the production server
✅ Prisma client is generated
✅ Application has been restarted
✅ API endpoint is available at `/api/meeting-notes`

## What's Missing

❌ Database tables haven't been created yet
❌ Migration needs to complete when connection slots free up

## How to Retry Migration

### Option 1: Automated Retry Script

```bash
./retry-meeting-notes-migration.sh
```

This will automatically retry up to 10 times with 30-second delays.

### Option 2: Manual Retry (Recommended)

Wait 5-10 minutes, then SSH into the server:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
npx prisma db push --skip-generate
pm2 restart abcotronics-erp
```

### Option 3: Check Connection Slots First

Before retrying, check if slots are available:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp

# This will fail if slots are full, but gives us info
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;" 2>&1
```

If you get connection errors, wait a bit longer and retry.

## Verify Migration Success

After migration completes, verify tables exist:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%Meeting%' ORDER BY table_name;"
```

You should see:
- MonthlyMeetingNotes
- WeeklyMeetingNotes
- DepartmentNotes
- MeetingActionItem
- MeetingComment
- MeetingUserAllocation

## Why Connection Slots Are Full

DigitalOcean databases have a limit on concurrent connections. When:
- Multiple applications are connected
- Long-running queries are active
- Connection pooling isn't configured properly
- Idle connections aren't being closed

The database can reach its connection limit.

## Solutions

### Short-term
- Wait 5-15 minutes for connections to naturally close
- Retry the migration

### Long-term (if this happens frequently)
1. **Configure connection pooling** (PgBouncer)
2. **Reduce connection pool size** in application
3. **Close idle connections** more aggressively
4. **Upgrade database plan** for more connections

## Testing After Migration

Once migration succeeds:

1. Go to: **https://abcoafrica.co.za**
2. Navigate: **Teams → Management → Meeting Notes**
3. Test:
   - Create monthly notes
   - Add weekly notes
   - Fill department notes
   - Allocate users
   - Create action items
   - Add comments

## Current Status Summary

| Component | Status |
|-----------|--------|
| Code Files | ✅ Deployed |
| Prisma Client | ✅ Generated |
| Database Backup | ✅ Created |
| Database Tables | ⏳ Pending |
| Application | ✅ Running |
| Migration | ⏳ Waiting for connection slots |

## Next Action

**Wait 5-10 minutes, then run:**
```bash
./retry-meeting-notes-migration.sh
```

Or manually:
```bash
ssh root@abcoafrica.co.za 'cd /var/www/abcotronics-erp && npx prisma db push --skip-generate && pm2 restart abcotronics-erp'
```

---

**Last Updated**: November 7, 2025
**Estimated Time to Retry**: 5-15 minutes

