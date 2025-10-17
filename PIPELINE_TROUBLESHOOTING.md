# 🔧 Pipeline Not Showing - Troubleshooting Guide

## Quick Fix (Try This First!)

### Method 1: Hard Refresh Browser
This clears the browser cache and forces reload of all files.

**Windows/Linux:**
```
Ctrl + Shift + R
```

**Mac:**
```
Cmd + Shift + R
```

### Method 2: Clear Browser Cache
1. Press `F12` to open DevTools
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

### Method 3: Use Incognito/Private Mode
1. Open new Incognito/Private window
2. Navigate to `http://localhost:8000`
3. Login and check if Pipeline appears

---

## Step-by-Step Verification

### Step 1: Check Server is Running
```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
python3 server.py
```

You should see:
```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

### Step 2: Check Files Exist
Run these commands:
```bash
ls -la src/components/clients/Pipeline.jsx
ls -la src/components/clients/PipelineIntegration.js
```

Both should show file size ~41KB and ~2KB

### Step 3: Open Browser DevTools
1. Navigate to `http://localhost:8000`
2. Press `F12` (opens DevTools)
3. Go to **Console** tab

### Step 4: Check for Errors
Look for red error messages in console. Common issues:
- `Failed to load resource: 404` - File not found
- `Unexpected token` - Syntax error in JavaScript
- `Cannot read property` - Missing dependency

### Step 5: Test Pipeline Component
In the browser console, type:
```javascript
console.log(window.Pipeline);
```

**Expected Result:**
```
ƒ Pipeline() { ... }
```

**If you see `undefined`:**
- Pipeline.jsx didn't load
- Check browser Network tab for failed requests
- Verify file path is correct

### Step 6: Test Storage Utilities
In the browser console, type:
```javascript
console.log(window.storage);
```

**Expected Result:**
```
{ getClients: ƒ, getLeads: ƒ, ... }
```

### Step 7: Check Menu Items
In the browser console, type:
```javascript
// Get the MainLayout component state
// Look for 'pipeline' in menuItems
console.log('Pipeline should be in menu');
```

---

## Common Issues & Solutions

### Issue 1: "Pipeline" Menu Item Not Visible

**Symptom:** Don't see "Pipeline" in left sidebar

**Solution:**
1. Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. If still not visible, check browser console for errors
3. Verify MainLayout.jsx was saved correctly

**Check in console:**
```javascript
document.querySelector('button[onClick*="pipeline"]');
// Should return an HTML button element
```

### Issue 2: "Loading Pipeline..." Forever

**Symptom:** Click Pipeline, see "Loading Pipeline..." message

**Solution:**
Check if Pipeline component loaded:
```javascript
console.log(window.Pipeline);
// If undefined, Pipeline.jsx didn't load properly
```

**Fix:**
1. Check Network tab in DevTools
2. Look for `Pipeline.jsx` request
3. If 404, check file path
4. If 200 but still undefined, check for JavaScript errors

### Issue 3: Blank Screen

**Symptom:** Nothing shows when clicking Pipeline

**Solution:**
1. Open browser console
2. Look for error messages
3. Common causes:
   - Missing React dependency
   - Syntax error in Pipeline.jsx
   - localStorage data corruption

**Fix:**
```javascript
// Clear localStorage
localStorage.clear();
// Refresh page
location.reload();
```

### Issue 4: Server Not Running

**Symptom:** Cannot connect to localhost:8000

**Solution:**
```bash
# Stop any running server (Ctrl+C)
# Navigate to project folder
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"

# Start server
python3 server.py

# Should see:
# Serving HTTP on 0.0.0.0 port 8000 ...
```

### Issue 5: Port Already in Use

**Symptom:** Error starting server: "Address already in use"

**Solution:**
```bash
# Find process using port 8000
lsof -i :8000

# Kill the process (replace PID with actual number)
kill -9 [PID]

# Or use different port
python3 server.py 8001
# Then access: http://localhost:8001
```

---

## Diagnostic Tool

Open this file in your browser:
```
/Users/gemau/Documents/Project ERP/abcotronics-erp-modular/diagnose-pipeline.html
```

This will automatically test:
- ✓ Server status
- ✓ File existence
- ✓ React loaded
- ✓ Pipeline component loaded
- ✓ Storage utilities loaded

---

## Manual Debugging Steps

