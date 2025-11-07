# Run Migration Manually

## ⚠️ Database Connection Issue

The automatic migration cannot run due to database connection limits. Here's how to run it manually:

## Option 1: Using psql (Recommended)

If you have `psql` installed and database access:

```bash
# Run the manual migration SQL file
psql $DATABASE_URL -f prisma/migrations/manual_add_user_task_management.sql
```

Or with explicit connection string:

```bash
psql "postgresql://user:password@host:port/database" -f prisma/migrations/manual_add_user_task_management.sql
```

## Option 2: Using Database Admin Tool

1. Open your database admin tool (pgAdmin, DBeaver, TablePlus, etc.)
2. Connect to your database
3. Open the file: `prisma/migrations/manual_add_user_task_management.sql`
4. Execute the SQL script

## Option 3: Copy SQL Directly

Copy the contents of `prisma/migrations/manual_add_user_task_management.sql` and paste into your database query tool, then execute.

## Option 4: Run on Server

If you have SSH access to your production server:

```bash
# SSH into server
ssh your-server

# Navigate to project
cd /path/to/project

# Run migration
npx prisma migrate deploy
```

## Verify Migration Success

After running the migration, verify the tables were created:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('UserTask', 'UserTaskTag', 'UserTaskTagRelation');

-- Should return 3 rows
```

## Next Steps After Migration

1. **Restart Server**
   ```bash
   npm start
   # or
   pm2 restart your-app
   ```

2. **Test the Feature**
   - Navigate to Dashboard
   - Task Management should appear below Calendar
   - Create a test task

3. **Verify API Endpoints**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/user-tasks
   ```

## Troubleshooting

### If tables already exist
The SQL uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times.

### If foreign key errors
Make sure the `User` table exists and has the correct structure.

### If index errors
The SQL uses `CREATE INDEX IF NOT EXISTS`, so duplicate indexes won't cause errors.

## Migration File Location

The manual migration SQL is located at:
```
prisma/migrations/manual_add_user_task_management.sql
```

---

**Note**: Once the migration is complete, the task management system will be fully functional!

