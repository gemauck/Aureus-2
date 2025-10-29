// Node.js test runner for Manufacturing tests
// Simulates browser localStorage for testing

// Mock localStorage
class LocalStorage {
  constructor() {
    this.store = {};
  }
  
  getItem(key) {
    return this.store[key] || null;
  }
  
  setItem(key, value) {
    this.store[key] = String(value);
  }
  
  removeItem(key) {
    delete this.store[key];
  }
  
  clear() {
    this.store = {};
  }
  
  get length() {
    return Object.keys(this.store).length;
  }
}

// Create global localStorage
global.localStorage = new LocalStorage();

// Mock console methods - store original
const originalConsoleLog = console.log;

// Override console.log with colored output
global.console.log = (...args) => {
  const message = args.join(' ');
  
  if (message.includes('PASSED')) {
    originalConsoleLog('\x1b[32m%s\x1b[0m', message); // Green
  } else if (message.includes('FAILED')) {
    originalConsoleLog('\x1b[31m%s\x1b[0m', message); // Red
  } else if (message.includes('WARNING') || message.includes('⚠️')) {
    originalConsoleLog('\x1b[33m%s\x1b[0m', message); // Yellow
  } else {
    originalConsoleLog(message);
  }
};

// Load and run tests
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the test file
const testFilePath = path.join(__dirname, 'test-manufacturing-functionality.js');
const testCode = fs.readFileSync(testFilePath, 'utf8');

// Execute the test code
try {
  // Modify code to work in Node.js
  const nodeCode = testCode
    .replace(/typeof window !== 'undefined'/g, 'false')
    .replace(/typeof module !== 'undefined' && module\.exports/g, 'false')
    .replace(/module\.exports = /g, '// module.exports = ')
    .replace(/localStorage\./g, 'global.localStorage.')
    .replace(/if \(typeof window !== 'undefined'\) \{[\s\S]*?\}/g, '// Browser auto-run disabled in Node.js')
    .replace(/if \(typeof window === 'undefined' \|\| typeof localStorage === 'undefined'\) \{[\s\S]*?return;[\s\S]*?\}/g, '// Browser check disabled for Node.js testing');
  
  // Create a new function scope to execute and expose runAllTests globally
  const executeTest = new Function('global', `
    ${nodeCode}
    global.runAllTests = runAllTests;
  `);
  executeTest(global);
  
  // Run tests
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Starting Manufacturing Test Suite');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  if (typeof global.runAllTests === 'function') {
    const result = global.runAllTests();
    
    if (result) {
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('Test execution completed successfully!');
      console.log('═══════════════════════════════════════════════════════════════');
      
      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    } else {
      console.log('⚠️  Tests completed but no result returned');
      process.exit(1);
    }
  } else {
    console.log('❌ runAllTests function not found');
    console.log('Available globals:', Object.keys(global).filter(k => k.includes('Test')));
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error running tests:', error.message);
  console.error(error.stack);
  process.exit(1);
}
