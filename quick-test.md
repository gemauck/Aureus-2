# Quick Test Guide

## VA.Project Creation Test

### Step 1: Log into the app
1. Open http://localhost:3000
2. Log in with your credentials

### Step 2: Test Project Creation
1. Navigate to the **Projects** section
2. Click the **"New Project"** button
3. Fill in the form:
   - **Project Name**: Test Project
   - **Client**: Select any client (or create new one)
   - **Type**: Monthly Review
   - **Dates**: Set start and due dates
   - **Status**: Active
   - **Manager**: (optional)
   - **Assign To**: (optional)
4. Click **"Create Project"**

### What to Look For:
✅ Project should be created successfully  
✅ Project appears in the projects list immediately  
✅ No error messages in the console  
✅ Browser console shows logs like:
   - `🌐 Creating project in database:`
   - `📥 API Response:`
   - `📥 Extracted project:`

### Expected Console Output:
```
🔄 Projects: Loading projects from database
📡 Raw response from database: { data: { projects: [...] } }
📡 Database returned projects: X
📡 Normalized projects: X
🌐 Creating project in database: { name: "Test Project", clientName: "...", ... }
📥 API Response: { data: { project: { id: "...", name: "Test Project", ... } } }
📥 Extracted project: { id: "...", name: "Test Project", ... }
✅ Project created successfully
```

### If There's an Error:
- Check the browser console for specific error messages
- Check server logs for API errors
- Share the error message with me

### Alternative: Use Test Page
1. Make sure you're logged in to http://localhost:3000
2. Open http://localhost:3000/test-project-creation.html
3. Click "Create Test Project" button
4. Check the result section


