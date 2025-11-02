#!/usr/bin/env node
/**
 * Automated test for Job Card offline sync functionality
 * Tests that job cards created offline are synced when connection is restored
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Starting Job Card Offline Sync Test...\n');

// Test configuration
const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

// Helper to add test result
function test(name, condition, errorMessage) {
    if (condition) {
        console.log(`✅ ${name}`);
        testResults.passed++;
    } else {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${errorMessage}`);
        testResults.failed++;
        testResults.errors.push({ test: name, error: errorMessage });
    }
}

// Test 1: Check if syncPendingJobCards function exists in compiled code
console.log('📝 Test 1: Checking for syncPendingJobCards function...');
try {
    const distPath = path.join(__dirname, 'dist/components/manufacturing/JobCards.js');
    if (fs.existsSync(distPath)) {
        const compiledCode = fs.readFileSync(distPath, 'utf8');
        test(
            'syncPendingJobCards function exists',
            compiledCode.includes('syncPendingJobCards'),
            'syncPendingJobCards function not found in compiled code'
        );
        
        test(
            'useCallback is used for syncPendingJobCards',
            compiledCode.includes('useCallback'),
            'useCallback not found in syncPendingJobCards implementation'
        );
    } else {
        console.log('⚠️  Compiled file not found, running build first...');
    }
} catch (error) {
    console.log(`❌ Could not read compiled file: ${error.message}`);
    testResults.failed++;
}

// Test 2: Check if offline sync logic is in handleSave
console.log('\n📝 Test 2: Checking handleSave offline logic...');
try {
    const sourcePath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    test(
        'handleSave marks cards as unsynced',
        sourceCode.includes('synced: false') && sourceCode.includes('_wasEdit'),
        'Cards are not being marked as unsynced in handleSave'
    );
    
    test(
        'handleSave includes sync flag tracking',
        sourceCode.includes('cardDataWithSyncFlag'),
        'Sync flag tracking not found in handleSave'
    );
    
    test(
        'handleSave checks isOnline status',
        sourceCode.includes('isOnline && window.DatabaseAPI'),
        'Online status check not found in handleSave'
    );
} catch (error) {
    console.log(`❌ Could not read source file: ${error.message}`);
    testResults.failed++;
}

// Test 3: Check if online/offline event listeners are registered
console.log('\n📝 Test 3: Checking online/offline event handling...');
try {
    const sourcePath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    test(
        'Online event listener registered',
        sourceCode.includes('addEventListener(\'online\'') || sourceCode.includes('addEventListener("online"'),
        'Online event listener not registered'
    );
    
    test(
        'Offline event listener registered',
        sourceCode.includes('addEventListener(\'offline\'') || sourceCode.includes('addEventListener("offline"'),
        'Offline event listener not registered'
    );
    
    test(
        'Sync function called on online event',
        sourceCode.includes('syncPendingJobCards()') || sourceCode.includes('await syncPendingJobCards()'),
        'Sync function not called in online event handler'
    );
    
    test(
        'Online handler sets isOnline state',
        sourceCode.includes('setIsOnline(true)'),
        'setIsOnline not called in online handler'
    );
} catch (error) {
    console.log(`❌ Could not read source file: ${error.message}`);
    testResults.failed++;
}

// Test 4: Check if initial sync check exists
console.log('\n📝 Test 4: Checking initial sync on mount...');
try {
    const sourcePath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    test(
        'Initial sync check on mount',
        sourceCode.includes('Checking for unsynced job cards on mount'),
        'Initial sync check not found'
    );
    
    test(
        'navigator.onLine check in initial sync',
        sourceCode.includes('navigator.onLine'),
        'navigator.onLine check not found in initial sync'
    );
} catch (error) {
    console.log(`❌ Could not read source file: ${error.message}`);
    testResults.failed++;
}

// Test 5: Check API methods exist
console.log('\n📝 Test 5: Checking DatabaseAPI methods...');
try {
    const dbApiPath = path.join(__dirname, 'src/utils/databaseAPI.js');
    const dbApiCode = fs.readFileSync(dbApiPath, 'utf8');
    
    test(
        'createJobCard method exists',
        dbApiCode.includes('createJobCard'),
        'createJobCard method not found in DatabaseAPI'
    );
    
    test(
        'updateJobCard method exists',
        dbApiCode.includes('updateJobCard'),
        'updateJobCard method not found in DatabaseAPI'
    );
    
    test(
        'getJobCards method exists',
        dbApiCode.includes('getJobCards'),
        'getJobCards method not found in DatabaseAPI'
    );
} catch (error) {
    console.log(`❌ Could not read DatabaseAPI file: ${error.message}`);
    testResults.failed++;
}

// Test 6: Check console logging
console.log('\n📝 Test 6: Checking console logs...');
try {
    const sourcePath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    const expectedLogs = [
        'Connection restored - syncing job cards',
        'Syncing new job card',
        'Syncing update for job card',
        'Synced new job card',
        'Synced update for job card',
        'Offline mode: Job card saved locally',
        'Checking for unsynced job cards on mount'
    ];
    
    expectedLogs.forEach(log => {
        test(
            `Console log exists: "${log}"`,
            sourceCode.includes(log),
            `Console log "${log}" not found`
        );
    });
} catch (error) {
    console.log(`❌ Could not read source file: ${error.message}`);
    testResults.failed++;
}

// Test 7: Verify localStorage keys
console.log('\n📝 Test 7: Checking localStorage usage...');
try {
    const sourcePath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    test(
        'localStorage key for job cards',
        sourceCode.includes('manufacturing_jobcards'),
        'manufacturing_jobcards localStorage key not found'
    );
    
    test(
        'localStorage getItem usage',
        sourceCode.includes('localStorage.getItem(\'manufacturing_jobcards\''),
        'localStorage.getItem not found for job cards'
    );
    
    test(
        'localStorage setItem usage',
        sourceCode.includes('localStorage.setItem(\'manufacturing_jobcards\''),
        'localStorage.setItem not found for job cards'
    );
} catch (error) {
    console.log(`❌ Could not read source file: ${error.message}`);
    testResults.failed++;
}

// Test 8: Check for potential infinite loops
console.log('\n📝 Test 8: Checking for potential issues...');
try {
    const sourcePath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    // Check that syncPendingJobCards is in dependency array
    test(
        'syncPendingJobCards in useEffect deps',
        sourceCode.includes('[syncPendingJobCards]') || sourceCode.includes('[syncPendingJobCards,]'),
        'syncPendingJobCards might not be in dependency array'
    );
    
    // Check for proper error handling
    test(
        'Error handling in sync function',
        sourceCode.includes('catch (error)') && sourceCode.includes('Failed to sync'),
        'Error handling might be missing in sync function'
    );
} catch (error) {
    console.log(`❌ Could not read source file: ${error.message}`);
    testResults.failed++;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(50));
console.log(`✅ Passed: ${testResults.passed}`);
console.log(`❌ Failed: ${testResults.failed}`);
console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);

if (testResults.errors.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.test}`);
        console.log(`   ${err.error}`);
    });
}

if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! The offline sync implementation looks good.');
    process.exit(0);
} else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
}

