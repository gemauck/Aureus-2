# Tags System - Deployment Guide

## ✅ Step 1: Prisma Client Generated

The Prisma client has been successfully generated with the new Tag and ClientTag models.

## 📋 Deployment Steps

### Option A: Production Server (Recommended)

If you're deploying to a server where `DATABASE_URL` is already configured:

```bash
# SSH into your server
ssh root@your-server-ip

# Navigate to project directory
cd /var/www/abcotronics-erp

# Pull latest code (if using git)
git pull origin main

# Generate Prisma client (if not already done)
npx prisma generate

# Apply migration
npx prisma migrate deploy

# Restart server
pm2 restart abcotronics-erp
# OR
systemctl restart your-app-service
```

### Option B: Local Development

If you have `DATABASE_URL` set locally:

```bash
# Generate Prisma client (already done ✅)
# npx prisma generate

# Create and apply migration
npx prisma migrate dev --name add_tags_system

# Or use db push for quick development
npx prisma db push
```

### Option C: Manual SQL Migration

If automatic migrations don't work, use the manual SQL:

```bash
# Connect to your database and run:
psql $DATABASE_URL < prisma/migrations/MANUAL_TAG_MIGRATION.sql

# Or via psql directly:
psql -h your-host -U your-user -d your-database -f prisma/migrations/MANUAL_TAG_MIGRATION.sql
```

## 🔍 Verification Steps

### 1. Check Database Tables
```sql
-- Check if Tag table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'Tag';

-- Check if ClientTag table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'ClientTag';

-- Check table structure
\d "Tag"
\d "ClientTag"
```

### 2. Test API Endpoints

```bash
# Get auth token first, then:

# List tags (should return empty array initially)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/tags

# Create a test tag
curl -X POST http://localhost:3000/api/tags \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Tag","color":"#FF5733"}'

# Get tags for a client
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/clients/CLIENT_ID/tags
```

### 3. Test UI

1. Start your server
2. Open the app in browser
3. Navigate to any Client or Lead
4. Go to Overview tab
5. Scroll to Tags section
6. Try creating and assigning tags

## 🚨 Troubleshooting

### Migration Fails

**Error: "relation already exists"**
- Tables might already exist from a previous attempt
- Solution: Drop tables first (BACKUP FIRST!):
  ```sql
  DROP TABLE IF EXISTS "ClientTag";
  DROP TABLE IF EXISTS "Tag";
  ```
  Then re-run migration

**Error: "DATABASE_URL not set"**
- Set DATABASE_URL environment variable
- Or use manual SQL migration

**Error: "Foreign key constraint"**
- Ensure Client table exists
- Check that client IDs in ClientTag reference valid clients

### Prisma Client Errors

**Error: "Cannot find module @prisma/client"**
```bash
npm install
npx prisma generate
```

**Error: "Unknown argument" in queries**
```bash
# Regenerate Prisma client
npx prisma generate

# Restart server
```

### API Errors

**404 on `/api/tags`**
- Check server.js has route registered
- Verify file exists: `api/tags.js`
- Restart server

**401 Unauthorized**
- Check authentication token
- Verify authRequired middleware is working

## ✅ Success Indicators

You'll know it's working when:

1. ✅ `npx prisma generate` completes without errors
2. ✅ Migration completes successfully
3. ✅ Server starts without errors
4. ✅ `GET /api/tags` returns 200 (empty array or tags)
5. ✅ UI shows Tags section in Client/Lead modals
6. ✅ Can create tags via UI
7. ✅ Tags persist after page refresh

## 📝 Post-Deployment Checklist

- [ ] Database tables created (Tag, ClientTag)
- [ ] Prisma client regenerated
- [ ] Server restarted
- [ ] API endpoints responding
- [ ] UI displaying tags section
- [ ] Can create tags
- [ ] Can assign tags
- [ ] Tags persist correctly
- [ ] No console errors
- [ ] No server errors in logs

## 🎉 You're Done!

Once verification passes, the tags system is fully operational!

## Next Steps

- Start using tags in your workflow
- Create common tags for your organization
- Assign tags to existing clients/leads
- Train team on tag usage

