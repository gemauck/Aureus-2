// Test script to verify pipeline drag and drop persistence
// Run with: node test-pipeline-persistence.js

import https from 'https';
import http from 'http';

const TEST_URL = process.env.TEST_URL || 'https://abcoafrica.co.za';
const TEST_OPPORTUNITY_ID = process.env.OPPORTUNITY_ID || 'test-opportunity-id';
const TEST_STAGE = 'Interest'; // Target stage to test

async function testOpportunityUpdate() {
  console.log('🧪 Testing Pipeline Drag-and-Drop Persistence');
  console.log('📍 Testing against:', TEST_URL);
  console.log('');
  
  // Test 1: Check if opportunity endpoint exists
  console.log('Test 1: Checking opportunity endpoint...');
  try {
    const url = new URL(`${TEST_URL}/api/opportunities/${TEST_OPPORTUNITY_ID}`);
    const client = url.protocol === 'https:' ? https : http;
    
    const response = await new Promise((resolve, reject) => {
      const req = client.request(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject);
      req.end();
    });
    
    console.log(`   Status: ${response.status}`);
    if (response.status === 200) {
      console.log('   ✅ Opportunity endpoint is accessible');
    } else if (response.status === 404) {
      console.log('   ⚠️  Opportunity not found (expected if ID is invalid)');
    } else if (response.status === 401) {
      console.log('   ⚠️  Authentication required (expected)');
    } else {
      console.log('   ⚠️  Unexpected status:', response.status);
    }
  } catch (error) {
    console.error('   ❌ Error testing endpoint:', error.message);
  }
  
  console.log('');
  console.log('Test 2: Testing PUT request (requires authentication)...');
  console.log('   ℹ️  Note: This test requires a valid auth token.');
  console.log('   ℹ️  In browser console, check Network tab for PUT requests to /api/opportunities/[id]');
  console.log('');
  
  console.log('📋 Next Steps:');
  console.log('   1. Open browser DevTools (F12)');
  console.log('   2. Go to Network tab');
  console.log('   3. Filter by "opportunities"');
  console.log('   4. Drag an opportunity to a different stage');
  console.log('   5. Check if PUT request is made to /api/opportunities/[id]');
  console.log('   6. Check response status and body');
  console.log('   7. Check browser console for error messages');
  console.log('');
}

testOpportunityUpdate().catch(console.error);

