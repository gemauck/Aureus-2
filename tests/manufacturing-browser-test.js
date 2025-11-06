/**
 * Browser Integration Test for Manufacturing Component
 * Tests that the Manufacturing component loads without initialization errors
 */

const puppeteer = require('puppeteer');

async function testManufacturingComponent() {
  console.log('🧪 Starting Manufacturing Component Browser Test...\n');
  
  let browser;
  let page;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: false, // Set to true for CI/CD
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to the application
    console.log('📡 Navigating to https://abcoafrica.co.za...');
    await page.goto('https://abcoafrica.co.za', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for React to load
    await page.waitForFunction(() => {
      return typeof window.React !== 'undefined' && 
             typeof window.ReactDOM !== 'undefined';
    }, { timeout: 10000 });
    
    console.log('✅ React loaded successfully');
    
    // Monitor console for errors
    const errors = [];
    const warnings = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        errors.push(text);
        console.log(`❌ Console Error: ${text}`);
      } else if (msg.type() === 'warning') {
        warnings.push(text);
        console.log(`⚠️  Console Warning: ${text}`);
      }
    });
    
    // Monitor page errors
    page.on('pageerror', error => {
      errors.push(error.message);
      console.log(`❌ Page Error: ${error.message}`);
    });
    
    // Wait for Manufacturing component to load
    console.log('\n⏳ Waiting for Manufacturing component to load...');
    await page.waitForFunction(() => {
      return typeof window.Manufacturing !== 'undefined';
    }, { timeout: 15000 });
    
    console.log('✅ Manufacturing component registered');
    
    // Check for initialization errors
    const initializationErrors = errors.filter(err => 
      err.includes('openAddItemModal') || 
      err.includes('before initialization') ||
      err.includes('ReferenceError')
    );
    
    if (initializationErrors.length > 0) {
      console.log('\n❌ TEST FAILED: Initialization errors detected:');
      initializationErrors.forEach(err => console.log(`   - ${err}`));
      return false;
    }
    
    // Try to render the Manufacturing component (if logged in)
    console.log('\n🔍 Checking if user is logged in...');
    const isLoggedIn = await page.evaluate(() => {
      return window.storage && window.storage.getToken && window.storage.getToken();
    });
    
    if (isLoggedIn) {
      console.log('✅ User is logged in, testing Manufacturing component rendering...');
      
      // Navigate to Manufacturing section
      const manufacturingLink = await page.$('a[href*="manufacturing"], button:has-text("Manufacturing")');
      if (manufacturingLink) {
        await manufacturingLink.click();
        await page.waitForTimeout(2000);
        
        // Check if Manufacturing section rendered without errors
        const hasError = await page.evaluate(() => {
          return document.body.textContent.includes('ErrorBoundary') ||
                 document.body.textContent.includes('ReferenceError') ||
                 document.body.textContent.includes('Cannot access');
        });
        
        if (hasError) {
          console.log('❌ TEST FAILED: Manufacturing section shows error');
          return false;
        }
        
        console.log('✅ Manufacturing section rendered successfully');
      }
    } else {
      console.log('ℹ️  User not logged in - skipping rendering test');
      console.log('   (Component registration test passed)');
    }
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`   - Total Errors: ${errors.length}`);
    console.log(`   - Total Warnings: ${warnings.length}`);
    console.log(`   - Initialization Errors: ${initializationErrors.length}`);
    
    if (initializationErrors.length === 0) {
      console.log('\n✅ TEST PASSED: No initialization errors detected');
      return true;
    } else {
      console.log('\n❌ TEST FAILED: Initialization errors found');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testManufacturingComponent()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testManufacturingComponent };

