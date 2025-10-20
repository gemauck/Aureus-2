#!/usr/bin/env node

/**
 * Railway Production Client Test
 * Tests the actual Railway production environment
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
async function testRailwayLogin() {
  const response = await makeRequest('/api/auth/login', 'POST', {
    email: 'admin@abcotronics.com',
    password: 'admin123'
  });
  
  const token = response.data?.data?.accessToken || response.data?.accessToken || response.data?.token;
  const success = response.status === 200 && token;
  return {
    success,
    message: success ? 'Railway login successful' : `Railway login failed with status ${response.status}`,
    token: token,
    data: response.data
  };
}

async function testRailwayClientsAPI(token) {
  const response = await makeRequest('/api/clients', 'GET', null, token);
  
  const success = response.status === 200;
  const clients = response.data?.data?.clients || response.data?.clients || [];
  const errorMessage = response.data?.error || response.data?.message || 'Unknown error';
  
  return {
    success,
    message: success ? 
      `Railway API returned ${response.status} with ${clients.length} clients` : 
      `Railway API returned ${response.status}: ${errorMessage}`,
    data: response.data,
    clients: clients,
    status: response.status
  };
}

async function testRailwayClientCreation(token) {
  const testClient = {
    name: 'Railway Test Client',
    industry: 'Technology',
    status: 'active',
    type: 'client',
    notes: 'Test client created via Railway API'
  };
  
  const response = await makeRequest('/api/clients', 'POST', testClient, token);
  
  const success = response.status === 200 || response.status === 201;
  const createdClient = response.data?.data?.client || response.data?.client;
  
  return {
    success,
    message: success ? 
      `Railway client creation successful: ${createdClient?.name || 'Unknown'}` : 
      `Railway client creation failed with status ${response.status}`,
    data: response.data,
    createdClient: createdClient,
    status: response.status
  };
}

async function testRailwayClientUpdate(token, clientId) {
  const updateData = {
    name: 'Railway Test Client Updated',
    notes: 'Updated via Railway API test'
  };
  
  const response = await makeRequest(`/api/clients/${clientId}`, 'PATCH', updateData, token);
  
  const success = response.status === 200;
  const updatedClient = response.data?.data?.client || response.data?.client;
  
  return {
    success,
    message: success ? 
      `Railway client update successful: ${updatedClient?.name || 'Unknown'}` : 
      `Railway client update failed with status ${response.status}`,
    data: response.data,
    updatedClient: updatedClient,
    status: response.status
  };
}

// Main test execution
async function runRailwayTests() {
  console.log('='.repeat(60));
  console.log('🚀 RAILWAY PRODUCTION CLIENT CONSISTENCY TEST');
  console.log('='.repeat(60));
  console.log(`📍 Railway URL: ${RAILWAY_URL}`);
  console.log('='.repeat(60));

  // Test 1: Railway Login
  const loginResult = await runTest('Railway Login', testRailwayLogin);
  const token = loginResult.token;

  if (!token) {
    console.log('\n❌ Cannot proceed without authentication token');
    return;
  }

  // Test 2: Railway Clients API
  const clientsResult = await runTest('Railway Clients API', () => testRailwayClientsAPI(token));
  
  // Test 3: Railway Client Creation
  const createResult = await runTest('Railway Client Creation', () => testRailwayClientCreation(token));
  
  // Test 4: Railway Client Update (if we have a client)
  if (createResult.createdClient?.id) {
    await runTest('Railway Client Update', () => testRailwayClientUpdate(token, createResult.createdClient.id));
  } else if (clientsResult.clients && clientsResult.clients.length > 0) {
    await runTest('Railway Client Update', () => testRailwayClientUpdate(token, clientsResult.clients[0].id));
  } else {
    console.log('\n⚠️  Skipping client update test - no clients available');
  }

  // Test 5: Data Consistency Check
  await runTest('Railway Data Consistency', async () => {
    try {
      // Get clients again to verify consistency
      const response = await makeRequest('/api/clients', 'GET', null, token);
      const clients = response.data?.data?.clients || response.data?.clients || [];
      
      const success = response.status === 200 && Array.isArray(clients);
      
      return {
        success,
        message: success ? 
          `Railway data consistency verified: ${clients.length} clients` : 
          'Railway data consistency check failed',
        data: clients
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
  console.log('📊 RAILWAY TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${tests.passed}`);
  console.log(`❌ Failed: ${tests.failed}`);
  console.log(`📈 Total:  ${tests.passed + tests.failed}`);
  console.log(`🎯 Success Rate: ${((tests.passed / (tests.passed + tests.failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  // Detailed results
  console.log('\n📋 DETAILED RAILWAY RESULTS:');
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
runRailwayTests().catch((error) => {
  console.error('Fatal error running Railway tests:', error);
  process.exit(1);
});
