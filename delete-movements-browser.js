/**
 * Browser Console Script to Delete Specific Stock Movements
 * 
 * Usage:
 * 1. Open browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire script
 * 3. Update the movementIds array with the IDs you want to delete
 * 4. Press Enter
 */

(async function deleteSpecificMovements() {
  // ⚠️ UPDATE THESE IDs WITH THE ONES YOU WANT TO DELETE
  const movementIds = [
    'cmhekkpro0003rbqgof3r5c4i',
    'cmhekkoc50001rbqgfbtjwhp4'
  ];

  try {
    if (!window.DatabaseAPI) {
      console.error('❌ DatabaseAPI not available. Make sure you are logged in.');
      return;
    }

    if (movementIds.length === 0) {
      console.error('❌ No movement IDs provided. Please update the movementIds array.');
      return;
    }

    console.log(`🗑️  Deleting ${movementIds.length} stock movement(s)...`);
    console.log('📋 IDs to delete:', movementIds);
    
    const confirmed = confirm(
      `⚠️  WARNING: This will delete ${movementIds.length} stock movement(s).\n\n` +
      `This action cannot be undone!\n\n` +
      `Do you want to proceed?`
    );

    if (!confirmed) {
      console.log('❌ Deletion cancelled.');
      return;
    }

    console.log('🔄 Deleting movements...');
    
    const token = window.storage?.getToken?.();
    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
    
    const results = [];
    
    // Delete each movement
    for (const id of movementIds) {
      try {
        console.log(`🔄 Deleting movement: ${id}...`);
        
        const response = await fetch(`${apiBase}/api/manufacturing/stock-movements/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          results.push({ success: true, id });
          console.log(`✅ Successfully deleted: ${id}`);
        } else {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        results.push({ success: false, id, error: error.message });
        console.error(`❌ Failed to delete ${id}:`, error);
      }
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n📊 Summary:');
    console.log(`   ✅ Successfully deleted: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed IDs:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.id}: ${r.error}`);
      });
    }

    // Clear cache and reload
    localStorage.removeItem('manufacturing_movements');
    console.log('✅ Cache cleared.');
    
    // Reload movements if possible
    if (typeof window.DatabaseAPI.getStockMovements === 'function') {
      console.log('🔄 Reloading movements...');
      const movementsResponse = await window.DatabaseAPI.getStockMovements();
      const movementsData = movementsResponse?.data?.movements || [];
      console.log(`✅ Reloaded ${movementsData.length} movements from database.`);
    }

    console.log('\n✅ Deletion complete!');
    
    if (successful > 0) {
      alert(`✅ Successfully deleted ${successful} stock movement(s)!`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error deleting stock movements: ' + error.message);
  }
})();

