# 🚀 Run Migration in Browser Console

**This is the EASIEST and FASTEST method!**

## Steps:

1. **Open your application** in the browser where you're **logged in as admin**

2. **Open Developer Console**:
   - Press **F12** (or right-click → Inspect)
   - Click on the **"Console"** tab

3. **Copy and paste this code**, then press Enter:

```javascript
(async function runMigration() {
  console.log('🔧 Starting migration...');
  
  // Get auth token
  const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token');
  
  if (!token || token === 'null' || token === 'undefined') {
    console.error('❌ Not logged in. Please log in first!');
    alert('❌ Not logged in!\n\nPlease log in to the application first, then run this again.');
    return;
  }
  
  console.log('✅ Token found');
  console.log('📡 Calling migration API...');
  
  try {
    const response = await fetch('/api/run-location-migration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅✅✅ Migration completed successfully! ✅✅✅');
      console.log('\n📊 Migration Steps:');
      
      if (result.results && result.results.steps) {
        result.results.steps.forEach((step, i) => {
          const icon = step.status === 'success' ? '✅' : 
                      step.status === 'warning' ? '⚠️' : 
                      step.status === 'already exists' ? 'ℹ️' : '❌';
          console.log(`${icon} Step ${step.step}: ${step.action} - ${step.status}`);
          if (step.assigned) console.log(`   → Assigned ${step.assigned} items to Main Warehouse`);
          if (step.created) console.log(`   → Created Main Warehouse (LOC001)`);
        });
      }
      
      console.log('\n📋 Next steps:');
      console.log('   1. Restart your server');
      console.log('   2. Go to Manufacturing → Inventory Tab');
      console.log('   3. You should see a location selector dropdown');
      
      alert('✅ Migration completed successfully!\n\nCheck console for details.\n\nRemember to restart your server!');
    } else {
      throw new Error(result.error || result.message || 'Migration failed');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    alert('❌ Migration failed: ' + error.message + '\n\nCheck console for details.');
  }
})();
```

4. **Check the console output** - you'll see detailed results

5. **Restart your server** after successful migration

---

## What This Does:

- ✅ Adds `locationId` column to InventoryItem table
- ✅ Creates index for performance  
- ✅ Creates Main Warehouse (LOC001) if it doesn't exist
- ✅ Assigns all existing inventory to Main Warehouse

## Troubleshooting:

**"Not logged in" error:**
- Make sure you're logged in to the application
- Refresh the page and try again

**"Admin access required" error:**
- You need to be logged in as an admin user
- Check your user role in the application

**"Failed to fetch" error:**
- Make sure your server is running
- Check that the API endpoint exists at `/api/run-location-migration`

---

That's it! After migration completes, restart your server and the multi-location inventory feature will be active! 🎉

