# 🌐 Browser Testing Guide - Meeting Notes Platform

## Server Status

The server should be running on: **http://localhost:3000**

## Step-by-Step Browser Testing

### 1. Open the Application

1. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

2. Log in with your credentials

### 2. Navigate to Meeting Notes

1. Click on **Teams** in the navigation menu
2. Select the **Management** team (should be the first one with blue icon)
3. Click on the **Meeting Notes** tab

### 3. Test Creating Monthly Notes

**Expected Behavior:**
- You should see a "New Month" button
- Current month should be pre-selected in the dropdown
- If no notes exist, you'll see an empty state

**Test Steps:**
1. Click **New Month** button
2. You should see a monthly goals section appear
3. Enter some test goals in the "Monthly Goals" textarea
4. The goals should auto-save as you type (or on blur)

**✅ Success Indicators:**
- Monthly goals section appears
- Text saves without errors
- No console errors in browser DevTools

### 4. Test Creating Weekly Notes

**Test Steps:**
1. With a month selected, click **Add Week** button
2. A new week section should appear
3. Click the **Expand** button on the week
4. You should see 7 department sections:
   - Compliance (red)
   - Finance (yellow)
   - Technical (purple)
   - Data (indigo)
   - Support (green)
   - Commercial (orange)
   - Business Development (pink)

**✅ Success Indicators:**
- Week appears with correct date range
- All 7 departments are visible
- Each department has 3 text areas:
  - Last Week's Successes
  - This Week's Plan
  - Frustrations/Challenges

### 5. Test Filling Department Notes

**Test Steps:**
1. Expand a week
2. In any department section, fill in:
   - Last Week's Successes: "Test success 1, Test success 2"
   - This Week's Plan: "Test plan item 1, Test plan item 2"
   - Frustrations: "Test frustration 1"
3. Move to another field - data should auto-save

**✅ Success Indicators:**
- Text saves without page refresh
- No error messages
- Data persists when you collapse and re-expand the week

### 6. Test User Allocation

**Test Steps:**
1. Click **Allocate Users** button (top right)
2. A modal should open showing all departments
3. For any department, use the dropdown to select a user
4. User should appear in the department section
5. Click **Remove** to test removing a user

**✅ Success Indicators:**
- Modal opens correctly
- User dropdown shows available users
- Selected users appear in department sections
- Remove button works

### 7. Test Action Items

**Test Steps:**
1. Click **Add Action Item** button (in Action Items Summary section)
2. Fill in the form:
   - Title: "Test Action Item"
   - Description: "This is a test"
   - Status: Select "In Progress"
   - Priority: Select "High"
   - Assigned To: Select a user
   - Due Date: Select a future date
3. Click **Save**
4. Action item should appear in the summary

**✅ Success Indicators:**
- Modal opens with form
- Form saves successfully
- Action item appears in summary with correct status
- Counts update (Open, In Progress, Completed, Total)

### 8. Test Comments

**Test Steps:**
1. In any department section, click **Add Comment**
2. Enter a test comment
3. Click **Post Comment**
4. Comment should appear below

**✅ Success Indicators:**
- Comment modal opens
- Comment saves and displays
- Shows author name and date

### 9. Test Monthly Plan Generation

**Test Steps:**
1. Create a month with some data (goals, allocations)
2. Navigate to next month (or create it)
3. Click **Generate Month** button
4. New month should be created with previous month's structure

**✅ Success Indicators:**
- New month created
- User allocations copied
- Monthly goals can be updated

### 10. Test Task Tracking

**Test Steps:**
1. Create multiple action items with different statuses
2. Check the Action Items Summary section
3. Verify counts are correct:
   - Open: X
   - In Progress: Y
   - Completed: Z
   - Total: X+Y+Z

**✅ Success Indicators:**
- Counts are accurate
- Action items are grouped by status
- Can edit/delete action items

## Browser Console Checks

Open Browser DevTools (F12) and check:

### No Errors
- Console should show no red errors
- Look for any `ManagementMeetingNotes` related errors
- Check for API errors (401, 403, 500)

### Expected Logs
You might see:
- `📥 ManagementMeetingNotes: Loading meeting notes...`
- `✅ ManagementMeetingNotes: Loaded X month(s)`
- `📡 Fetching meeting notes from database...`

### Network Tab
1. Open Network tab in DevTools
2. Filter by "meeting-notes"
3. Test creating/updating data
4. Verify API calls are:
   - Status 200 (success)
   - Not 401 (unauthorized)
   - Not 500 (server error)

## Common Issues & Solutions

### Issue: Component Not Loading
**Symptoms:** Blank screen or "Component not available" message

**Solutions:**
1. Check browser console for errors
2. Verify `window.ManagementMeetingNotes` exists:
   ```javascript
   console.log(window.ManagementMeetingNotes);
   ```
3. Check that component-loader.js includes the component
4. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Issue: Data Not Saving
**Symptoms:** Changes don't persist after refresh

**Solutions:**
1. Check Network tab for failed API calls
2. Verify authentication token is valid
3. Check server logs for errors
4. Verify database connection

### Issue: Users Not Loading
**Symptoms:** User dropdown is empty

**Solutions:**
1. Check if `/api/users` endpoint works
2. Verify user has permission to view users
3. Check browser console for errors

### Issue: Action Items Not Appearing
**Symptoms:** Created action items don't show up

**Solutions:**
1. Check if action item was created (Network tab)
2. Refresh the page
3. Verify the action item's `monthlyNotesId` matches current month

## Quick Test Checklist

- [ ] Server is running (http://localhost:3000)
- [ ] Can log in successfully
- [ ] Teams → Management → Meeting Notes tab loads
- [ ] Can create monthly notes
- [ ] Can create weekly notes
- [ ] Can fill department notes
- [ ] Can allocate users
- [ ] Can create action items
- [ ] Can add comments
- [ ] Data persists after refresh
- [ ] No console errors
- [ ] API calls return 200 status

## Test Data to Create

For comprehensive testing, create:

1. **Monthly Notes:**
   - Current month with goals
   - Previous month for testing generation

2. **Weekly Notes:**
   - At least 2 weeks with data
   - Different departments filled in

3. **Action Items:**
   - 1 Open
   - 1 In Progress
   - 1 Completed
   - Different priorities

4. **User Allocations:**
   - At least 2 users assigned to different departments

5. **Comments:**
   - At least 1 comment on a department note
   - At least 1 comment on an action item

## Reporting Issues

If you find issues, note:
1. Browser and version
2. Steps to reproduce
3. Console errors (screenshot)
4. Network errors (screenshot)
5. Expected vs actual behavior

---

**Ready to test!** Open http://localhost:3000 and follow the steps above.

