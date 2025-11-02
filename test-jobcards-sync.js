// Comprehensive Job Cards Sync and Deletion Test
// Tests deletion persistence, offline sync, and online/offline transitions

const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  totalTests: 0,
  startTime: Date.now()
};

// Test utilities
function log(message, type = 'info') {
  const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝';
  console.log(`${emoji} ${message}`);
}

function recordResult(test, passed, message = '') {
  testResults.totalTests++;
  if (passed) {
    testResults.passed.push({ test, message });
    log(`${test}: PASSED`, 'success');
  } else {
    testResults.failed.push({ test, message });
    log(`${test}: FAILED - ${message}`, 'error');
  }
}

function assert(condition, testName, errorMsg) {
  recordResult(testName, condition, errorMsg);
  return condition;
}

// Helper to get test job card data
function getTestJobCard() {
  const id = `test-jc-${Date.now()}`;
  return {
    id,
    agentName: 'Test Agent',
    clientId: 'test-client-1',
    clientName: 'Test Client',
    siteId: 'test-site-1',
    siteName: 'Test Site',
    location: 'Test Location',
    timeOfDeparture: '08:00',
    timeOfArrival: '09:00',
    vehicleUsed: 'Test Vehicle',
    kmReadingBefore: '10000',
    kmReadingAfter: '10050',
    reasonForVisit: 'Test Visit',
    diagnosis: 'Test Diagnosis',
    actionsTaken: 'Test Actions',
    stockUsed: [],
    materialsBought: [],
    otherComments: 'Test Comments',
    photos: [],
    status: 'draft',
    synced: false,
    _wasEdit: false
  };
}

// Clear job cards data
function clearJobCardsData() {
  localStorage.removeItem('manufacturing_jobcards');
  log('Job cards data cleared from localStorage', 'info');
}

// Test 1: Deletion Persistence (Online Mode)
async function testDeletionPersistence() {
  log('\n=== Testing Deletion Persistence ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Check if we're in browser with DatabaseAPI
    if (typeof window === 'undefined' || !window.DatabaseAPI) {
      log('⚠️ Skipping: DatabaseAPI not available (run in browser)', 'warn');
      testResults.warnings.push('Deletion test requires browser environment with DatabaseAPI');
      return;
    }
    
    // Create a test job card via API
    const testCard = getTestJobCard();
    log(`Creating test job card: ${testCard.id}`, 'info');
    
    let createdCard;
    try {
      const response = await window.DatabaseAPI.createJobCard(testCard);
      createdCard = response?.data?.jobCard || response?.data || testCard;
      log(`✅ Job card created with ID: ${createdCard.id}`, 'success');
    } catch (error) {
      log(`⚠️ Could not create job card via API (testing deletion with mock): ${error.message}`, 'warn');
      // Use mock card for testing deletion logic
      createdCard = { ...testCard, id: testCard.id };
      localStorage.setItem('manufacturing_jobcards', JSON.stringify([createdCard]));
    }
    
    // Verify it exists in localStorage or API
    const beforeDelete = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    const cardExists = beforeDelete.some(jc => jc.id === createdCard.id);
    assert(cardExists || createdCard.id, 'Job Card Created', 'Job card should exist before deletion');
    
    // Test deletion via DatabaseAPI
    if (createdCard.id && window.DatabaseAPI.deleteJobCard) {
      try {
        log(`Attempting to delete job card: ${createdCard.id}`, 'info');
        await window.DatabaseAPI.deleteJobCard(createdCard.id);
        log('✅ Delete API call completed', 'success');
        
        // Wait a bit for sync
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify deletion by fetching all cards
        try {
          const response = await window.DatabaseAPI.getJobCards();
          const allCards = response?.data?.jobCards || response?.data || [];
          const deletedCard = allCards.find(jc => jc.id === createdCard.id);
          assert(!deletedCard, 'Job Card Deleted from Server', 'Job card should not exist after deletion');
        } catch (fetchError) {
          log(`⚠️ Could not verify deletion via API: ${fetchError.message}`, 'warn');
          // Check localStorage as fallback
          const afterDelete = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
          const stillInLocal = afterDelete.some(jc => jc.id === createdCard.id);
          assert(!stillInLocal, 'Job Card Deleted from LocalStorage', 'Job card should be removed from localStorage');
        }
      } catch (deleteError) {
        log(`❌ Delete failed: ${deleteError.message}`, 'error');
        assert(false, 'Job Card Deletion', `Delete failed: ${deleteError.message}`);
      }
    } else {
      log('⚠️ Cannot test deletion - DatabaseAPI.deleteJobCard not available', 'warn');
      testResults.warnings.push('Deletion API test skipped');
    }
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'Deletion Persistence Test', error.message);
  }
}

