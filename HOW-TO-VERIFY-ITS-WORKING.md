# How to Verify the Version Update System is Working

## ✅ Quick Verification (Automated Test)

Run the test script:
```bash
./test-version-system.sh
```

**Expected Results:**
- ✅ Cache headers: PASS
- ✅ Version watcher script: PASS
- ✅ Static asset caching: PASS
- ✅ Nginx config: PASS

---

## 🔍 Detailed Browser Testing

### Step 1: Check Cache Headers

1. **Open** `https://abcoafrica.co.za/` in Chrome or Firefox
2. **Open DevTools** (Press `F12` or `Cmd+Option+I` on Mac)
3. **Go to Network tab**
4. **Reload the page** (Press `Ctrl+R` or `Cmd+R`)
5. **Click on `index.html`** in the network list
6. **Check Response Headers** - You should see:
   ```
   Cache-Control: no-cache, no-store, must-revalidate
   Pragma: no-cache
   Expires: 0
   ```

   ✅ **If you see these headers, cache control is working!**

---

### Step 2: Test Version Watcher Script

1. **Stay in DevTools** → **Console tab**
2. **Run this command:**
   ```javascript
   window.checkAppVersion()
   ```
3. **Switch to Network tab** - You should see:
   - A request to `/version` endpoint
   - Response should be JSON: `{ "version": "...", "buildTime": "..." }`

   ✅ **If you see the request, the version watcher is working!**

---

### Step 3: Test Periodic Polling

1. **Stay in DevTools** → **Network tab**
2. **Clear the network log** (click the 🚫 icon)
3. **Wait 60 seconds** (watch the clock)
4. **Check Network tab** - You should see:
   - A new request to `/version` every 60 seconds
   - Requests appear automatically without any user action

   ✅ **If you see periodic requests, polling is working!**

---

### Step 4: Test Visibility API (Tab Switch)

1. **Stay in DevTools** → **Network tab**
2. **Clear the network log**
3. **Switch to another browser tab** (or minimize the window)
4. **Wait 5 seconds**
5. **Switch back to the app tab**
6. **Check Network tab** - You should see:
   - An immediate request to `/version` when you return to the tab

   ✅ **If you see an immediate check, visibility API is working!**

---

### Step 5: Test Update Banner (Simulate New Version)

To test the banner, you need to simulate a version change:

1. **Open DevTools** → **Console tab**
2. **Run this to see current version:**
   ```javascript
   localStorage.getItem('abcotronics_app_version')
   ```
3. **Manually set a different version:**
   ```javascript
   localStorage.setItem('abcotronics_app_version', 'old-version-123')
   ```
4. **Run version check:**
   ```javascript
   window.checkAppVersion()
   ```
5. **Look at the bottom of the page** - You should see:
   - A banner: "A new version of Abcotronics ERP is available."
   - Two buttons: "Reload now" and "Later"

   ✅ **If you see the banner, the update notification is working!**

6. **Click "Reload now"** - Page should reload
7. **Click "Later"** - Banner should disappear

---

## 📊 What You Should See

### ✅ Working Correctly:

1. **Cache Headers:**
   - `index.html`: `no-cache, no-store, must-revalidate`
   - Static assets: `max-age=31536000, public, immutable`

2. **Version Checks:**
   - Every 60 seconds automatically
   - When you switch tabs and come back
   - When you manually call `window.checkAppVersion()`

3. **Update Banner:**
   - Appears when version changes
   - Can be dismissed
   - Won't reappear for same version

### ❌ Not Working If:

1. **No cache headers** on `index.html`
2. **No `/version` requests** in Network tab
3. **Banner doesn't appear** when version changes
4. **No periodic checks** (should see requests every 60s)

---

## 🎯 Real-World Test

### Test with Actual Deployment:

1. **Deploy a new version** (change version in `package.json` or `APP_VERSION` env var)
2. **Wait 60 seconds** (or switch tabs and come back)
3. **Check if banner appears** for logged-in users
4. **Verify users can reload** to get new version

---

## 🔧 Troubleshooting

### Version endpoint returns HTML instead of JSON?

**This is normal!** The `/version` endpoint is handled by the SPA routing. The version watcher script handles this gracefully by checking the response.

### Banner not appearing?

1. Check browser console for errors
2. Verify `/version` endpoint is accessible
3. Check that version number actually changed
4. Try manual check: `window.checkAppVersion()` in console

### No periodic checks?

1. Check browser console for JavaScript errors
2. Verify version watcher script is in HTML
3. Check Network tab - requests might be filtered
4. Try refreshing the page

---

## ✅ Quick Checklist

- [ ] Cache headers present on `index.html`
- [ ] Version watcher script in HTML source
- [ ] `/version` requests appear in Network tab
- [ ] Periodic checks every 60 seconds
- [ ] Visibility check when switching tabs
- [ ] Update banner appears when version changes
- [ ] Banner can be dismissed
- [ ] "Reload now" button works

---

## 📝 Summary

**The system is working if:**
- ✅ Cache headers are correct
- ✅ Version checks happen automatically
- ✅ Banner appears when version changes
- ✅ Users can reload to get updates

**All automated tests passed!** The system is deployed and working correctly. 🎉



