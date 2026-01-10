# Browser Testing Instructions for Projects Functionality

## Quick Start

1. **Navigate to**: https://abcoafrica.co.za
2. **Log in** with your credentials
3. **Open Browser Console** (F12 or Right-click → Inspect → Console)
4. **Copy the test script** from `test-projects-browser.js`
5. **Paste into console** and press Enter

## Manual Testing Steps

### 1. Create a New Project

1. Navigate to **Projects** section
2. Click **"New Project"** or **"+"** button
3. Fill in project details:
   - Name: `[TEST] Browser Test Project`
   - Description: `Testing project creation and endpoints`
   - Status: `Planning`
   - Priority: `High`
   - Type: `General`
4. Click **"Save"** or **"Create"**
5. **Verify**: Project appears in projects list
6. **Check Console**: No errors should appear

### 2. View Project Details

1. Click on the newly created project
2. **Verify**:
   - Project details load correctly
   - Tasks section is visible (may be empty initially)
   - No console errors

### 3. Create a Task

1. In project detail view, click **"Add Task"** or **"New Task"**
2. Fill in task details:
   - Title: `[TEST] Browser Test Task`
   - Description: `Testing task creation`
   - Status: `To Do`
   - Priority: `High`
3. Click **"Save"**
4. **Verify**:
   - Task appears in task list
   - Task persists after page refresh
   - No console errors

### 4. Add Comment to Task

1. Click on the task to open task detail modal
2. Navigate to **"Comments"** tab
3. Type a comment: `[TEST] Browser test comment`
4. Click **"Add Comment"** or **"Post"**
5. **Verify**:
   - Comment appears immediately
   - Comment persists after closing and reopening modal
   - Comment persists after page refresh
   - No console errors

### 5. Update Task

1. Open task detail modal
2. Change task status to `In Progress`
3. Change priority to `Medium`
4. Update description
5. Click **"Save"**
6. **Verify**:
   - Changes are saved
   - Changes persist after refresh
   - No console errors

### 6. Update Project

1. In project detail view, click **"Edit"** or modify fields directly
2. Change description to `Updated description from browser test`
3. Change status to `In Progress`
4. Click **"Save"**
5. **Verify**:
   - Changes are saved
   - Changes persist after refresh
   - No console errors

### 7. Test Data Persistence

1. Create a project with tasks and comments
2. **Close the browser tab**
3. **Reopen browser** and navigate to https://abcoafrica.co.za
4. **Log in** again
5. Navigate to **Projects** section
6. **Verify**:
   - Project still exists
   - Tasks are still present
   - Comments are still present
   - All data persisted correctly

### 8. Delete Task

1. Open task detail modal
2. Click **"Delete"** or **"Remove"** button
3. Confirm deletion
4. **Verify**:
   - Task is removed from list
   - Task comments are also deleted (cascade)
   - No console errors

### 9. Delete Project

1. In project detail view, click **"Delete Project"** or **"Remove"**
2. Confirm deletion
3. **Verify**:
   - Project is removed from list
   - All tasks are deleted (cascade)
   - All comments are deleted (cascade)
   - No console errors

## Automated Browser Test Script

For automated testing, use the script in `test-projects-browser.js`:

1. Log in to the application
2. Open browser console (F12)
3. Copy the entire contents of `test-projects-browser.js`
4. Paste into console
5. Press Enter
6. Review test results

The script will:
- ✅ Test all CRUD operations
- ✅ Verify data persistence
- ✅ Test cascade deletion
- ✅ Clean up test data automatically

## What to Check

### Console Messages
- ✅ No red error messages
- ✅ No 500 or 400 HTTP errors
- ✅ API calls return 200 status codes
- ✅ No "Failed to load resource" errors

### Network Tab
1. Open **Network** tab in DevTools
2. Filter by **XHR** or **Fetch**
3. Check API calls:
   - `/api/projects` - Should return 200
   - `/api/projects/[id]` - Should return 200
   - `/api/tasks` - Should return 200
   - `/api/task-comments` - Should return 200
4. Verify request/response payloads are correct

### Database Verification (Optional)

To verify data is in tables (not JSON), you can check:

```sql
-- Check tasks in Task table
SELECT id, title, status, "projectId" FROM "Task" WHERE title LIKE '%[TEST]%';

-- Check comments in TaskComment table
SELECT id, text, "taskId", "projectId" FROM "TaskComment" WHERE text LIKE '%[TEST]%';

-- Verify JSON fields are empty
SELECT id, name, "tasksList", "taskLists", "customFieldDefinitions", "team", "documents", "comments", "activityLog" 
FROM "Project" 
WHERE name LIKE '%[TEST]%';
```

All JSON fields should be `'[]'` or empty strings.

## Expected Results

### ✅ Success Indicators
- All operations complete without errors
- Data persists after page refresh
- Tasks and comments load correctly
- Cascade deletion works
- No console errors
- API calls return 200 status codes

### ❌ Failure Indicators
- Console errors
- 500/400 HTTP errors
- Data not persisting
- Tasks/comments not loading
- Cascade deletion not working
- JSON fields being written to (check database)

## Troubleshooting

### If tests fail:
1. Check browser console for errors
2. Check Network tab for failed API calls
3. Verify you're logged in
4. Check server logs: `ssh root@165.22.127.196 'pm2 logs abcotronics-erp'`
5. Verify database connection
6. Check Prisma client is up to date

### Common Issues:
- **401 Unauthorized**: Not logged in or session expired
- **500 Server Error**: Check server logs
- **Data not persisting**: Check database connection
- **Tasks not loading**: Check Task API endpoint

## Test Checklist

- [ ] Create project
- [ ] View project details
- [ ] Create task
- [ ] Add comment to task
- [ ] Update task
- [ ] Update project
- [ ] Refresh page and verify data persistence
- [ ] Delete task (verify cascade)
- [ ] Delete project (verify cascade)
- [ ] Run automated browser test script
- [ ] Verify no JSON writes in database
- [ ] Check console for errors
- [ ] Check Network tab for API errors

---

**Note**: All test data should be cleaned up after testing. The automated script will delete test projects automatically.
