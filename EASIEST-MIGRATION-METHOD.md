# 🎯 EASIEST Way to Run Migration

Since the server is running, here's the simplest method:

## Method 1: Browser Console (Fastest) ⚡

1. **Open your application** in the browser (where you're logged in)

2. **Open Browser Console** (Press F12, then click "Console" tab)

3. **Paste and run this code:**
   ```javascript
   const token = window.storage?.getToken();
   fetch('/api/run-location-migration', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${token}`
     }
   })
   .then(r => r.json())
   .then(data => {
     console.log('✅ Migration Result:', data);
     alert('Migration complete! Check console for details.\n\nRestart your server to see changes.');
   })
   .catch(err => {
     console.error('❌ Error:', err);
     alert('Migration failed. Check console for details.');
   });
   ```

4. **Check the console** - you should see migration results

5. **Restart your server** to apply changes

## Method 2: Migration HTML Page

1. **Open** `migration-browser.html` in your browser (I've created this file)

2. **Click "Run Migration"** button

3. **Follow the instructions** on screen

## Method 3: Direct API Call (Command Line)

If you have your auth token:

```bash
curl -X POST http://localhost:3000/api/run-location-migration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

**✅ All code is ready!** Just run the migration through one of these methods, then restart your server. The multi-location inventory feature will be active!

