# 📋 Meeting Notes Platform - Deployment Guide

## Overview
This guide covers deploying the new Management Meeting Notes platform, which includes monthly goals, weekly department notes, action items, comments, and user allocations.

## ✅ Pre-Deployment Checklist

- [x] Database models added to `prisma/schema.prisma`
- [x] API endpoints created at `/api/meeting-notes.js`
- [x] Frontend component updated (`ManagementMeetingNotes.jsx`)
- [x] Database API methods added to `databaseAPI.js`
- [x] Component integrated into Teams section

## 🗄️ Database Migration

### Step 1: Generate Prisma Client

```bash
# On local machine or server
npx prisma generate
```

This generates the Prisma client with the new meeting notes models:
- `MonthlyMeetingNotes`
- `WeeklyMeetingNotes`
- `DepartmentNotes`
- `MeetingActionItem`
- `MeetingComment`
- `MeetingUserAllocation`

### Step 2: Create Migration

**Option A: Development (with migration history)**
```bash
npx prisma migrate dev --name add_meeting_notes
```

**Option B: Production (apply existing migrations)**
```bash
npx prisma migrate deploy
```

**Option C: Quick Push (development only, no migration history)**
```bash
npx prisma db push
```

### Step 3: Verify Migration

Check that all tables were created:

```bash
# Using Prisma Studio
npx prisma studio

# Or via SQL
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%Meeting%' OR table_name LIKE '%UserTask%' ORDER BY table_name;"
```

You should see:
- `MonthlyMeetingNotes`
- `WeeklyMeetingNotes`
- `DepartmentNotes`
- `MeetingActionItem`
- `MeetingComment`
- `MeetingUserAllocation`
- `UserTask` (if user added this)
- `UserTaskTag` (if user added this)
- `UserTaskTagRelation` (if user added this)

## 🚀 Deployment Steps

### For Production Server

```bash
# 1. SSH into server
ssh root@abcoafrica.co.za

# 2. Navigate to project directory
cd /var/www/abcotronics-erp

# 3. Pull latest code (if using git)
git pull origin main

# 4. Generate Prisma client
npx prisma generate

# 5. Apply database migration
npx prisma migrate deploy

# 6. Restart application
pm2 restart abcotronics-erp
# OR if using systemd
systemctl restart abcotronics-erp
```

### For Local Development

```bash
# 1. Generate Prisma client
npx prisma generate

# 2. Create and apply migration
npx prisma migrate dev --name add_meeting_notes

# 3. Restart development server
npm run dev
# OR
node server.js
```

## 🔍 Verification

### 1. Check API Endpoint

```bash
# Get auth token first, then test:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/meeting-notes
```

Should return:
```json
{
  "data": {
    "monthlyNotes": []
  }
}
```

### 2. Test Component Loading

1. Navigate to **Teams** section
2. Select **Management** team
3. Click on **Meeting Notes** tab
4. Component should load without errors

### 3. Test Creating Monthly Notes

1. Click **New Month** button
2. Enter monthly goals
3. Verify data is saved

### 4. Test Weekly Notes

1. Select a month
2. Click **Add Week** button
3. Expand a week
4. Fill in department notes
5. Verify data is saved

### 5. Test Action Items

1. Click **Add Action Item** button
2. Fill in action item details
3. Save and verify it appears in the summary

### 6. Test User Allocation

1. Click **Allocate Users** button
2. Assign users to departments
3. Verify assignments appear in department sections

## 📊 Database Schema Summary

### MonthlyMeetingNotes
- Stores monthly goals and status
- Links to weekly notes, action items, comments, and user allocations
- Unique constraint on `monthKey` (format: "YYYY-MM")

### WeeklyMeetingNotes
- Stores weekly notes for each month
- Links to department notes and action items
- Unique constraint on `monthlyNotesId` + `weekKey`

### DepartmentNotes
- Stores department-specific notes (successes, week plan, frustrations)
- One per department per week
- Links to comments and action items
- Unique constraint on `weeklyNotesId` + `departmentId`

### MeetingActionItem
- Stores action items/tasks
- Can be linked to monthly, weekly, or department notes
- Tracks status, priority, assignee, due date

### MeetingComment
- Stores comments on notes or action items
- Links to author (User)

### MeetingUserAllocation
- Stores user assignments to departments per month
- Unique constraint on `monthlyNotesId` + `departmentId` + `userId`

## 🐛 Troubleshooting

### Migration Fails: "Table already exists"
This is fine - the migration is idempotent. The tables may have been created manually or in a previous migration.

### Migration Fails: "Connection slots full"
Wait a few minutes and try again. Connection slots free up as active queries complete.

### Component Not Loading
1. Check browser console for errors
2. Verify `ManagementMeetingNotes` is available in `window`:
   ```javascript
   console.log(window.ManagementMeetingNotes);
   ```
3. Check that component is loaded in `lazy-load-components.js` or `component-loader.js`

### API Returns 401 Unauthorized
- Verify authentication token is valid
- Check that `authRequired` middleware is working
- Verify user has appropriate permissions

### API Returns 500 Error
1. Check server logs for detailed error
2. Verify database connection
3. Check that Prisma client was regenerated after migration
4. Verify all required fields are provided in API requests

### Data Not Saving
1. Check browser network tab for API errors
2. Verify `DatabaseAPI` is available:
   ```javascript
   console.log(window.DatabaseAPI);
   ```
3. Check that API endpoints are accessible
4. Verify database write permissions

## 📝 Post-Deployment

After successful deployment:

1. ✅ Test creating a monthly meeting notes entry
2. ✅ Test adding weekly notes
3. ✅ Test user allocation
4. ✅ Test action items
5. ✅ Test comments
6. ✅ Verify data persists after page refresh
7. ✅ Test on different browsers/devices

## 🔄 Rollback Plan

If issues occur:

1. **Rollback Database** (if migration was just applied):
   ```bash
   # Note: This requires a migration rollback script
   # For safety, restore from backup instead
   ```

2. **Restore from Backup**:
   ```bash
   # Restore database from backup
   ./scripts/restore-from-backup.sh database-backups/backup_YYYYMMDD_HHMMSS.sql.gz
   ```

3. **Revert Code**:
   ```bash
   git revert HEAD
   git push origin main
   ```

4. **Restart Application**:
   ```bash
   pm2 restart abcotronics-erp
   ```

## 📚 Related Files

- `prisma/schema.prisma` - Database schema
- `api/meeting-notes.js` - API endpoints
- `src/components/teams/ManagementMeetingNotes.jsx` - Frontend component
- `src/utils/databaseAPI.js` - Database API methods
- `src/components/teams/Teams.jsx` - Teams component (integration point)

## 🎯 Features Deployed

- ✅ Monthly goals tracking
- ✅ Weekly department notes (successes, plans, frustrations)
- ✅ User allocation to departments
- ✅ Action items/tasks with status tracking
- ✅ Comments on notes and action items
- ✅ Task summary dashboard
- ✅ Monthly plan generation from previous month
- ✅ Dark mode support
- ✅ Responsive design

## 📞 Support

If you encounter issues during deployment:
1. Check server logs: `pm2 logs abcotronics-erp`
2. Check database logs
3. Review browser console for frontend errors
4. Verify all environment variables are set correctly

---

**Status**: ✅ Ready for Deployment
**Last Updated**: $(date)