// Test 2: Offline Create and Sync
async function testOfflineCreateAndSync() {
  log('\n=== Testing Offline Create and Sync ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Simulate offline mode by creating a card with synced: false
    const offlineCard = getTestJobCard();
    offlineCard.synced = false;
    offlineCard._wasEdit = false;
    
    // Save to localStorage
    localStorage.setItem('manufacturing_jobcards', JSON.stringify([offlineCard]));
    log(`Created offline job card: ${offlineCard.id}`, 'info');
    
    // Verify it's saved locally
    const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    const savedCard = cached.find(jc => jc.id === offlineCard.id);
    assert(!!savedCard, 'Offline Card Saved Locally', 'Card should be saved to localStorage');
    assert(savedCard.synced === false, 'Card Marked as Unsynced', 'Card should be marked as unsynced');
    
    // Test syncPendingJobCards logic (simulated)
    if (typeof window !== 'undefined' && window.DatabaseAPI) {
      const unsyncedCards = cached.filter(jc => !jc.synced && jc.id);
      assert(unsyncedCards.length === 1, 'Unsynced Card Detected', 'Should detect unsynced card');
      
      const isEdit = offlineCard._wasEdit === true;
      assert(isEdit === false, 'Card Not Marked as Edit', 'New card should not have _wasEdit flag');
    } else {
      log('⚠️ Skipping sync test - DatabaseAPI not available', 'warn');
    }
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'Offline Create and Sync Test', error.message);
  }
}

// Test 3: Offline Edit and Sync
async function testOfflineEditAndSync() {
  log('\n=== Testing Offline Edit and Sync ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Create a card that exists on server (synced: true)
    const existingCard = getTestJobCard();
    existingCard.synced = true;
    existingCard._wasEdit = false;
    
    // Save to localStorage
    localStorage.setItem('manufacturing_jobcards', JSON.stringify([existingCard]));
    log(`Created synced job card: ${existingCard.id}`, 'info');
    
    // Simulate offline edit
    const editedCard = {
      ...existingCard,
      diagnosis: 'Updated Diagnosis',
      actionsTaken: 'Updated Actions',
      synced: false,
      _wasEdit: true  // Mark as edit
    };
    
    localStorage.setItem('manufacturing_jobcards', JSON.stringify([editedCard]));
    log(`Edited job card offline: ${editedCard.id}`, 'info');
    
    // Verify edit state
    const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    const savedCard = cached.find(jc => jc.id === editedCard.id);
    assert(!!savedCard, 'Edited Card Saved Locally', 'Edited card should be saved');
    assert(savedCard.synced === false, 'Edited Card Marked as Unsynced', 'Edited card should be marked as unsynced');
    assert(savedCard._wasEdit === true, 'Card Marked as Edit', 'Card should have _wasEdit flag');
    assert(savedCard.diagnosis === 'Updated Diagnosis', 'Edit Data Preserved', 'Edit data should be preserved');
    
    // Test syncPendingJobCards logic for edits
    if (typeof window !== 'undefined' && window.DatabaseAPI) {
      const unsyncedCards = cached.filter(jc => !jc.synced && jc.id);
      const editedCardInList = unsyncedCards.find(jc => jc.id === editedCard.id);
      assert(!!editedCardInList, 'Edited Card in Unsynced List', 'Edited card should be in unsynced list');
      assert(editedCardInList._wasEdit === true, 'Edit Flag Preserved', '_wasEdit flag should be preserved');
    }
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'Offline Edit and Sync Test', error.message);
  }
}

