# Checklist Migration to Table-Based Structure

## Overview

The checklists (document sections and weekly FMS review sections) have been migrated from JSON storage to proper relational database tables. This provides:

- ✅ Better queryability
- ✅ Improved performance with indexes
- ✅ Data integrity with foreign keys
- ✅ Easier reporting and analytics

## What Changed

### Database Schema

New tables added:
- `DocumentSection` - Document collection sections organized by year
- `DocumentItem` - Individual document items within sections
- `DocumentItemStatus` - Status tracking per year/month
- `DocumentItemComment` - Comments per year/month
- `WeeklyFMSReviewSection` - Weekly FMS review sections organized by year
- `WeeklyFMSReviewItem` - Individual items within sections
- `WeeklyFMSReviewItemStatus` - Status tracking per year/month/week
- `WeeklyFMSReviewItemComment` - Comments per year/month/week

### API Changes

The API now:
1. **Reads from tables first** - If table data exists, it's used
2. **Falls back to JSON** - If no table data, uses legacy JSON fields
3. **Writes to both** - Saves to tables AND updates JSON (for backward compatibility)

This ensures zero downtime during migration.

## Migration Steps

### 1. Run Prisma Migration

First, apply the schema changes:

```bash
npx prisma migrate dev --name add_checklist_tables
```

Or if using production:

```bash
npx prisma migrate deploy
```

### 2. Run Data Migration Script

Migrate existing JSON data to tables:

```bash
# Dry run (see what would be migrated)
node scripts/migrate-checklists-to-tables.js --dry-run

# Migrate all projects
node scripts/migrate-checklists-to-tables.js

# Migrate specific project
node scripts/migrate-checklists-to-tables.js --project-id=PROJECT_ID
```

### 3. Verify Migration

Check that data was migrated correctly:

```sql
-- Check document sections
SELECT COUNT(*) FROM "DocumentSection";
SELECT COUNT(*) FROM "DocumentItem";
SELECT COUNT(*) FROM "DocumentItemStatus";
SELECT COUNT(*) FROM "DocumentItemComment";

-- Check weekly FMS review sections
SELECT COUNT(*) FROM "WeeklyFMSReviewSection";
SELECT COUNT(*) FROM "WeeklyFMSReviewItem";
SELECT COUNT(*) FROM "WeeklyFMSReviewItemStatus";
SELECT COUNT(*) FROM "WeeklyFMSReviewItemComment";
```

### 4. Test API

Test that the API returns data correctly:

```bash
# Get a project
curl http://localhost:3000/api/projects/PROJECT_ID

# Verify documentSections and weeklyFMSReviewSections are returned
```

## Rollback Plan

If you need to rollback:

1. The JSON fields are still in the schema and being updated
2. Simply stop writing to tables (remove the save functions from API)
3. The API will automatically fall back to JSON fields

## Future Steps (Optional)

Once migration is verified and stable:

1. **Remove JSON fields** from schema (after validation period)
2. **Remove backward compatibility code** from API
3. **Update frontend** to use new table-based queries (if needed)

## Notes

- The migration script is idempotent - it checks if data already exists before migrating
- Both JSON and table data are kept in sync during transition
- No data loss - JSON fields remain as backup
- Frontend code doesn't need changes - API converts table data to JSON format




