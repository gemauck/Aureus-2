# 🌐 Production Testing Guide - Meeting Notes Platform

## Production URL

**https://abcoafrica.co.za**

## Pre-Deployment Checklist

Before testing in production, ensure:

- [ ] Code is committed and pushed to git
- [ ] Database migration has been applied
- [ ] Prisma client has been generated
- [ ] Application has been restarted

## Deployment to Production

### Option 1: Automated Script (Recommended)

```bash
./deploy-meeting-notes-production.sh
```

This script will:
1. Push code to git
2. SSH into production server
3. Pull latest code
4. Generate Prisma client
5. Create database backup
6. Apply database migration
7. Restart application

### Option 2: Manual Deployment

```bash
# 1. Push code
git push origin main

# 2. SSH into server
ssh root@abcoafrica.co.za

# 3. Navigate to project
cd /var/www/abcotronics-erp

# 4. Pull latest code
git pull origin main

# 5. Generate Prisma client
npx prisma generate

# 6. Apply migration
npx prisma db push --skip-generate

# 7. Restart app
pm2 restart abcotronics-erp
```

## Testing in Production

### 1. Access the Application

1. Open browser and navigate to:
   ```
   https://abcoafrica.co.za
   ```

2. Log in with your production credentials

### 2. Navigate to Meeting Notes

1. Click on **Teams** in the navigation
2. Select **Management** team
3. Click on **Meeting Notes** tab

### 3. Test Core Features

#### ✅ Create Monthly Notes
- Click **New Month**
- Enter monthly goals
- Verify it saves

#### ✅ Create Weekly Notes
- Click **Add Week**
- Expand the week
- Verify all 7 departments appear

#### ✅ Fill Department Notes
- Fill in "Last Week's Successes"
- Fill in "This Week's Plan"
- Fill in "Frustrations"
- Verify auto-save works

#### ✅ User Allocation
- Click **Allocate Users**
- Assign users to departments
- Verify assignments appear

#### ✅ Action Items
- Create action items
- Update status
- Assign to users
- Verify tracking works

#### ✅ Comments
- Add comments to notes
- Add comments to action items
- Verify they display correctly

### 4. Browser Console Checks

Open DevTools (F12) and verify:

- ✅ No console errors
- ✅ API calls return 200 status
- ✅ No 401 (unauthorized) errors
- ✅ No 500 (server) errors
- ✅ Component loads successfully

### 5. Network Tab Verification

1. Open Network tab in DevTools
2. Filter by "meeting-notes"
3. Test creating/updating data
4. Verify:
   - ✅ POST requests succeed (201/200)
   - ✅ PUT requests succeed (200)
   - ✅ GET requests succeed (200)
   - ✅ No failed requests

## Production-Specific Checks

### Performance
- [ ] Page loads quickly
- [ ] No lag when typing in text areas
- [ ] Auto-save works smoothly
- [ ] Modals open/close quickly

### Data Persistence
- [ ] Data saves correctly
- [ ] Data persists after page refresh
- [ ] No data loss on navigation

### User Permissions
- [ ] Only authorized users can access
- [ ] User allocations work correctly
- [ ] Comments show correct author

### Mobile Responsiveness
- [ ] Works on mobile devices
- [ ] Text areas are usable on mobile
- [ ] Modals are mobile-friendly

## Troubleshooting Production Issues

### Issue: Component Not Loading

**Check:**
1. Browser console for errors
2. Server logs: `pm2 logs abcotronics-erp`
3. Verify component is in component-loader.js

**Solution:**
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
pm2 logs abcotronics-erp --lines 50
```

### Issue: API Returns 401

**Check:**
1. Authentication token is valid
2. User has proper permissions
3. API endpoint is accessible

**Solution:**
- Log out and log back in
- Check server logs for auth errors

### Issue: Data Not Saving

**Check:**
1. Database connection
2. Server logs for errors
3. Network tab for failed requests

**Solution:**
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
# Check database connection
npx prisma db execute --stdin <<< "SELECT 1;"
# Check server logs
pm2 logs abcotronics-erp --lines 100
```

### Issue: Migration Not Applied

**Check:**
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
# Verify tables exist
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%Meeting%';"
```

**Solution:**
```bash
# Re-run migration
npx prisma db push --skip-generate
npx prisma generate
pm2 restart abcotronics-erp
```

## Production Test Checklist

- [ ] Server is accessible (https://abcoafrica.co.za)
- [ ] Can log in successfully
- [ ] Teams → Management → Meeting Notes loads
- [ ] Can create monthly notes
- [ ] Can create weekly notes
- [ ] Can fill department notes (all 7 departments)
- [ ] Can allocate users
- [ ] Can create action items
- [ ] Can update action item status
- [ ] Can add comments
- [ ] Data persists after refresh
- [ ] No console errors
- [ ] No server errors in logs
- [ ] Performance is acceptable
- [ ] Mobile responsive

## Rollback Plan

If critical issues are found:

### Quick Rollback
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp

# Revert to previous commit
git log --oneline -5  # Find previous commit
git reset --hard <previous-commit-hash>

# Regenerate Prisma client (may need previous schema)
npx prisma generate

# Restart
pm2 restart abcotronics-erp
```

### Database Rollback
```bash
# Restore from backup
cd /var/www/abcotronics-erp
gunzip -c database-backups/backup_meeting_notes_*.sql.gz | psql $DATABASE_URL
```

## Monitoring

After deployment, monitor:

1. **Server Logs:**
   ```bash
   pm2 logs abcotronics-erp --lines 100
   ```

2. **Error Rates:**
   - Check for 500 errors
   - Check for database connection errors

3. **Performance:**
   - Page load times
   - API response times

4. **User Feedback:**
   - Monitor for user-reported issues
   - Check support channels

## Success Criteria

✅ All features work as expected
✅ No errors in console or logs
✅ Data saves and persists correctly
✅ Performance is acceptable
✅ Users can successfully use the feature

---

**Ready for Production Testing!**

Navigate to: **https://abcoafrica.co.za** → **Teams** → **Management** → **Meeting Notes**