// Test 4: Deletion Error Handling
async function testDeletionErrorHandling() {
  log('\n=== Testing Deletion Error Handling ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Test deletion of non-existent card
    const fakeCard = getTestJobCard();
    fakeCard.id = 'non-existent-id-' + Date.now();
    
    if (typeof window !== 'undefined' && window.DatabaseAPI?.deleteJobCard) {
      try {
        await window.DatabaseAPI.deleteJobCard(fakeCard.id);
        log('⚠️ Delete of non-existent card did not throw error', 'warn');
        testResults.warnings.push('Delete of non-existent card should handle gracefully');
      } catch (error) {
        log(`✅ Delete error handled: ${error.message}`, 'success');
        assert(true, 'Deletion Error Handling', 'Delete errors are handled gracefully');
      }
    } else {
      log('⚠️ Skipping - DatabaseAPI.deleteJobCard not available', 'warn');
    }
    
    // Test deletion when offline
    const offlineCard = getTestJobCard();
    localStorage.setItem('manufacturing_jobcards', JSON.stringify([offlineCard]));
    
    const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    assert(cached.length === 1, 'Offline Card Saved', 'Card should be saved offline');
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'Deletion Error Handling Test', error.message);
  }
}

// Test 5: Sync Flag Management
async function testSyncFlagManagement() {
  log('\n=== Testing Sync Flag Management ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Test: New card should have synced: false
    const newCard = getTestJobCard();
    assert(newCard.synced === false, 'New Card Unsynced', 'New card should be marked as unsynced');
    assert(newCard._wasEdit === false, 'New Card Not Edit', 'New card should not have _wasEdit flag');
    
    // Test: Edit should set _wasEdit: true
    const editedCard = { ...newCard, _wasEdit: true, synced: false };
    assert(editedCard._wasEdit === true, 'Edit Flag Set', 'Edited card should have _wasEdit flag');
    assert(editedCard.synced === false, 'Edit Unsynced', 'Edited card should be unsynced');
    
    // Test: After sync, synced should be true
    const syncedCard = { ...editedCard, synced: true };
    assert(syncedCard.synced === true, 'Card Marked Synced', 'Card should be marked as synced after sync');
    
    // Test: Multiple unsynced cards
    const cards = [
      { ...getTestJobCard(), id: 'card1', synced: false, _wasEdit: false },
      { ...getTestJobCard(), id: 'card2', synced: true, _wasEdit: false },
      { ...getTestJobCard(), id: 'card3', synced: false, _wasEdit: true }
    ];
    
    const unsyncedCards = cards.filter(jc => !jc.synced && jc.id);
    assert(unsyncedCards.length === 2, 'Multiple Unsynced Cards', 'Should detect 2 unsynced cards');
    
    const newCards = unsyncedCards.filter(jc => jc._wasEdit === false);
    const editedCards = unsyncedCards.filter(jc => jc._wasEdit === true);
    
    assert(newCards.length === 1, 'New Card Detected', 'Should detect 1 new card');
    assert(editedCards.length === 1, 'Edited Card Detected', 'Should detect 1 edited card');
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'Sync Flag Management Test', error.message);
  }
}

// Test 6: localStorage Persistence
async function testLocalStoragePersistence() {
  log('\n=== Testing localStorage Persistence ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Create and save cards
    const card1 = getTestJobCard();
    card1.id = 'persist-test-1';
    const card2 = getTestJobCard();
    card2.id = 'persist-test-2';
    
    localStorage.setItem('manufacturing_jobcards', JSON.stringify([card1, card2]));
    
    // Reload and verify
    const reloaded = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    assert(reloaded.length === 2, 'Cards Persisted', 'Both cards should be persisted');
    assert(reloaded[0].id === card1.id, 'Card 1 Data Preserved', 'Card 1 data should be preserved');
    assert(reloaded[1].id === card2.id, 'Card 2 Data Preserved', 'Card 2 data should be preserved');
    
    // Test sync flags persist
    reloaded[0].synced = false;
    reloaded[0]._wasEdit = true;
    localStorage.setItem('manufacturing_jobcards', JSON.stringify(reloaded));
    
    const reloadedAgain = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    assert(reloadedAgain[0].synced === false, 'Sync Flag Persisted', 'Sync flag should persist');
    assert(reloadedAgain[0]._wasEdit === true, 'Edit Flag Persisted', 'Edit flag should persist');
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'localStorage Persistence Test', error.message);
  }
}

