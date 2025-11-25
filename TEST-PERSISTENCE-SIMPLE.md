# Simple Persistence Test Guide

## Quick Test (3 Steps)

### Step 1: Open Browser Console
1. Go to http://localhost:3000 (or your server)
2. Log in
3. Navigate to Projects page
4. Open browser DevTools (F12)
5. Go to Console tab

### Step 2: Load Test Function
Copy and paste this into the console:

```javascript
// Test function
async function testPersistence() {
    console.log('🧪 Testing...');
    
    // Get first project
    const res = await window.DatabaseAPI.getProjects();
    const projects = res?.data?.projects || res?.projects || [];
    if (projects.length === 0) {
        console.error('❌ No projects');
        return;
    }
    
    const project = projects[0];
    console.log('✅ Project:', project.name);
    
    // Save test data
    const testData = {
        'November-2025': {
            comments: 'TEST ' + Date.now()
        }
    };
    
    console.log('💾 Saving...');
    await window.DatabaseAPI.updateProject(project.id, {
        monthlyProgress: JSON.stringify(testData)
    });
    
    // Wait and verify
    await new Promise(r => setTimeout(r, 1000));
    
    const verify = await window.DatabaseAPI.getProject(project.id);
    const saved = verify?.data?.project || verify?.project;
    const progress = typeof saved.monthlyProgress === 'string' 
        ? JSON.parse(saved.monthlyProgress) 
        : saved.monthlyProgress;
    
    const savedComment = progress['November-2025']?.comments;
    const expected = testData['November-2025'].comments;
    
    if (savedComment === expected) {
        console.log('✅✅✅ SUCCESS! Data persisted!');
        console.log('Saved:', savedComment);
    } else {
        console.log('❌ FAILED!');
        console.log('Expected:', expected);
        console.log('Got:', savedComment);
    }
}

// Run it
testPersistence();
```

### Step 3: Check Results
- ✅ If you see "SUCCESS! Data persisted!" - persistence is working
- ❌ If you see "FAILED!" - check the error messages

## Alternative: Test in Progress Tracker UI

1. Go to Projects page
2. Click "Progress Tracker" button
3. Click any cell in the table
4. Type something (e.g., "test 123")
5. Wait 1 second (auto-save) or click away
6. **Check browser console** - you should see:
   - `💾 ProjectProgressTracker: Saving progress data:`
   - `✅ ProjectProgressTracker: API update response:`
7. Reload the page
8. Open Progress Tracker again
9. Check if your text is still there

## What to Look For

### In Console (when saving):
- `💾 ProjectProgressTracker: Saving progress data:` - Save started
- `✅ ProjectProgressTracker: API update response:` - Save completed
- `✅ ProjectProgressTracker: Updating local state` - State updated

### If It's Not Working:
1. Check Network tab - look for PUT request to `/api/projects/[id]`
2. Check if request returns 200 status
3. Check response body - should contain `monthlyProgress`
4. Check for errors in console

## Direct API Test (if UI doesn't work)

Open browser console and run:

```javascript
// Get your auth token
const token = localStorage.getItem('token') || localStorage.getItem('accessToken');

// Get projects
fetch('/api/projects', {
    headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
    const project = (data.data?.projects || data.projects || [])[0];
    console.log('Project:', project);
    
    // Save test data
    return fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            monthlyProgress: JSON.stringify({
                'November-2025': { comments: 'DIRECT TEST ' + Date.now() }
            })
        })
    });
})
.then(r => r.json())
.then(result => {
    console.log('✅ Save result:', result);
    console.log('Now reload page and check Progress Tracker');
});
```






