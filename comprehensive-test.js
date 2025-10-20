#!/usr/bin/env node

/**
 * Comprehensive API and Database Testing Script
 * Tests all API endpoints and verifies database connections
 */

import https from 'https';
import http from 'http';

const BASE_URL = process.env.TEST_URL || 'https://abco-erp-2-production.up.railway.app';
const USE_HTTPS = BASE_URL.startsWith('https');

// Test configuration
const tests = {
  passed: 0,
  failed: 0,
  results: []
};

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const protocol = USE_HTTPS ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (USE_HTTPS ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
      const payload = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = protocol.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: JSON.parse(body)
            });
          } else {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: body,
              isHTML: contentType.includes('text/html')
            });
          }
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body,
            parseError: e.message
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test runner
async function runTest(name, testFn) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    const result = await testFn();
    
    if (result.success) {
      tests.passed++;
      console.log(`✅ PASSED: ${name}`);
      if (result.message) console.log(`   ${result.message}`);
    } else {
      tests.failed++;
      console.log(`❌ FAILED: ${name}`);
      if (result.message) console.log(`   ${result.message}`);
      if (result.error) console.log(`   Error: ${result.error}`);
    }
    
    tests.results.push({ name, ...result });
    return result;
  } catch (error) {
    tests.failed++;
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${error.message}`);
    tests.results.push({ name, success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

// Test cases
async function testHealthEndpoint() {
  const response = await makeRequest('/health', 'GET');
  return {
    success: response.status === 200 && response.data.status === 'ok',
    message: `Health check returned ${response.status}`,
    data: response.data
  };
}

async function testLogin() {
  const response = await makeRequest('/api/auth/login', 'POST', {
    email: 'admin@abcotronics.com',
    password: 'admin123'
  });
  
  const success = response.status === 200 && response.data && response.data.token;
  return {
    success,
    message: success ? 'Login successful' : `Login failed with status ${response.status}`,
    token: response.data?.token,
    data: response.data
  };
}

async function testAPIEndpoint(path, token, expectJSON = true) {
  const response = await makeRequest(path, 'GET', null, token);
  
  const isJSON = !response.isHTML && !response.parseError;
  const success = response.status === 200 && (expectJSON ? isJSON : true);
  
  return {
    success,
    message: isJSON ? 
      `Returned JSON with status ${response.status}` : 
      `Returned HTML or non-JSON with status ${response.status}`,
    isHTML: response.isHTML,
    data: isJSON ? response.data : null
  };
}

// Main test execution
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('🚀 COMPREHENSIVE API TESTING');
  console.log('='.repeat(60));
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log('='.repeat(60));

  // Test 1: Health check
  await runTest('Health Endpoint', testHealthEndpoint);

  // Test 2: Login
  const loginResult = await runTest('Login Endpoint', testLogin);
  const token = loginResult.token;

  if (!token) {
    console.log('\n⚠️  Warning: No auth token available. Skipping authenticated tests.');
  } else {
    console.log('\n✅ Auth token obtained. Testing authenticated endpoints...');
    
    // Test 3-8: API Endpoints
    await runTest('GET /api/clients', () => testAPIEndpoint('/api/clients', token));
    await runTest('GET /api/leads', () => testAPIEndpoint('/api/leads', token));
    await runTest('GET /api/projects', () => testAPIEndpoint('/api/projects', token));
    await runTest('GET /api/invoices', () => testAPIEndpoint('/api/invoices', token));
    await runTest('GET /api/time-entries', () => testAPIEndpoint('/api/time-entries', token));
    await runTest('GET /api/users', () => testAPIEndpoint('/api/users', token));
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${tests.passed}`);
  console.log(`❌ Failed: ${tests.failed}`);
  console.log(`📈 Total:  ${tests.passed + tests.failed}`);
  console.log(`🎯 Success Rate: ${((tests.passed / (tests.passed + tests.failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  // Detailed results
  console.log('\n📋 DETAILED RESULTS:');
  console.log('-'.repeat(60));
  tests.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.success ? '✅' : '❌'} ${result.name}`);
    if (result.message) console.log(`   ${result.message}`);
  });
  console.log('='.repeat(60));

  // Exit with appropriate code
  process.exit(tests.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
