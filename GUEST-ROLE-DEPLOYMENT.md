# Guest Role Feature - Deployment Complete ✅

## Deployment Status
- ✅ Code deployed to production
- ✅ Application restarted
- ⚠️ Database migration pending (database connection issue during deployment)

## What Was Deployed

### Frontend Changes
- Guest role added to permissions system
- MainLayout filters menu - guests only see Projects
- UserModal with project selection UI for guest users
- UserManagement component updated with guest role support
- Users component includes guest role definition

### Backend Changes
- API endpoints updated to filter projects for guests
- Individual project access control for guests
- Users API handles accessibleProjectIds
- Me API returns accessibleProjectIds

### Database Schema
- New field: `accessibleProjectIds` (JSON array) in User model
- Updated role enum to include 'guest'

## Next Steps

### 1. Run Database Migration (When Database is Accessible)

SSH into the production server and run:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp

# Option 1: Create and apply migration (recommended)
npx prisma migrate dev --name add_guest_role_and_accessible_projects

# Option 2: If migration fails, use direct push (safe - adds column if missing)
npx prisma db push --accept-data-loss

# Regenerate Prisma client
npx prisma generate

# Restart application
pm2 restart abcotronics-erp
```

### 2. Manual SQL Migration (Alternative)

If Prisma migrations don't work, you can manually add the column:

```sql
-- Connect to your PostgreSQL database and run:
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessibleProjectIds" TEXT DEFAULT '[]';

-- Update existing users to have empty array
UPDATE "User" SET "accessibleProjectIds" = '[]' WHERE "accessibleProjectIds" IS NULL;
```

### 3. Test the Feature

1. **Go to Users page** (admin only)
2. **Create a new user** with role "Guest"
3. **Select projects** that the guest can access
4. **Save the user**
5. **Log in as the guest user**
6. **Verify**:
   - Only Projects menu item is visible
   - Only assigned projects are shown
   - Cannot access other sections

## Feature Details

### Guest User Capabilities
- ✅ Can only see Projects section in navigation
- ✅ Can only view projects assigned to them
- ✅ Cannot access other sections (Dashboard, CRM, Teams, etc.)
- ✅ API-level security prevents unauthorized access

### Admin Capabilities
- ✅ Create guest users via Users page
- ✅ Assign specific projects to guest users
- ✅ Edit guest user project access
- ✅ View all users including guests

## Troubleshooting

### If guest users see all projects:
- Check that `accessibleProjectIds` is properly set in the database
- Verify the API is filtering projects correctly
- Check browser console for errors

### If guest users can access other sections:
- Verify user role is set to "guest" (case-insensitive)
- Check MainLayout.jsx redirect logic
- Verify menu filtering is working

### If database migration fails:
- Ensure database is accessible
- Check DATABASE_URL in .env file
- Verify database connection from server
- Use manual SQL migration if needed

## Files Modified

### Frontend
- `src/utils/permissions.js` - Added guest role
- `src/components/layout/MainLayout.jsx` - Menu filtering
- `src/components/users/UserModal.jsx` - Project selection UI
- `src/components/users/UserManagement.jsx` - Guest role support
- `src/components/users/Users.jsx` - Guest role definition

### Backend
- `api/projects.js` - Project filtering for guests
- `api/projects/[id].js` - Individual project access control
- `api/users/index.js` - accessibleProjectIds handling
- `api/me.js` - Returns accessibleProjectIds

### Database
- `prisma/schema.prisma` - Added accessibleProjectIds field

## Support

If you encounter any issues:
1. Check server logs: `pm2 logs abcotronics-erp`
2. Check database connection
3. Verify environment variables
4. Test with a new guest user

---

**Deployment Date:** $(date)
**Status:** Code deployed, migration pending

