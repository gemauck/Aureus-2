# Ticket Table Migration

## Issue
The helpdesk API is returning `500 Internal Server Error` with the message:
```
Error: Ticket table not found
```

This occurs because the `Ticket` table hasn't been created in the database yet, even though the Prisma schema defines the `Ticket` model.

## Solution

### Option 1: Run the Migration Script (Recommended)
```bash
./apply-ticket-table-migration.sh
```

This script will:
1. Try to run `npx prisma migrate deploy` (recommended for production)
2. If that fails, fall back to manual SQL migration
3. Regenerate Prisma client

### Option 2: Manual Prisma Migration
```bash
npx prisma migrate deploy
```

### Option 3: Manual SQL Migration
If database connections are limited, you can run the SQL file directly:

```bash
psql $DATABASE_URL -f prisma/migrations/manual_add_ticket_table.sql
```

Or via your database admin tool (pgAdmin, DBeaver, TablePlus, etc.):
1. Connect to your database
2. Open `prisma/migrations/manual_add_ticket_table.sql`
3. Copy and execute the SQL

### Option 4: Using Prisma Studio or Database Admin Tool
1. Connect to your database
2. Run the SQL from `prisma/migrations/manual_add_ticket_table.sql`
3. Regenerate Prisma client: `npx prisma generate`

## Verification

After running the migration, verify the table exists:

```sql
-- Check if Ticket table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'Ticket';

-- Check table structure
\d "Ticket"
```

Or test the API:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://abcoafrica.co.za/api/helpdesk
```

This should return an empty array `{"tickets": [], "pagination": {...}}` instead of an error.

## Files Created

- `prisma/migrations/manual_add_ticket_table.sql` - Manual SQL migration
- `apply-ticket-table-migration.sh` - Automated migration script
- `TICKET-TABLE-MIGRATION.md` - This documentation

## Notes

- The migration is safe and won't delete any existing data
- If the table already exists, the migration will skip creating it (uses `IF NOT EXISTS`)
- All foreign key constraints and indexes will be created automatically
- After migration, restart your application server if needed






