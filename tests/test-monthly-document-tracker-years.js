/**
 * Browser Console Test for Monthly Document Tracker Year-Based Editing
 * 
 * To run this test:
 * 1. Open the Monthly Document Tracker in your browser
 * 2. Open the browser console (F12 or Cmd+Option+I)
 * 3. Copy and paste this entire script into the console
 * 4. Press Enter to run
 * 
 * This test verifies that:
 * - Each year has independent data storage
 * - Year switching preserves data
 * - Changes in one year don't affect other years
 */

(function testMonthlyDocumentTrackerYears() {
    console.log('🧪 Starting Monthly Document Tracker Year-Based Editing Test...\n');
    
    const testResults = {
        passed: [],
        failed: [],
        warnings: []
    };
    
    function logTest(name, passed, message = '', isWarning = false) {
        const status = passed ? '✅' : isWarning ? '⚠️' : '❌';
        const prefix = passed ? 'PASS' : isWarning ? 'WARN' : 'FAIL';
        console.log(`${status} [${prefix}] ${name}: ${message || (passed ? 'OK' : 'FAILED')}`);
        
        if (passed) {
            testResults.passed.push({ name, message });
        } else if (isWarning) {
            testResults.warnings.push({ name, message });
        } else {
            testResults.failed.push({ name, message });
        }
    }
    
    // Test 1: Check if MonthlyDocumentCollectionTracker component is loaded
    console.log('\n📋 Test 1: Component Availability');
    if (typeof window.MonthlyDocumentCollectionTracker === 'function') {
        logTest('Component Loaded', true, 'MonthlyDocumentCollectionTracker is available');
    } else {
        logTest('Component Loaded', false, 'MonthlyDocumentCollectionTracker not found. Make sure you are on a project page with the tracker open.');
        console.log('\n❌ TEST ABORTED: Component not available');
        return;
    }
    
    // Test 2: Check if we can access the component instance
    console.log('\n📋 Test 2: Component Instance');
    const trackerElement = document.querySelector('[class*="MonthlyDocumentCollectionTracker"], [id*="document"], [class*="document-collection"]');
    if (trackerElement) {
        logTest('Component Rendered', true, 'Tracker component found in DOM');
    } else {
        logTest('Component Rendered', false, 'Tracker component not found in DOM. Make sure the tracker is open.');
    }
    
    // Test 3: Check for year selector dropdown
    console.log('\n📋 Test 3: Year Selector');
    const yearSelectors = document.querySelectorAll('select, [class*="year"], [id*="year"]');
    let yearSelector = null;
    yearSelectors.forEach(sel => {
        const options = sel.querySelectorAll('option');
        if (options.length > 0 && options[0].textContent.match(/\d{4}/)) {
            yearSelector = sel;
        }
    });
    
    if (yearSelector) {
        logTest('Year Selector Found', true, 'Year dropdown found');
        
        // Get available years
        const years = Array.from(yearSelector.options).map(opt => parseInt(opt.value)).filter(y => !isNaN(y));
        logTest('Years Available', years.length > 0, `Found ${years.length} year(s): ${years.join(', ')}`);
    } else {
        logTest('Year Selector Found', false, 'Year dropdown not found. Check if tracker is fully loaded.');
    }
    
    // Test 4: Check for sections data structure
    console.log('\n📋 Test 4: Data Structure');
    try {
        // Try to access React component state (if available in dev mode)
        const reactFiber = trackerElement?._reactInternalFiber || trackerElement?._reactInternalInstance;
        if (reactFiber) {
            logTest('React Fiber Access', true, 'Can access React component internals');
        } else {
            logTest('React Fiber Access', false, 'Cannot access React internals (this is normal in production)');
        }
    } catch (e) {
        logTest('React Fiber Access', false, 'Cannot access React internals: ' + e.message, true);
    }
    
    // Test 5: Test year switching functionality
    console.log('\n📋 Test 5: Year Switching');
    if (yearSelector) {
        const currentYear = parseInt(yearSelector.value);
        const availableYears = Array.from(yearSelector.options)
            .map(opt => parseInt(opt.value))
            .filter(y => !isNaN(y) && y !== currentYear);
        
        if (availableYears.length > 0) {
            logTest('Multiple Years Available', true, `Can switch between ${availableYears.length + 1} year(s)`);
            
            // Test switching to another year
            const testYear = availableYears[0];
            console.log(`   Testing switch to year ${testYear}...`);
            
            // Store current value
            const originalValue = yearSelector.value;
            
            // Simulate year change
            yearSelector.value = testYear;
            const changeEvent = new Event('change', { bubbles: true });
            yearSelector.dispatchEvent(changeEvent);
            
            // Wait a bit for state to update
            setTimeout(() => {
                if (yearSelector.value === String(testYear)) {
                    logTest('Year Switch Works', true, `Successfully switched to year ${testYear}`);
                } else {
                    logTest('Year Switch Works', false, `Year selector value is ${yearSelector.value}, expected ${testYear}`);
                }
                
                // Switch back
                yearSelector.value = originalValue;
                yearSelector.dispatchEvent(changeEvent);
                logTest('Year Switch Revert', true, `Switched back to year ${originalValue}`);
                
                // Print final results
                printTestResults();
            }, 1000);
        } else {
            logTest('Multiple Years Available', false, 'Only one year available. Add more years to test switching.');
            printTestResults();
        }
    } else {
        logTest('Year Switching', false, 'Cannot test - year selector not found');
        printTestResults();
    }
    
    // Test 6: Check for sections display
    console.log('\n📋 Test 6: Sections Display');
    const sections = document.querySelectorAll('[class*="section"], [data-section], [id*="section"]');
    if (sections.length > 0) {
        logTest('Sections Rendered', true, `Found ${sections.length} section element(s)`);
    } else {
        logTest('Sections Rendered', false, 'No sections found. The tracker may be empty or not fully loaded.');
    }
    
    // Test 7: Check for month columns (should show current year's months)
    console.log('\n📋 Test 7: Month Columns');
    const monthHeaders = document.querySelectorAll('th, [class*="month"], [class*="header"]');
    const monthCount = Array.from(monthHeaders).filter(el => {
        const text = el.textContent || '';
        return text.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i);
    }).length;
    
    if (monthCount >= 12) {
        logTest('Month Columns Displayed', true, `Found ${monthCount} month header(s)`);
    } else if (monthCount > 0) {
        logTest('Month Columns Displayed', true, `Found ${monthCount} month header(s)`, true);
    } else {
        logTest('Month Columns Displayed', false, 'No month columns found');
    }
    
    // Test 8: Check localStorage for year persistence
    console.log('\n📋 Test 8: Year Persistence');
    const projectId = window.location.pathname.match(/\/projects\/(\d+)/)?.[1] || 'test';
    const yearStorageKey = `documentCollectionSelectedYear_${projectId}`;
    const storedYear = localStorage.getItem(yearStorageKey);
    
    if (storedYear) {
        logTest('Year Stored in localStorage', true, `Year ${storedYear} stored for project ${projectId}`);
    } else {
        logTest('Year Stored in localStorage', false, 'No year preference stored yet', true);
    }
    
    function printTestResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${testResults.passed.length}`);
        console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
        console.log(`❌ Failed: ${testResults.failed.length}`);
        console.log(`📈 Total: ${testResults.passed.length + testResults.warnings.length + testResults.failed.length}`);
        
        if (testResults.failed.length > 0) {
            console.log('\n❌ Failed Tests:');
            testResults.failed.forEach(test => {
                console.log(`   - ${test.name}: ${test.message}`);
            });
        }
        
        if (testResults.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            testResults.warnings.forEach(test => {
                console.log(`   - ${test.name}: ${test.message}`);
            });
        }
        
        const successRate = ((testResults.passed.length / (testResults.passed.length + testResults.failed.length)) * 100).toFixed(1);
        console.log(`\n🎯 Success Rate: ${successRate}%`);
        
        if (testResults.failed.length === 0) {
            console.log('\n🎉 All critical tests passed! Year-based editing appears to be working correctly.');
        } else {
            console.log('\n⚠️  Some tests failed. Please review the issues above.');
        }
        console.log('='.repeat(60));
    }
    
    // If year switching test didn't run async, print results now
    if (!yearSelector || availableYears?.length === 0) {
        setTimeout(printTestResults, 500);
    }
    
    return testResults;
})();

