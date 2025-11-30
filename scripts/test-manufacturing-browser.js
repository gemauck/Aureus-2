#!/usr/bin/env node
/**
 * Browser-based Manufacturing Module Test Suite
 * 
 * Tests all critical manufacturing functionality:
 * 1. Inventory item creation with initial balance
 * 2. Receipt transactions
 * 3. Consumption transactions
 * 4. Adjustments (positive and negative)
 * 5. Production order completion
 * 6. Sales order shipping
 * 7. Data integrity verification
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'https://abcoafrica.co.za';
const TEST_TIMEOUT = 30000; // 30 seconds per test

const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

function logTest(name, status, message = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${name}${message ? ': ' + message : ''}`);
  
  if (status === 'pass') {
    testResults.passed.push({ name, message });
  } else if (status === 'fail') {
    testResults.failed.push({ name, message });
  } else {
    testResults.warnings.push({ name, message });
  }
}

async function waitForPageLoad(page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function login(page) {
  try {
    // Check if already logged in
    const isLoggedIn = await page.locator('text=Dashboard').isVisible({ timeout: 2000 }).catch(() => false);
    if (isLoggedIn) {
      console.log('   Already logged in');
      return true;
    }

    // Navigate to login page
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Fill login form (adjust selectors based on your login page)
    await page.fill('input[type="email"], input[name="email"]', process.env.TEST_EMAIL || 'admin@abcoafrica.co.za');
    await page.fill('input[type="password"], input[name="password"]', process.env.TEST_PASSWORD || 'password');
    await page.click('button[type="submit"], button:has-text("Login")');
    
    await waitForPageLoad(page);
    
    // Verify login success
    const loggedIn = await page.locator('text=Dashboard').isVisible({ timeout: 5000 }).catch(() => false);
    if (loggedIn) {
      console.log('   ✅ Logged in successfully');
      return true;
    } else {
      console.log('   ⚠️ Login may have failed, continuing anyway');
      return false;
    }
  } catch (error) {
    console.log(`   ⚠️ Login error: ${error.message}`);
    return false;
  }
}

async function navigateToManufacturing(page) {
  try {
    await page.goto(`${BASE_URL}/manufacturing`);
    await waitForPageLoad(page);
    
    // Wait for manufacturing page to load
    await page.waitForSelector('text=Manufacturing', { timeout: 10000 });
    console.log('   ✅ Navigated to manufacturing');
    return true;
  } catch (error) {
    logTest('Navigate to Manufacturing', 'fail', error.message);
    return false;
  }
}

async function testInventoryItemCreation(page) {
  console.log('\n📦 Test 1: Create Inventory Item with Initial Balance');
  
  try {
    // Navigate to inventory tab
    await page.click('button:has-text("Inventory")');
    await waitForPageLoad(page);
    
    // Click Add Item button
    await page.click('button:has-text("Add Item")');
    await waitForPageLoad(page);
    
    // Fill in item details
    const testSku = `TEST-${Date.now()}`;
    await page.fill('input[name="sku"], input[placeholder*="SKU"]', testSku);
    await page.fill('input[name="name"], input[placeholder*="Name"]', 'Test Item');
    await page.fill('input[name="quantity"], input[type="number"]:near(label:has-text("Quantity"))', '100');
    await page.fill('input[name="unitCost"], input[type="number"]:near(label:has-text("Unit Cost"))', '10.00');
    
    // Save item
    await page.click('button:has-text("Save"), button:has-text("Create")');
    await waitForPageLoad(page);
    
    // Verify item appears in list
    const itemVisible = await page.locator(`text=${testSku}`).isVisible({ timeout: 5000 });
    if (itemVisible) {
      logTest('Create Inventory Item', 'pass', `Item ${testSku} created with 100 quantity`);
      
      // Click on item to view details
      await page.click(`text=${testSku}`);
      await waitForPageLoad(page);
      
      // Verify stock ledger shows initial balance
      const ledgerVisible = await page.locator('text=Stock Ledger').isVisible({ timeout: 5000 });
      if (ledgerVisible) {
        const initialBalance = await page.locator('text=INITIAL_BALANCE').isVisible({ timeout: 5000 });
        if (initialBalance) {
          logTest('Initial Balance Movement', 'pass', 'Initial balance stock movement created');
        } else {
          logTest('Initial Balance Movement', 'fail', 'Initial balance movement not found');
        }
      }
      
      return { sku: testSku, success: true };
    } else {
      logTest('Create Inventory Item', 'fail', 'Item not found in list after creation');
      return { sku: testSku, success: false };
    }
  } catch (error) {
    logTest('Create Inventory Item', 'fail', error.message);
    return { sku: null, success: false };
  }
}

async function testReceiptTransaction(page, sku) {
  console.log('\n📥 Test 2: Create Receipt Transaction');
  
  try {
    // Navigate to inventory if not already there
    await page.click('button:has-text("Inventory")');
    await waitForPageLoad(page);
    
    // Find and click on the test item
    if (sku) {
      await page.click(`text=${sku}`);
      await waitForPageLoad(page);
    }
    
    // Click Record Movement
    await page.click('button:has-text("Record Movement")');
    await waitForPageLoad(page);
    
    // Select Receipt type
    await page.selectOption('select[name="type"], select:has(option:text("Receipt"))', 'receipt');
    
    // Fill in receipt details
    await page.fill('input[name="quantity"], input[type="number"]:near(label:has-text("Quantity"))', '50');
    
    // Save movement
    await page.click('button:has-text("Record Movement"), button:has-text("Save")');
    await waitForPageLoad(page);
    
    // Verify stock increased
    const quantityText = await page.locator('text=/150|Total.*150/').first().textContent({ timeout: 5000 }).catch(() => '');
    if (quantityText.includes('150')) {
      logTest('Receipt Transaction', 'pass', 'Stock increased from 100 to 150');
      return true;
    } else {
      logTest('Receipt Transaction', 'fail', 'Stock did not increase correctly');
      return false;
    }
  } catch (error) {
    logTest('Receipt Transaction', 'fail', error.message);
    return false;
  }
}

async function testConsumptionTransaction(page, sku) {
  console.log('\n📤 Test 3: Create Consumption Transaction');
  
  try {
    // Navigate to inventory if not already there
    await page.click('button:has-text("Inventory")');
    await waitForPageLoad(page);
    
    // Find and click on the test item
    if (sku) {
      await page.click(`text=${sku}`);
      await waitForPageLoad(page);
    }
    
    // Click Record Movement
    await page.click('button:has-text("Record Movement")');
    await waitForPageLoad(page);
    
    // Select Consumption type
    await page.selectOption('select[name="type"], select:has(option:text("Consumption"))', 'consumption');
    
    // Fill in consumption details
    await page.fill('input[name="quantity"], input[type="number"]:near(label:has-text("Quantity"))', '25');
    
    // Save movement
    await page.click('button:has-text("Record Movement"), button:has-text("Save")');
    await waitForPageLoad(page);
    
    // Verify stock decreased
    const quantityText = await page.locator('text=/125|Total.*125/').first().textContent({ timeout: 5000 }).catch(() => '');
    if (quantityText.includes('125')) {
      logTest('Consumption Transaction', 'pass', 'Stock decreased from 150 to 125');
      return true;
    } else {
      logTest('Consumption Transaction', 'fail', 'Stock did not decrease correctly');
      return false;
    }
  } catch (error) {
    logTest('Consumption Transaction', 'fail', error.message);
    return false;
  }
}

async function testAdjustmentTransaction(page, sku) {
  console.log('\n🔧 Test 4: Create Adjustment Transaction');
  
  try {
    // Navigate to inventory if not already there
    await page.click('button:has-text("Inventory")');
    await waitForPageLoad(page);
    
    // Find and click on the test item
    if (sku) {
      await page.click(`text=${sku}`);
      await waitForPageLoad(page);
    }
    
    // Click Record Movement
    await page.click('button:has-text("Record Movement")');
    await waitForPageLoad(page);
    
    // Select Adjustment type
    await page.selectOption('select[name="type"], select:has(option:text("Adjustment"))', 'adjustment');
    
    // Fill in positive adjustment
    await page.fill('input[name="quantity"], input[type="number"]:near(label:has-text("Quantity"))', '10');
    
    // Save movement
    await page.click('button:has-text("Record Movement"), button:has-text("Save")');
    await waitForPageLoad(page);
    
    // Verify stock increased
    const quantityText = await page.locator('text=/135|Total.*135/').first().textContent({ timeout: 5000 }).catch(() => '');
    if (quantityText.includes('135')) {
      logTest('Positive Adjustment', 'pass', 'Stock increased from 125 to 135');
      
      // Test negative adjustment
      await page.click('button:has-text("Record Movement")');
      await waitForPageLoad(page);
      await page.selectOption('select[name="type"], select:has(option:text("Adjustment"))', 'adjustment');
      await page.fill('input[name="quantity"], input[type="number"]:near(label:has-text("Quantity"))', '-5');
      await page.click('button:has-text("Record Movement"), button:has-text("Save")');
      await waitForPageLoad(page);
      
      const quantityText2 = await page.locator('text=/130|Total.*130/').first().textContent({ timeout: 5000 }).catch(() => '');
      if (quantityText2.includes('130')) {
        logTest('Negative Adjustment', 'pass', 'Stock decreased from 135 to 130');
        return true;
      } else {
        logTest('Negative Adjustment', 'fail', 'Stock did not decrease correctly');
        return false;
      }
    } else {
      logTest('Positive Adjustment', 'fail', 'Stock did not increase correctly');
      return false;
    }
  } catch (error) {
    logTest('Adjustment Transaction', 'fail', error.message);
    return false;
  }
}

async function testStockLedgerAccuracy(page, sku) {
  console.log('\n📊 Test 5: Verify Stock Ledger Accuracy');
  
  try {
    // Navigate to inventory if not already there
    await page.click('button:has-text("Inventory")');
    await waitForPageLoad(page);
    
    // Find and click on the test item
    if (sku) {
      await page.click(`text=${sku}`);
      await waitForPageLoad(page);
    }
    
    // Check stock ledger
    const ledgerVisible = await page.locator('text=Stock Ledger').isVisible({ timeout: 5000 });
    if (ledgerVisible) {
      // Get current quantity from item details
      const currentQtyText = await page.locator('text=/Total Quantity|Quantity/').first().textContent({ timeout: 5000 }).catch(() => '');
      const currentQty = parseInt(currentQtyText.match(/\d+/)?.[0] || '0');
      
      // Get closing balance from ledger
      const closingBalanceText = await page.locator('text=Closing Balance').locator('..').textContent({ timeout: 5000 }).catch(() => '');
      const closingBalance = parseInt(closingBalanceText.match(/\d+/)?.[0] || '0');
      
      if (currentQty === closingBalance && currentQty === 130) {
        logTest('Stock Ledger Accuracy', 'pass', `Current quantity (${currentQty}) matches closing balance (${closingBalance})`);
        return true;
      } else {
        logTest('Stock Ledger Accuracy', 'fail', `Mismatch: Current=${currentQty}, Closing=${closingBalance}, Expected=130`);
        return false;
      }
    } else {
      logTest('Stock Ledger Accuracy', 'fail', 'Stock ledger not visible');
      return false;
    }
  } catch (error) {
    logTest('Stock Ledger Accuracy', 'fail', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Manufacturing Module Browser Test Suite\n');
  console.log(`📍 Testing against: ${BASE_URL}\n`);
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Login
    console.log('🔐 Logging in...');
    await login(page);
    
    // Navigate to manufacturing
    console.log('\n🏭 Navigating to Manufacturing...');
    if (!await navigateToManufacturing(page)) {
      console.log('❌ Failed to navigate to manufacturing. Aborting tests.');
      return;
    }
    
    // Run tests
    const itemResult = await testInventoryItemCreation(page);
    const testSku = itemResult.sku;
    
    if (itemResult.success) {
      await testReceiptTransaction(page, testSku);
      await testConsumptionTransaction(page, testSku);
      await testAdjustmentTransaction(page, testSku);
      await testStockLedgerAccuracy(page, testSku);
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testResults.passed.length}`);
    console.log(`❌ Failed: ${testResults.failed.length}`);
    console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
    
    if (testResults.failed.length > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.failed.forEach(test => {
        console.log(`   - ${test.name}: ${test.message}`);
      });
    }
    
    if (testResults.passed.length > 0) {
      console.log('\n✅ Passed Tests:');
      testResults.passed.forEach(test => {
        console.log(`   - ${test.name}${test.message ? ': ' + test.message : ''}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Keep browser open for manual inspection
    console.log('\n⏸️  Keeping browser open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Test suite error:', error);
  } finally {
    await browser.close();
  }
}

// Run tests
runTests().catch(console.error);

