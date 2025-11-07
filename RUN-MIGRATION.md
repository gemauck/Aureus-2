# 🚀 Run Leave Platform Database Migration

## Current Status
- ✅ Code deployed to production
- ✅ Leave Platform component loaded and accessible
- ⚠️ **Database migration pending** (connection slots full)

## Migration Required
The Leave Platform database tables need to be created before the platform will be fully functional.

## When to Run
Run the migration when database connection slots are available. The database is currently at capacity.

## How to Run Migration

### Option 1: Prisma Migration (Recommended)

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
npx prisma db push --accept-data-loss --skip-generate
```

### Option 2: SQL Script

The SQL migration script is already on the server at:
`/var/www/abcotronics-erp/migrate-leave-platform.sql`

To run it:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
psql $DATABASE_URL -f migrate-leave-platform.sql
```

### Option 3: Automated Retry Script

A retry script is available locally:

```bash
./run-migration-when-ready.sh
```

This will automatically retry the migration every 30 seconds for up to 10 attempts.

## Verify Migration Success

After running the migration, verify the tables were created:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
npx prisma studio
```

Or check via SQL:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%Leave%' OR table_name LIKE '%Birthday%') ORDER BY table_name;"
```

You should see:
- `LeaveApplication`
- `LeaveBalance`
- `LeaveApprover`
- `Birthday`

## Troubleshooting

### Connection Slots Full
If you see "connection slots are reserved", wait a few minutes and try again. Connection slots free up as active queries complete.

### Tables Already Exist
If you get an error that tables already exist, that's fine - the migration is idempotent and will skip existing tables.

### Migration Fails
If the migration fails with a non-connection error, check:
1. Database credentials in `.env` file
2. Database permissions for the user
3. Network connectivity to the database

## After Migration

Once the migration completes:

1. ✅ Leave Platform will be fully functional
2. ✅ Users can create leave applications
3. ✅ Leave balances can be imported
4. ✅ Approvers can be configured
5. ✅ Birthdays can be added
6. ✅ Daily email notifications will work
7. ✅ Calendar view will show leave data

## Current Status

**Leave Platform**: 🟡 Partially Ready
- UI accessible: ✅
- Component loading: ✅
- Database tables: ⚠️ Pending migration

---

**Next Step**: Run the migration when connection slots are available.

