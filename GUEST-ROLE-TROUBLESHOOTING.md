# Guest Role Feature - Troubleshooting Guide

## Deployment Status ✅

**Code Status**: ✅ All code deployed
**Database Migration**: ⚠️ Pending (database connection issue)
**Application**: ✅ Running and restarted

## What to Check First

### 1. **Browser Cache** (Most Common Issue)
The feature won't appear if your browser is using cached JavaScript files.

**Solution:**
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
- Or clear cache completely:
  - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
  - Firefox: Settings → Privacy → Clear Data → Cached Web Content
  - Safari: Develop → Empty Caches

### 2. **Verify You're Logged In as Admin**
- Only admins can see the Users page
- Only admins can create/edit users
- Check your role in the sidebar (should show "Administrator")

### 3. **Check Browser Console for Errors**
1. Open DevTools (F12)
2. Go to Console tab
3. Look for any red errors
4. Share any errors you see

## Step-by-Step Testing

### Step 1: Create a Guest User
1. Go to **Users** page (should be visible in sidebar if you're admin)
2. Click **"Add User"** button
3. Fill in:
   - Name: Test Guest
   - Email: testguest@example.com
   - **Role: Select "Guest"** ← Should appear in dropdown
4. If you see "Guest" option:
   - ✅ Feature is deployed
   - Continue to Step 2
5. If you DON'T see "Guest" option:
   - ❌ Browser cache issue
   - Clear cache and hard refresh
   - Try again

### Step 2: Select Projects for Guest
1. After selecting "Guest" role
2. You should see a **"Project Access"** section appear
3. It should show a list of all available projects
4. Check the boxes for projects this guest can access
5. Click "Create User"

### Step 3: Test Guest Access
1. Log out
2. Log in as the guest user you created
3. You should see:
   - ✅ Only "Projects" menu item in sidebar
   - ✅ Only assigned projects visible
   - ❌ No access to Dashboard, CRM, Teams, etc.

## Common Issues & Solutions

### Issue: "Guest" option doesn't appear in role dropdown

**Possible Causes:**
1. Browser cache (most common)
2. Old JavaScript files being served
3. Wrong component being used

**Solutions:**
```bash
# On server, verify files are updated
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
grep -q "guest:" dist/src/utils/permissions.js && echo "✅ Guest role in permissions" || echo "❌ Missing"
grep -q "value=\"guest\"" dist/src/components/users/UserManagement.js && echo "✅ Guest in UserManagement" || echo "❌ Missing"
```

**Fix:**
- Clear browser cache completely
- Hard refresh (Cmd+Shift+R)
- Try incognito/private window

### Issue: Project selection UI doesn't appear

**Check:**
- Did you select "Guest" from the role dropdown?
- Are there any projects in the system?
- Check browser console for JavaScript errors

**Fix:**
- Ensure role is set to "Guest" (not "guest" with different casing)
- Create at least one project first
- Check console for errors

### Issue: Guest users can see all projects

**Check:**
- Is `accessibleProjectIds` set correctly in database?
- Are projects assigned to the guest user?
- Check API response: `GET /api/projects` as guest user

**Fix:**
- Verify database column exists
- Re-assign projects to guest user
- Check API logs

### Issue: Guest users can access other sections

**Check:**
- Is user role actually "guest" (case-sensitive)?
- Check MainLayout.jsx redirect logic
- Verify menu filtering is working

**Fix:**
- Verify user role in database
- Check browser console for errors
- Hard refresh page

## Server-Side Verification

Run these commands on the server to verify deployment:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp

# Check if guest role exists in permissions
grep -A 5 "guest:" dist/src/utils/permissions.js

# Check if Guest option is in UserManagement
grep "value=\"guest\"" dist/src/components/users/UserManagement.js

# Check if guest filtering is in MainLayout
grep "userRole === 'guest'" dist/src/components/layout/MainLayout.js

# Check if API handles accessibleProjectIds
grep "accessibleProjectIds" api/users/index.js

# Check if projects API filters for guests
grep "userRole === 'guest'" api/projects.js
```

All should return results. If any don't, the deployment is incomplete.

## Database Migration Status

The database migration couldn't run automatically due to connection issues. However, the code is deployed and will work once the database is accessible.

**To complete migration when database is available:**
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
npx prisma db push --accept-data-loss
npx prisma generate
pm2 restart abcotronics-erp
```

## Still Not Working?

If the feature still doesn't work after clearing cache:

1. **Share these details:**
   - What exactly isn't working? (Guest option missing? Project selection not showing? Guest can see all projects?)
   - Browser and version
   - Any console errors (F12 → Console)
   - Screenshot of the Users page

2. **Verify server logs:**
   ```bash
   ssh root@abcoafrica.co.za 'cd /var/www/abcotronics-erp && pm2 logs abcotronics-erp --lines 50'
   ```

3. **Check if files are actually deployed:**
   ```bash
   ssh root@abcoafrica.co.za 'cd /var/www/abcotronics-erp && ls -la dist/src/components/users/UserModal.js dist/src/utils/permissions.js'
   ```

## Quick Fix: Force Rebuild

If nothing works, force a complete rebuild:

```bash
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular
npm run build
./deploy-guest-role-complete.sh
```

Then on server:
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
pm2 restart abcotronics-erp --update-env
```

## Expected Behavior

### As Admin:
- ✅ Can see Users page
- ✅ Can create users with "Guest" role
- ✅ Can select projects for guest users
- ✅ Can edit guest user project access

### As Guest:
- ✅ Only sees Projects menu item
- ✅ Only sees assigned projects
- ✅ Cannot access other sections
- ✅ Redirected away from non-project pages

---

**Last Updated**: $(date)
**Status**: Code deployed, database migration pending

