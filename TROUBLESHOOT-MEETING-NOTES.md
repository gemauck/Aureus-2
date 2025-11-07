# 🔧 Troubleshooting Meeting Notes Not Showing in Browser

## Issue: Component Not Visible in Browser

If you don't see the Meeting Notes tab or component in the browser, follow these steps:

## Quick Checks

### 1. Hard Refresh Browser
**CRITICAL**: Clear browser cache with hard refresh:
- **Windows/Linux**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

### 2. Check Browser Console
Open DevTools (F12) and check for errors:
- Look for red errors
- Check Network tab for failed component loads
- Look for `ManagementMeetingNotes` related errors

### 3. Verify Component is Loaded
In browser console, run:
```javascript
console.log('ManagementMeetingNotes available:', typeof window.ManagementMeetingNotes);
```

Should show: `ManagementMeetingNotes available: function`

## Verification Steps

### Step 1: Check Component File Exists
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
ls -la src/components/teams/ManagementMeetingNotes.jsx
ls -la dist/src/components/teams/ManagementMeetingNotes.js
```

Both files should exist.

### Step 2: Check Component is in Loader
```bash
grep -n "ManagementMeetingNotes" component-loader.js
grep -n "ManagementMeetingNotes" lazy-load-components.js
```

Both should show the component.

### Step 3: Rebuild Components
```bash
npm run build:jsx
pm2 restart abcotronics-erp
```

### Step 4: Verify API Endpoint
Test the API endpoint:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://abcoafrica.co.za/api/meeting-notes
```

Should return JSON (empty array if no notes exist).

## Common Issues & Solutions

### Issue 1: Component Not in Lazy Loader
**Symptom**: Component file exists but not loading

**Solution**:
1. Add to `lazy-load-components.js`:
   ```javascript
   './src/components/teams/ManagementMeetingNotes.jsx',
   ```
2. Rebuild: `npm run build:jsx`
3. Restart: `pm2 restart abcotronics-erp`
4. Hard refresh browser

### Issue 2: Component Built But Not Accessible
**Symptom**: Built file exists but returns 404

**Solution**:
1. Check file permissions:
   ```bash
   chmod 644 dist/src/components/teams/ManagementMeetingNotes.js
   ```
2. Verify server is serving `/dist/` directory
3. Check nginx/server configuration

### Issue 3: Browser Cache
**Symptom**: Old version or component not updating

**Solution**:
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache
3. Try incognito/private window
4. Check if `component-loader.js` has cache-busting

### Issue 4: Component Not Registering
**Symptom**: File loads but `window.ManagementMeetingNotes` is undefined

**Solution**:
1. Check component exports: Should have `window.ManagementMeetingNotes = ManagementMeetingNotes;`
2. Check for JavaScript errors in console
3. Verify React is loaded before component

### Issue 5: Tab Not Showing
**Symptom**: Meeting Notes tab doesn't appear

**Solution**:
1. Verify you're on the **Management** team
2. Check `Teams.jsx` has the tab button:
   ```javascript
   {selectedTeam?.id === 'management' && (
       <button onClick={() => setActiveTab('meeting-notes')}>
           Meeting Notes
       </button>
   )}
   ```
3. Check console for errors

## Debugging Steps

### 1. Check Server Logs
```bash
ssh root@abcoafrica.co.za
pm2 logs abcotronics-erp --lines 50
```

Look for:
- Component loading errors
- API errors
- Database connection errors

### 2. Check Component Loading
In browser console:
```javascript
// Check if component is in window
console.log('Components:', Object.keys(window).filter(k => k.includes('Meeting')));

// Check if component loader ran
console.log('Component loader:', typeof window.loadComponent);

// Manually load component
const script = document.createElement('script');
script.src = '/dist/src/components/teams/ManagementMeetingNotes.js';
script.onload = () => console.log('Component loaded:', typeof window.ManagementMeetingNotes);
document.body.appendChild(script);
```

### 3. Check Network Requests
In browser DevTools Network tab:
1. Filter by "ManagementMeetingNotes"
2. Check if request returns 200
3. Check if content is JavaScript (not HTML)
4. Check response headers

### 4. Verify Database Tables
```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
source .env
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%Meeting%';"
```

Should show 6 tables.

## Quick Fix Script

Run this on the server to fix common issues:

```bash
ssh root@abcoafrica.co.za << 'EOF'
cd /var/www/abcotronics-erp

# Rebuild components
echo "🔨 Rebuilding components..."
npm run build:jsx

# Verify component exists
echo "🔍 Verifying component..."
ls -la dist/src/components/teams/ManagementMeetingNotes.js

# Restart server
echo "🔄 Restarting server..."
pm2 restart abcotronics-erp

# Wait for restart
sleep 3

# Check server status
pm2 status

echo "✅ Fix complete! Now hard refresh your browser (Ctrl+Shift+R)"
EOF
```

## Still Not Working?

If the component still doesn't show:

1. **Check Browser Console** for specific errors
2. **Check Server Logs** for backend errors
3. **Verify Database** tables exist
4. **Test API** endpoint directly
5. **Check Network Tab** for failed requests

## Expected Behavior

When working correctly:
- ✅ Meeting Notes tab appears when Management team is selected
- ✅ Component loads when tab is clicked
- ✅ Monthly goals section appears
- ✅ Can create monthly notes
- ✅ Can add weekly notes
- ✅ All 7 departments are visible

---

**Last Updated**: November 7, 2025

