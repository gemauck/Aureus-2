# 🚀 ONE-CLICK MIGRATION - DO THIS NOW!

## Step-by-Step (Takes 30 seconds):

### Step 1: Open Your Application
- Open your ERP application in your browser
- **Make sure you're logged in as admin**

### Step 2: Open Browser Console
- Press **F12** (or right-click → Inspect)
- Click the **"Console"** tab at the top

### Step 3: Copy This Code

Copy the ENTIRE code block below:

```javascript
(async()=>{const t=window.storage?.getToken?.()||localStorage.getItem('abcotronics_token');if(!t||t==='null'||t==='undefined'){alert('❌ Not logged in!\n\nPlease log in first, then try again.');return;}console.log('🔧 Starting migration...');try{const r=await fetch('/api/run-location-migration',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${t}`}});const d=await r.json();if(r.ok){console.log('✅✅✅ MIGRATION COMPLETE!');console.log('📊 Steps:',d.results?.steps);d.results?.steps.forEach(s=>console.log(`✅ Step ${s.step}: ${s.action} - ${s.status}`));alert('✅ Migration complete!\n\nRestart your server to see changes.');}else{throw new Error(d.error||d.message||'Migration failed');}}catch(e){console.error('❌ Error:',e);alert('❌ Failed: '+e.message);}})();
```

### Step 4: Paste and Run
1. **Paste** the code into the console
2. **Press Enter**
3. **Wait** for the alert/console message

### Step 5: Check Results
- Look at the console - you should see migration steps
- If you see "✅✅✅ MIGRATION COMPLETE!" - you're done!

### Step 6: Restart Server
- Restart your server
- The multi-location inventory feature will be active!

---

## What This Does:
- ✅ Adds `locationId` column to InventoryItem
- ✅ Creates performance index
- ✅ Creates Main Warehouse (LOC001)
- ✅ Assigns all existing inventory to Main Warehouse

---

## Troubleshooting:

**"Not logged in" error:**
- Make sure you're logged into the application first
- Refresh the page and try again

**"Admin access required" error:**
- You need to be logged in as an admin user
- Check your user role in the application

**"Failed to fetch" error:**
- Make sure your server is running
- Check the server logs for errors

---

**That's it!** Just 6 steps and you're done! 🎉

