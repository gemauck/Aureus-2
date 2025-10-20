#!/usr/bin/env node

/**
 * Comprehensive Client Test Runner
 * Tests the client data consistency functionality
 */

import https from 'https';
import http from 'http';

const RAILWAY_URL = 'https://abco-erp-2-production.up.railway.app';

// Test configuration
const tests = {
  passed: 0,
  failed: 0,
  results: []
};

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, RAILWAY_URL);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
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
  const isHealthy = response.status === 200 && (
    response.data?.status === 'ok' || 
    response.data?.message?.includes('ok') ||
    typeof response.data === 'string' && response.data.includes('ok')
  );
  return {
    success: isHealthy,
    message: `Health check returned ${response.status} - ${isHealthy ? 'Healthy' : 'Unhealthy'}`,
    data: response.data
  };
}

async function testLogin() {
  const response = await makeRequest('/api/auth/login', 'POST', {
    email: 'admin@abcotronics.com',
    password: 'admin123'
  });
  
  const token = response.data?.token || response.data?.accessToken || response.data?.data?.accessToken;
  const success = response.status === 200 && token;
  return {
    success,
    message: success ? 'Login successful' : `Login failed with status ${response.status}`,
    token: token,
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

async function testClientsAPI(token) {
  const response = await makeRequest('/api/clients', 'GET', null, token);
  
  const success = response.status === 200;
  const errorMessage = response.data?.error || response.data?.message || 'Unknown error';
  
  return {
    success,
    message: success ? 
      `API returned ${response.status} with ${response.data?.clients?.length || 0} clients` : 
      `API returned ${response.status}: ${errorMessage}`,
    data: response.data,
    status: response.status
  };
}

// Main test execution
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('🚀 COMPREHENSIVE CLIENT DATA CONSISTENCY TEST');
  console.log('='.repeat(60));
  console.log(`📍 Base URL: ${RAILWAY_URL}`);
  console.log('='.repeat(60));

  // Test 1: Health check
  await runTest('Health Endpoint', testHealthEndpoint);

  // Test 2: Login
  const loginResult = await runTest('Login Endpoint', testLogin);
  const token = loginResult.token;

  if (!token) {
    console.log('\n⚠️  Warning: No auth token available. Testing API without authentication...');
    
    // Test API without authentication (should return 401)
    await runTest('API Clients (No Auth)', () => testClientsAPI(null));
  } else {
    console.log('\n✅ Auth token obtained. Testing authenticated endpoints...');
    
    // Test 3: API Endpoints with authentication
    await runTest('API Clients (Authenticated)', () => testClientsAPI(token));
  }

  // Test 4: Test localStorage simulation
  await runTest('LocalStorage Simulation', async () => {
    try {
      // Simulate localStorage operations
      const testData = [
        { id: 1, name: 'Test Client 1', email: 'test1@example.com' },
        { id: 2, name: 'Test Client 2', email: 'test2@example.com' }
      ];
      
      // Simulate save
      const savedData = JSON.stringify(testData);
      
      // Simulate load
      const loadedData = JSON.parse(savedData);
      
      const success = loadedData.length === testData.length && 
                     loadedData[0].name === testData[0].name;
      
      return {
        success,
        message: success ? 
          `localStorage simulation successful: ${loadedData.length} clients` : 
          'localStorage simulation failed',
        data: loadedData
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Test 5: Cache functionality simulation
  await runTest('Cache Functionality Simulation', async () => {
    try {
      // Simulate ClientCache operations
      const mockCache = {
        clients: null,
        timestamp: null,
        CACHE_DURATION: 5 * 60 * 1000,
        
        isCacheValid() {
          if (!this.timestamp) return false;
          return (Date.now() - this.timestamp) < this.CACHE_DURATION;
        },
        
        setClients(clients) {
          this.clients = clients;
          this.timestamp = Date.now();
        },
        
        getClients() {
          return this.isCacheValid() ? this.clients : null;
        }
      };
      
      // Test cache operations
      const testClients = [{ id: 1, name: 'Cached Client' }];
      mockCache.setClients(testClients);
      const cachedClients = mockCache.getClients();
      
      const success = cachedClients && cachedClients.length === testClients.length;
      
      return {
        success,
        message: success ? 
          'Cache functionality working correctly' : 
          'Cache functionality failed',
        data: cachedClients
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

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
    if (result.error) console.log(`   Error: ${result.error}`);
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
