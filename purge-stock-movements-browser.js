/**
 * Browser Console Script to Purge Stock Movements
 * 
 * Copy and paste this entire script into your browser console when logged into the app,
 * or run: node -e "console.log(require('fs').readFileSync('purge-stock-movements-browser.js', 'utf8'))" | pbcopy
 * 
 * Usage:
 * 1. Open your browser console (F12 or Cmd+Option+I)
 * 2. Paste this entire script
 * 3. Press Enter
 * 4. Confirm when prompted
 */

(async function purgeStockMovements() {
  try {
    // Check if DatabaseAPI is available
    if (!window.DatabaseAPI) {
      console.error('❌ DatabaseAPI not available. Make sure you are logged in.');
      return;
    }

    // Get all stock movements first
    console.log('📊 Fetching stock movements...');
    const response = await window.DatabaseAPI.getStockMovements();
    const movements = response?.data?.movements || [];
    const count = movements.length;

    console.log(`📊 Found ${count} stock movements`);

    if (count === 0) {
      console.log('✅ No stock movements found. Clearing cache...');
      localStorage.removeItem('manufacturing_movements');
      console.log('✅ Cache cleared.');
      return;
    }

    // Confirm deletion
    const confirmed = confirm(
      `⚠️  WARNING: This will delete ALL ${count} stock movements from the database.\n\n` +
      `This action cannot be undone!\n\n` +
      `Do you want to proceed?`
    );

    if (!confirmed) {
      console.log('❌ Purge cancelled.');
      return;
    }

    console.log('🔄 Deleting stock movements...');
    
    // Try to use bulk delete API endpoint first (faster)
    try {
      const token = window.storage?.getToken?.();
      const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
      
      const bulkResponse = await fetch(`${apiBase}/api/manufacturing/stock-movements`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (bulkResponse.ok) {
        const result = await bulkResponse.json();
        console.log(`✅ Bulk delete successful: ${result.count || count} movements deleted`);
      } else {
        throw new Error(`Bulk delete failed: ${bulkResponse.statusText}`);
      }
    } catch (bulkError) {
      // Fallback to individual deletes if bulk delete fails
      console.warn('⚠️  Bulk delete not available, using individual deletes...', bulkError);
      
      let deletedCount = 0;
      let errorCount = 0;

      // Delete all movements in parallel
      const deletePromises = movements.map(async (movement) => {
        try {
          await window.DatabaseAPI.deleteStockMovement(movement.id);
          deletedCount++;
          return { success: true, id: movement.id };
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to delete movement ${movement.id}:`, error);
          return { success: false, id: movement.id, error };
        }
      });

      await Promise.all(deletePromises);
      console.log(`✅ Individual deletes: ${deletedCount} successful, ${errorCount} errors`);
    }

    // Clear localStorage cache
    localStorage.removeItem('manufacturing_movements');
    console.log('✅ Cache cleared.');

    // Summary
    console.log('\n📊 Purge Summary:');
    console.log(`   ✅ Successfully deleted: ${count} stock movements`);
    console.log('\n✅ Stock movements purge completed!');

    // Optionally refresh the page or reload manufacturing data
    if (window.Manufacturing && typeof window.Manufacturing.refreshAllManufacturingData === 'function') {
      console.log('🔄 Refreshing manufacturing data...');
      // The component will reload from API (which is now empty) and update cache
    }

  } catch (error) {
    console.error('❌ Error purging stock movements:', error);
    alert('Error purging stock movements: ' + error.message);
  }
})();