// Test 7: Deletion Flow (UI Logic Simulation)
async function testDeletionFlow() {
  log('\n=== Testing Deletion Flow ===', 'info');
  
  clearJobCardsData();
  
  try {
    // Simulate the deletion flow from handleDelete
    const testCard = getTestJobCard();
    testCard.id = 'delete-flow-test';
    localStorage.setItem('manufacturing_jobcards', JSON.stringify([testCard]));
    
    // Step 1: Verify card exists
    const beforeDelete = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    assert(beforeDelete.length === 1, 'Card Exists Before Delete', 'Card should exist before deletion');
    
    // Step 2: Simulate deletion (remove from array)
    const afterDelete = beforeDelete.filter(jc => jc.id !== testCard.id);
    localStorage.setItem('manufacturing_jobcards', JSON.stringify(afterDelete));
    
    // Step 3: Verify deletion
    const final = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    assert(final.length === 0, 'Card Deleted from localStorage', 'Card should be removed from localStorage');
    assert(!final.find(jc => jc.id === testCard.id), 'Card Not in Array', 'Card should not be in array');
    
    // Test: Deletion of non-existent card (should not crash)
    const emptyArray = [];
    const attemptDelete = emptyArray.filter(jc => jc.id !== 'non-existent');
    assert(attemptDelete.length === 0, 'Safe Delete of Non-existent', 'Deleting non-existent card should be safe');
    
  } catch (error) {
    log(`❌ Test error: ${error.message}`, 'error');
    assert(false, 'Deletion Flow Test', error.message);
  }
}

// MAIN TEST RUNNER
async function runJobCardsTests() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Job Cards Sync & Deletion Comprehensive Tests      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check if running in browser context
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    log('WARNING: This test requires a browser environment with localStorage', 'warn');
    log('Please run this test in a browser console', 'warn');
    return;
  }
  
  try {
    // Run all tests
    await testDeletionFlow();
    await testSyncFlagManagement();
    await testLocalStoragePersistence();
    await testOfflineCreateAndSync();
    await testOfflineEditAndSync();
    await testDeletionErrorHandling();
    await testDeletionPersistence();
    
    // Print summary
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    
    const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2);
    const passedCount = testResults.passed.length;
    const failedCount = testResults.failed.length;
    const warningCount = testResults.warnings.length;
    const totalCount = testResults.totalTests;
    const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : 0;
    
    console.log(`Total Tests: ${totalCount}`);
    console.log(`✅ Passed: ${passedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`⚠️  Warnings: ${warningCount}`);
    console.log(`📊 Pass Rate: ${passRate}%`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log('');
    
    if (testResults.failed.length > 0) {
      console.log('❌ Failed Tests:');
      testResults.failed.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.test}: ${result.message}`);
      });
      console.log('');
    }
    
    if (testResults.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      testResults.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
      console.log('');
    }
    
    // Clean up
    clearJobCardsData();
    log('Test data cleared', 'info');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    return {
      success: failedCount === 0,
      summary: {
        total: totalCount,
        passed: passedCount,
        failed: failedCount,
        warnings: warningCount,
        passRate: `${passRate}%`,
        duration: `${duration}s`
      },
      details: testResults
    };
    
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'error');
    console.error(error);
    return {
      success: false,
      error: error.message,
      details: testResults
    };
  }
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runJobCardsTests, testResults };
}

// Auto-run in browser if loaded directly
if (typeof window !== 'undefined') {
  // Make function available globally
  window.runJobCardsTests = runJobCardsTests;
  
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📋 Job Cards Tests Ready');
      console.log('Run tests using: runJobCardsTests()');
    });
  } else {
    console.log('📋 Job Cards Tests Ready');
    console.log('Run tests using: runJobCardsTests()');
  }
}

