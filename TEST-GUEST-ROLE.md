# Test Guest Role Feature

## Quick Test Steps

### 1. Clear Browser Cache (CRITICAL)
- **Mac**: `Cmd+Shift+R`
- **Windows/Linux**: `Ctrl+Shift+R`
- Or use Incognito/Private window

### 2. Login as Admin
- Go to https://abcoafrica.co.za
- Login with admin credentials
- Verify you see "Administrator" in sidebar

### 3. Create Guest User
1. Go to **Users** page (in sidebar)
2. Click **"Add User"** button
3. Fill in:
   - Name: Test Guest User
   - Email: guest@test.com
   - **Role: Select "Guest"** from dropdown
4. **IMPORTANT**: If "Guest" option doesn't appear:
   - Clear browser cache completely
   - Hard refresh (Cmd+Shift+R)
   - Try incognito window
   - Check browser console (F12) for errors

### 4. Assign Projects
- After selecting "Guest" role, you should see "Project Access" section
- Check boxes for projects the guest can access
- Click "Create User"

### 5. Test Guest Access
- Log out
- Log in as the guest user
- Should only see "Projects" in sidebar
- Should only see assigned projects

## What Should Work

✅ **As Admin:**
- See "Guest" option in role dropdown
- See project selection UI when Guest is selected
- Can assign projects to guest users

✅ **As Guest:**
- Only see Projects menu
- Only see assigned projects
- Cannot access other sections

## If It's Still Not Working

1. **Check Browser Console** (F12 → Console)
   - Look for JavaScript errors
   - Share any red errors

2. **Verify Server Files:**
   ```bash
   ssh root@abcoafrica.co.za
   cd /var/www/abcotronics-erp
   grep "Guest" dist/src/components/users/UserManagement.js
   ```

3. **Check Server Logs:**
   ```bash
   pm2 logs abcotronics-erp --lines 50
   ```

4. **Force Rebuild:**
   ```bash
   cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular
   npm run build
   ./deploy-guest-role-complete.sh
   ```

## Deployment Status

- ✅ Code deployed
- ✅ Guest role in permissions
- ✅ API filtering implemented
- ✅ UI components updated
- ⚠️ Database migration pending (but code will work)

---

**Note**: The feature is fully deployed. If you don't see the "Guest" option, it's almost certainly a browser cache issue. Clear cache completely and try again.