### 1. Check Network Tab
1. Open DevTools (F12)
2. Go to **Network** tab
3. Refresh page
4. Look for `Pipeline.jsx` in the list
5. Check status code (should be 200)
6. Click on it to see file contents

### 2. Check Console for Load Order
Files should load in this order:
```
1. React, ReactDOM, Babel
2. localStorage.js
3. All component files
4. Pipeline.jsx (should be here)
5. MainLayout.jsx
6. App.jsx
```

### 3. Verify React Version
```javascript
console.log(React.version);
// Should be 18.x.x
```

### 4. Check if Babel is Working
```javascript
console.log(typeof Babel);
// Should be 'object'
```

### 5. Test Manual Navigation
In console:
```javascript
// Try to navigate programmatically
window.dispatchEvent(new CustomEvent('navigateToPage', { 
    detail: { page: 'pipeline' } 
}));
```

---

## File Verification Checklist

Run these checks:

### ✓ index.html includes Pipeline scripts
```bash
grep -n "Pipeline.jsx" index.html
```
Should show line number with script tag

### ✓ MainLayout.jsx has Pipeline reference
```bash
grep -n "const Pipeline" src/components/layout/MainLayout.jsx
```
Should show: `const Pipeline = window.Pipeline;`

### ✓ MainLayout.jsx has pipeline menu item
```bash
grep -n "pipeline.*label.*Pipeline" src/components/layout/MainLayout.jsx
```
Should show menu item definition

### ✓ MainLayout.jsx has pipeline case in switch
```bash
grep -n "case 'pipeline'" src/components/layout/MainLayout.jsx
```
Should show switch case for pipeline

---

## Nuclear Option (If Nothing Works)

### 1. Complete Cache Clear
```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
location.reload(true);
```

### 2. Try Different Browser
- Chrome → Try Firefox
- Firefox → Try Chrome
- Both → Try Edge/Safari

### 3. Check File Permissions
```bash
chmod 644 src/components/clients/Pipeline.jsx
chmod 644 src/components/clients/PipelineIntegration.js
chmod 644 src/components/layout/MainLayout.jsx
```

### 4. Restart Computer
Sometimes a fresh start helps!

---

## Still Not Working?

### Check These Files Match Expected Content:

**src/components/clients/Pipeline.jsx**
- Should start with: `// Get dependencies from window`
- Should define: `const Pipeline = () => {`
- Should end with: `window.Pipeline = Pipeline;`
- File size: ~41KB

**src/components/layout/MainLayout.jsx**
- Should have: `const Pipeline = window.Pipeline;`
- Should have menu item: `{ id: 'pipeline', label: 'Pipeline', icon: 'fa-stream' }`
- Should have case: `case 'pipeline': return Pipeline ? <Pipeline /> : ...`

**index.html**
- Should have: `<script type="text/babel" src="./src/components/clients/Pipeline.jsx"></script>`
- Should have: `<script src="./src/components/clients/PipelineIntegration.js"></script>`
- Both lines should be AFTER Clients.jsx and BEFORE Projects components

---

## Get Immediate Help

Run the diagnostic tool:
```bash
open diagnose-pipeline.html
# Or navigate to: http://localhost:8000/diagnose-pipeline.html
```

This will test everything automatically and give you specific error messages.

---

## Console Commands Reference

Useful commands to test in browser console:

```javascript
// Check Pipeline loaded
console.log('Pipeline:', typeof window.Pipeline);

// Check storage loaded  
console.log('Storage:', typeof window.storage);

// Check React loaded
console.log('React:', React.version);

// Get current page
console.log('Current page:', /* would need state access */);

// List all window.* components
Object.keys(window).filter(key => 
    key.endsWith('Modal') || 
    key === 'Dashboard' || 
    key === 'Pipeline' ||
    key === 'Clients'
);

// Force navigation to pipeline
window.dispatchEvent(new CustomEvent('navigateToPage', { 
    detail: { page: 'pipeline' } 
}));
```

---

## Success Indicators

You'll know Pipeline is working when:

1. ✅ "Pipeline" appears in left sidebar (with stream icon 🌊)
2. ✅ Clicking Pipeline shows Kanban board
3. ✅ No errors in browser console
4. ✅ `console.log(window.Pipeline)` shows function
5. ✅ Can switch between Kanban/List/Forecast views

---

**If you followed all steps and Pipeline still doesn't show, the files might not have saved correctly. Try re-creating them manually or let me know the specific error message from the browser console.**
