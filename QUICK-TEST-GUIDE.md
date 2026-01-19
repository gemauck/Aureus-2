# Quick Test Guide - Run Browser Tests

## ⚡ Quick Start (3 Steps)

1. **Log in** to https://abcoafrica.co.za
2. **Open Console** (Press F12, then click "Console" tab)
3. **Copy & Paste** the script below and press Enter

## 📋 Test Script (Copy This)

```javascript
// Copy the entire contents of test-projects-browser.js file here
// Or use this direct link to load it:
```

## 🔗 Alternative: Load Script from File

If you have the file locally, you can load it directly:

```javascript
fetch('/test-projects-browser.js')
  .then(r => r.text())
  .then(eval)
  .catch(() => {
    // If file not found, copy the script manually
    console.log('Please copy the script from test-projects-browser.js file');
  });
```

## 📝 Manual Test (If Script Doesn't Work)

1. **Create Project**:
   - Go to Projects section
   - Click "New Project"
   - Fill in details and save
   - ✅ Verify: Project appears in list

2. **Create Task**:
   - Open project
   - Click "Add Task"
   - Fill in task details and save
   - ✅ Verify: Task appears in list

3. **Add Comment**:
   - Open task
   - Go to Comments tab
   - Add a comment
   - ✅ Verify: Comment appears

4. **Refresh Page**:
   - Press F5 or Ctrl+R
   - ✅ Verify: All data still present

5. **Check Console**:
   - Open Console (F12)
   - ✅ Verify: No red errors

## 🎯 Expected Results

After running the test script, you should see:

```
🧪 Starting Projects Browser Tests...

✅ DatabaseAPI Available
✅ Get Projects List
✅ Create Project
✅ Get Single Project
✅ Create Task
✅ Get Tasks for Project
✅ Update Task
✅ Create Task Comment
✅ Get Task Comments
✅ Update Task Comment
✅ Data Persistence (Tasks)
✅ Data Persistence (Comments)
✅ Update Project
✅ Delete Task Comment
✅ Delete Task
✅ Delete Project

============================================================
📊 TEST SUMMARY
============================================================
✅ Passed: 15
❌ Failed: 0
📈 Total:  15
📉 Success Rate: 100.0%
```

## 🐛 Troubleshooting

**If tests fail:**
- Check you're logged in
- Check browser console for errors
- Check Network tab for failed API calls
- Verify server is running: `ssh root@165.22.127.196 'pm2 status'`

**If DatabaseAPI is undefined:**
- Make sure you're logged in
- Refresh the page
- Check that you're on the correct URL

---

**Ready to test?** Just log in, open console, and paste the script!











