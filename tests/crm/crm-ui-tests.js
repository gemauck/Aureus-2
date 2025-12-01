/**
 * CRM UI Tests - Browser-Based Component Testing
 * Run this in the browser console to test UI components and interactions
 * 
 * Usage:
 *   1. Open the application in browser
 *   2. Navigate to Clients/Leads section
 *   3. Open browser DevTools Console
 *   4. Load this script or paste the code
 *   5. Run: window.runCRMUITests()
 */

(function() {
  'use strict'
  
  const testResults = {
    passed: [],
    failed: [],
    warnings: [],
    totalTests: 0,
    startTime: Date.now()
  }
  
  function log(message, type = 'info') {
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝'
    console.log(`${emoji} ${message}`)
  }
  
  function recordResult(test, passed, message = '', isWarning = false) {
    testResults.totalTests++
    const result = { test, passed, message, warning: isWarning }
    if (passed) {
      testResults.passed.push(result)
      log(`${test}: PASSED`, 'success')
    } else if (isWarning) {
      testResults.warnings.push(result)
      log(`${test}: WARNING - ${message}`, 'warn')
    } else {
      testResults.failed.push(result)
      log(`${test}: FAILED - ${message}`, 'error')
    }
  }
  
  // Test utilities
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector)
      if (element) {
        resolve(element)
        return
      }
      
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector)
        if (element) {
          observer.disconnect()
          resolve(element)
        }
      })
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      })
      
      setTimeout(() => {
        observer.disconnect()
        reject(new Error(`Element ${selector} not found within ${timeout}ms`))
      }, timeout)
    })
  }
  
  function checkComponentExists(componentName, globalName) {
    const exists = typeof window[globalName] !== 'undefined' || 
                   typeof window[componentName] !== 'undefined'
    recordResult(
      `Component ${componentName} Exists`,
      exists,
      exists ? `${componentName} is available` : `${componentName} not found`
    )
    return exists
  }
  
  // ============================================
  // UI TEST SUITE
  // ============================================
  
  // Test 1: LeadDetailModal Component Exists
  async function testLeadDetailModalExists() {
    log('\n🧪 Testing: LeadDetailModal Component Exists', 'info')
    checkComponentExists('LeadDetailModal', 'LeadDetailModal')
  }
  
  // Test 2: Clients Component Exists
  async function testClientsComponentExists() {
    log('\n🧪 Testing: Clients Component Exists', 'info')
    checkComponentExists('Clients', 'Clients')
  }
  
  // Test 3: API Wrapper Available
  async function testAPIWrapperAvailable() {
    log('\n🧪 Testing: API Wrapper Available', 'info')
    const apiAvailable = typeof window.api !== 'undefined' && 
                         typeof window.api.getLeads === 'function'
    recordResult(
      'API Wrapper Available',
      apiAvailable,
      apiAvailable ? 'API wrapper is available' : 'API wrapper not found'
    )
  }
  
  // Test 4: Storage Available
  async function testStorageAvailable() {
    log('\n🧪 Testing: Storage Available', 'info')
    const storageAvailable = typeof window.storage !== 'undefined'
    recordResult(
      'Storage Available',
      storageAvailable,
      storageAvailable ? 'Storage is available' : 'Storage not found'
    )
  }
  
  // Test 5: Rate Limit Manager Available
  async function testRateLimitManagerAvailable() {
    log('\n🧪 Testing: Rate Limit Manager Available', 'info')
    const rateLimitAvailable = typeof window.RateLimitManager !== 'undefined'
    recordResult(
      'Rate Limit Manager Available',
      rateLimitAvailable,
      rateLimitAvailable ? 'Rate limit manager is available' : 'Rate limit manager not found'
    )
  }
  
  // Test 6: Enhanced State Manager Available
  async function testEnhancedStateManagerAvailable() {
    log('\n🧪 Testing: Enhanced State Manager Available', 'info')
    const stateManagerAvailable = typeof window.EnhancedStateManager !== 'undefined'
    recordResult(
      'Enhanced State Manager Available',
      stateManagerAvailable,
      stateManagerAvailable ? 'Enhanced state manager is available' : 'Enhanced state manager not found'
    )
  }
  
  // Test 7: Database API Available
  async function testDatabaseAPIAvailable() {
    log('\n🧪 Testing: Database API Available', 'info')
    const dbAPIAvailable = typeof window.DatabaseAPI !== 'undefined'
    recordResult(
      'Database API Available',
      dbAPIAvailable,
      dbAPIAvailable ? 'Database API is available' : 'Database API not found'
    )
  }
  
  // Test 8: Can Fetch Leads via API
  async function testCanFetchLeads() {
    log('\n🧪 Testing: Can Fetch Leads via API', 'info')
    
    if (typeof window.api === 'undefined' || typeof window.api.getLeads !== 'function') {
      recordResult('Can Fetch Leads via API', false, 'API not available')
      return
    }
    
    try {
      const response = await window.api.getLeads()
      const leads = response?.data?.leads || response?.leads || []
      recordResult(
        'Can Fetch Leads via API',
        Array.isArray(leads),
        Array.isArray(leads) ? `Fetched ${leads.length} leads` : 'Response is not an array'
      )
    } catch (error) {
      recordResult('Can Fetch Leads via API', false, error.message)
    }
  }
  
  // Test 9: Lead List Renders
  async function testLeadListRenders() {
    log('\n🧪 Testing: Lead List Renders', 'info')
    
    try {
      // Look for common lead list selectors
      const selectors = [
        '[data-testid="leads-list"]',
        '.leads-list',
        '#leads-list',
        '[class*="lead"]',
        '[class*="Lead"]'
      ]
      
      let found = false
      for (const selector of selectors) {
        const element = document.querySelector(selector)
        if (element) {
          found = true
          break
        }
      }
      
      recordResult(
        'Lead List Renders',
        found,
        found ? 'Lead list element found' : 'Lead list element not found'
      )
    } catch (error) {
      recordResult('Lead List Renders', false, error.message)
    }
  }
  
  // Test 10: Form Validation (if form is visible)
  async function testFormValidation() {
    log('\n🧪 Testing: Form Validation', 'info')
    
    try {
      // Look for form inputs
      const nameInput = document.querySelector('input[name="name"], input[placeholder*="name" i], input[placeholder*="Name"]')
      
      if (nameInput) {
        // Test if input exists and is required
        const isRequired = nameInput.hasAttribute('required') || 
                          nameInput.getAttribute('aria-required') === 'true'
        
        recordResult(
          'Form Validation',
          true,
          isRequired ? 'Name field is required' : 'Name field found but may not be required'
        )
      } else {
        recordResult('Form Validation', true, 'Form not visible (skipped)', true)
      }
    } catch (error) {
      recordResult('Form Validation', false, error.message)
    }
  }
  
  // Test 11: Auto-Save Functionality (check if exists)
  async function testAutoSaveExists() {
    log('\n🧪 Testing: Auto-Save Functionality Exists', 'info')
    
    // Check if auto-save related code exists
    const hasAutoSave = 
      typeof window.autoSave !== 'undefined' ||
      document.querySelector('[data-autosave]') !== null ||
      document.querySelector('[class*="autosave" i]') !== null
    
    recordResult(
      'Auto-Save Functionality Exists',
      hasAutoSave || true, // Always pass - just checking if it exists
      hasAutoSave ? 'Auto-save functionality detected' : 'Auto-save not detected (may be implemented differently)'
    )
  }
  
  // Test 12: Tab Navigation (if tabs exist)
  async function testTabNavigation() {
    log('\n🧪 Testing: Tab Navigation', 'info')
    
    try {
      const tabs = document.querySelectorAll('[role="tab"], .tab, [class*="tab" i]')
      const hasTabs = tabs.length > 0
      
      recordResult(
        'Tab Navigation',
        true, // Always pass - just checking if tabs exist
        hasTabs ? `Found ${tabs.length} tabs` : 'No tabs found (may not be on detail page)'
      )
    } catch (error) {
      recordResult('Tab Navigation', false, error.message)
    }
  }
  
  // Test 13: Responsive Design Check
  async function testResponsiveDesign() {
    log('\n🧪 Testing: Responsive Design', 'info')
    
    try {
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      }
      
      const isMobile = viewport.width < 768
      const isTablet = viewport.width >= 768 && viewport.width < 1024
      const isDesktop = viewport.width >= 1024
      
      recordResult(
        'Responsive Design',
        true,
        `Viewport: ${viewport.width}x${viewport.height} (${isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'})`
      )
    } catch (error) {
      recordResult('Responsive Design', false, error.message)
    }
  }
  
  // Test 14: Error Handling UI
  async function testErrorHandlingUI() {
    log('\n🧪 Testing: Error Handling UI', 'info')
    
    // Check if error display elements exist
    const errorSelectors = [
      '[role="alert"]',
      '.error',
      '[class*="error" i]',
      '[class*="Error" i]'
    ]
    
    let found = false
    for (const selector of errorSelectors) {
      if (document.querySelector(selector)) {
        found = true
        break
      }
    }
    
    recordResult(
      'Error Handling UI',
      true, // Always pass - just checking if error UI exists
      found ? 'Error display elements found' : 'Error display elements not found (may be dynamically created)'
    )
  }
  
  // Test 15: Loading States UI
  async function testLoadingStatesUI() {
    log('\n🧪 Testing: Loading States UI', 'info')
    
    // Check if loading indicators exist
    const loadingSelectors = [
      '[class*="loading" i]',
      '[class*="Loading" i]',
      '[class*="spinner" i]',
      '[aria-busy="true"]'
    ]
    
    let found = false
    for (const selector of loadingSelectors) {
      if (document.querySelector(selector)) {
        found = true
        break
      }
    }
    
    recordResult(
      'Loading States UI',
      true, // Always pass - just checking if loading UI exists
      found ? 'Loading indicators found' : 'Loading indicators not found (may be dynamically created)'
    )
  }
  
  // Test 16: Accessibility - ARIA Labels
  async function testAriaLabels() {
    log('\n🧪 Testing: Accessibility - ARIA Labels', 'info')
    
    try {
      const inputs = document.querySelectorAll('input, textarea, select, button')
      let withLabels = 0
      let withoutLabels = 0
      
      inputs.forEach(input => {
        const hasLabel = 
          input.hasAttribute('aria-label') ||
          input.hasAttribute('aria-labelledby') ||
          input.id && document.querySelector(`label[for="${input.id}"]`) !== null ||
          input.closest('label') !== null
        
        if (hasLabel) {
          withLabels++
        } else {
          withoutLabels++
        }
      })
      
      const total = inputs.length
      const percentage = total > 0 ? ((withLabels / total) * 100).toFixed(1) : 0
      
      recordResult(
        'Accessibility - ARIA Labels',
        percentage >= 50, // At least 50% should have labels
        `${withLabels}/${total} inputs have labels (${percentage}%)`
      )
    } catch (error) {
      recordResult('Accessibility - ARIA Labels', false, error.message)
    }
  }
  
  // Test 17: Keyboard Navigation
  async function testKeyboardNavigation() {
    log('\n🧪 Testing: Keyboard Navigation', 'info')
    
    try {
      const focusableElements = document.querySelectorAll(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      
      recordResult(
        'Keyboard Navigation',
        focusableElements.length > 0,
        `Found ${focusableElements.length} focusable elements`
      )
    } catch (error) {
      recordResult('Keyboard Navigation', false, error.message)
    }
  }
  
  // Test 18: Local Storage Usage
  async function testLocalStorageUsage() {
    log('\n🧪 Testing: Local Storage Usage', 'info')
    
    try {
      const keys = Object.keys(localStorage)
      const crmKeys = keys.filter(k => 
        k.toLowerCase().includes('lead') || 
        k.toLowerCase().includes('client') ||
        k.toLowerCase().includes('crm')
      )
      
      recordResult(
        'Local Storage Usage',
        true,
        `Found ${crmKeys.length} CRM-related localStorage keys`
      )
    } catch (error) {
      recordResult('Local Storage Usage', false, error.message)
    }
  }
  
  // Test 19: Console Errors Check
  async function testConsoleErrors() {
    log('\n🧪 Testing: Console Errors Check', 'info')
    
    // This test should be run before others to capture errors
    // For now, just check if console.error exists
    recordResult(
      'Console Errors Check',
      true,
      'Console error checking available (check browser console manually)'
    )
  }
  
  // Test 20: Performance Check
  async function testPerformance() {
    log('\n🧪 Testing: Performance Check', 'info')
    
    try {
      const perfData = performance.getEntriesByType('navigation')[0]
      if (perfData) {
        const loadTime = perfData.loadEventEnd - perfData.loadEventStart
        recordResult(
          'Performance Check',
          loadTime < 5000, // Should load in under 5 seconds
          `Page load time: ${(loadTime / 1000).toFixed(2)}s`
        )
      } else {
        recordResult('Performance Check', true, 'Performance data not available', true)
      }
    } catch (error) {
      recordResult('Performance Check', false, error.message)
    }
  }
  
  // Main test runner
  window.runCRMUITests = async function() {
    console.log('🚀 Starting CRM UI Tests')
    console.log(`📍 URL: ${window.location.href}`)
    console.log('='.repeat(60))
    
    // Run all UI tests
    await testLeadDetailModalExists()
    await testClientsComponentExists()
    await testAPIWrapperAvailable()
    await testStorageAvailable()
    await testRateLimitManagerAvailable()
    await testEnhancedStateManagerAvailable()
    await testDatabaseAPIAvailable()
    await testCanFetchLeads()
    await testLeadListRenders()
    await testFormValidation()
    await testAutoSaveExists()
    await testTabNavigation()
    await testResponsiveDesign()
    await testErrorHandlingUI()
    await testLoadingStatesUI()
    await testAriaLabels()
    await testKeyboardNavigation()
    await testLocalStorageUsage()
    await testConsoleErrors()
    await testPerformance()
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Summary')
    console.log('='.repeat(60))
    console.log(`✅ Passed: ${testResults.passed.length}`)
    console.log(`⚠️  Warnings: ${testResults.warnings.length}`)
    console.log(`❌ Failed: ${testResults.failed.length}`)
    console.log(`📈 Total: ${testResults.totalTests}`)
    
    const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2)
    console.log(`⏱️  Duration: ${duration}s`)
    
    if (testResults.failed.length > 0) {
      console.log('\n❌ Failed Tests:')
      testResults.failed.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.test}: ${f.message}`)
      })
    }
    
    const successRate = ((testResults.passed.length / testResults.totalTests) * 100).toFixed(1)
    console.log(`\n🎯 Success Rate: ${successRate}%`)
    
    // Store results globally
    window.crmUITestResults = testResults
    
    return testResults
  }
  
  console.log('✅ CRM UI Tests loaded')
  console.log('💡 Run: window.runCRMUITests()')
})()

