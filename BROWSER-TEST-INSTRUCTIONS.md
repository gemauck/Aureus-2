# Browser Test Instructions - Dashboard Tasks Fix

## Quick Test Steps

1. **Log in to the application**
   - Go to http://localhost:3000
   - Enter your credentials
   - Click "Sign In"

2. **Navigate to Dashboard**
   - After login, you should be on the Dashboard page
   - If not, click "Dashboard" in the navigation

3. **Check the "My Tasks" Widget**
   - Look for the "My Tasks" widget on the dashboard
   - It should display project tasks assigned to you

4. **Verify the Fix**
   - ✅ **Project tasks should show:**
     - Project name (with project diagram icon)
     - Client name (below the task title)
   - ✅ **Tasks should be clickable** - clicking navigates to the project

## What to Look For

### ✅ Working Correctly:
- Tasks display with project name
- Tasks display with client name
- No console errors about missing `task.project`
- Tasks are clickable and navigate correctly

### ❌ If Not Working:
- Tasks show but no project/client names
- Console errors about `task.project` being undefined
- "No tasks assigned to you" when you have tasks

## Console Check

Open browser DevTools (F12) and check:
1. **Console tab** - Look for any errors
2. **Network tab** - Check the `/api/tasks?lightweight=true` request
   - Should return 200 OK
   - Response should include `project` object with `name` and `clientName`

## Expected API Response

When you check the Network tab for `/api/tasks?lightweight=true`, the response should look like:

```json
{
  "tasks": [
    {
      "id": "...",
      "title": "Task Title",
      "projectId": "...",
      "project": {
        "id": "...",
        "name": "Project Name",
        "clientName": "Client Name"
      },
      "status": "todo",
      "dueDate": "...",
      ...
    }
  ]
}
```

## Troubleshooting

If tasks aren't showing:
1. Make sure you have tasks assigned to you in a project
2. Check browser console for errors
3. Verify the API endpoint returns project data
4. Try refreshing the page (Ctrl+R or Cmd+R)
