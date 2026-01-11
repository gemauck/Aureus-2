# Teams Data Storage Migration Guide

## Summary

All data storage issues in the Teams section have been fixed. The changes normalize the database schema, add proper foreign keys, convert JSON strings to JSONB, and move team data from hardcoded frontend constants to database-backed API endpoints.

## Changes Completed

### ✅ 1. Database Schema Updates (`prisma/schema.prisma`)

**Team Model Enhanced:**
- Added: `icon`, `color`, `description`, `isActive` fields
- Added relations to: `TeamPermission`, `TeamDocument`, `TeamWorkflow`, `TeamChecklist`, `TeamNotice`, `TeamTask`, `WorkflowExecution`

**New TeamPermission Table:**
- Stores team permissions as normalized records
- Foreign key relationship to Team with cascade delete

**All Team-Related Tables Updated:**
- `TeamDocument`: `team String` → `teamId String` with FK
- `TeamWorkflow`: `team String` → `teamId String` with FK
- `TeamChecklist`: `team String` → `teamId String` with FK
- `TeamNotice`: `team String` → `teamId String` with FK
- `TeamTask`: `team String` → `teamId String` with FK
- `WorkflowExecution`: `team String` → `teamId String` with FK

**JSON Fields Converted to JSONB:**
- All `tags`, `attachments`, `steps`, `items`, `completedSteps` fields now use `Json?` type (PostgreSQL JSONB)

**Indexes Added:**
- Foreign key indexes on all `teamId` fields
- Performance indexes on frequently queried fields (`status`, `category`, `date`, etc.)

### ✅ 2. API Endpoints Updated (`api/teams.js`)

**New Team CRUD Endpoints:**
- `GET /api/teams` - List all teams (with members, permissions, counts)
- `GET /api/teams/:id` - Get single team details
- `POST /api/teams` - Create new team (admin only)
- `PUT /api/teams/:id` - Update team (admin only)
- `DELETE /api/teams/:id` - Delete/deactivate team (admin only, soft-delete if has data)

**All Existing Endpoints Updated:**
- Support both `team` (backward compatibility) and `teamId` parameters
- Use `teamId` foreign keys instead of string matching
- Include team relation data in responses
- Proper JSONB handling for tags, attachments, steps, items

### ✅ 3. Frontend Updates (`src/components/teams/Teams.jsx`)

**Removed Hardcoded TEAMS Constant:**
- Teams now fetched from API on component mount
- Loading and error states handled
- All TEAMS references replaced with `teams` state variable

**API Integration:**
- Teams fetched from `/api/teams` endpoint
- Proper error handling and loading states
- Backward compatible with existing team IDs

### ✅ 4. Data Service Updates (`src/utils/dataService.js`)

**Team Notices API Migration:**
- `getTeamNotices(teamId)` - Fetches from API instead of LocalStorage
- `setTeamNotices(notice)` - Creates/updates via API
- `deleteTeamNotice(noticeId)` - Deletes via API
- Proper error handling and token management

### ✅ 5. Seed Script Updated (`prisma/seed.js`)

**Teams Seeding:**
- All 8 hardcoded teams now seeded to database
- Team permissions stored in TeamPermission table
- Teams created with proper IDs matching frontend expectations

## Migration Steps

### Step 1: Generate Prisma Migration

```bash
# This will create a migration file based on schema changes
npx prisma migrate dev --name normalize_teams_storage

# If you get foreign key constraint errors, you may need to:
# 1. First add the new columns (teamId) as nullable
# 2. Migrate existing data from team String to teamId
# 3. Then make teamId required and add foreign key constraints
```

### Step 2: Run Data Migration (if needed)

If you have existing data in the team-related tables, you'll need to migrate the `team` string values to `teamId` foreign keys:

```sql
-- Example migration SQL (adjust based on your data)
-- This assumes teams have been seeded with IDs matching the string values

-- For TeamDocument
UPDATE "TeamDocument" 
SET "teamId" = (SELECT id FROM "Team" WHERE name = "TeamDocument"."team" OR id = "TeamDocument"."team")
WHERE "teamId" IS NULL;

-- Repeat for other tables: TeamWorkflow, TeamChecklist, TeamNotice, TeamTask, WorkflowExecution
```

### Step 3: Seed Teams

```bash
# Run the seed script to populate teams
npx prisma db seed
```

Or manually seed:

```bash
node prisma/seed.js
```

### Step 4: Generate Prisma Client

```bash
# Regenerate Prisma client with new schema
npx prisma generate
```

### Step 5: Test the Changes

1. **Start the application**
2. **Verify teams load from API:**
   - Navigate to Teams section
   - Check browser console for API calls
   - Verify teams display correctly

3. **Test team operations:**
   - Create/edit/delete team (admin only)
   - Create team documents/workflows/checklists/notices/tasks
   - Verify foreign key relationships work

4. **Verify data migration:**
   - Check existing team-related records have valid `teamId` values
   - Verify JSONB fields store data correctly

## Breaking Changes

⚠️ **Note:** These changes introduce breaking changes that require a migration:

1. **Database Schema:** Existing `team` String columns need to be migrated to `teamId` foreign keys
2. **API Responses:** Team-related entities now include `teamId` instead of `team` (backward compatible with both)
3. **Frontend:** Teams are now fetched from API - no hardcoded data

## Rollback Plan

If issues arise, you can rollback by:

1. Reverting the Prisma schema changes
2. Running `npx prisma migrate reset` (⚠️ **WARNING:** This will delete all data)
3. Or manually reverting the database schema changes

## Verification Checklist

- [ ] Teams load from API successfully
- [ ] All 8 teams appear in the UI
- [ ] Team metadata (icon, color, description) displays correctly
- [ ] Team permissions are loaded from database
- [ ] Creating team documents/workflows/checklists/notices/tasks works
- [ ] Foreign key relationships are enforced
- [ ] JSONB fields store/retrieve data correctly
- [ ] Team CRUD operations work (admin only)
- [ ] Management team access control works
- [ ] No console errors

## Support

If you encounter issues during migration:

1. Check Prisma migration logs
2. Verify database connection
3. Check API endpoint responses in browser network tab
4. Review server logs for errors
5. Verify auth tokens are being sent correctly

## Next Steps (Optional Improvements)

1. **Add team member count caching** - Store calculated count in Team table
2. **Add team activity tracking** - Track last activity timestamps
3. **Normalize workflow steps** - Create TeamWorkflowStep table for better queryability
4. **Normalize checklist items** - Create TeamChecklistItem table
5. **Add team soft-delete** - Use `deletedAt` instead of `isActive`


