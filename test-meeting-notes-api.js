#!/usr/bin/env node

// Test script for Meeting Notes API
// This verifies the API endpoints are working correctly

const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN || ''; // You'll need to provide a valid token

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (TEST_TOKEN) {
            options.headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
        }

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

async function testEndpoint(name, path, method = 'GET', body = null) {
    try {
        console.log(`\n🧪 Testing: ${name}`);
        const result = await makeRequest(path, method, body);
        
        if (result.status >= 200 && result.status < 300) {
            console.log(`${GREEN}✅ PASS${RESET} - Status: ${result.status}`);
            if (result.data && typeof result.data === 'object') {
                console.log(`   Response keys: ${Object.keys(result.data).join(', ')}`);
            }
            return { success: true, result };
        } else if (result.status === 401) {
            console.log(`${YELLOW}⚠️  AUTH REQUIRED${RESET} - Status: ${result.status}`);
            console.log(`   This is expected if no token is provided`);
            return { success: false, authRequired: true, result };
        } else {
            console.log(`${RED}❌ FAIL${RESET} - Status: ${result.status}`);
            console.log(`   Response: ${JSON.stringify(result.data).substring(0, 200)}`);
            return { success: false, result };
        }
    } catch (error) {
        console.log(`${RED}❌ ERROR${RESET} - ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🚀 Meeting Notes API Test Suite');
    console.log('================================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Token: ${TEST_TOKEN ? 'Provided' : 'Not provided (some tests may fail)'}`);

    const results = [];

    // Test 1: Get all meeting notes
    results.push(await testEndpoint(
        'GET /api/meeting-notes',
        '/api/meeting-notes'
    ));

    // Test 2: Get specific month (current month)
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    results.push(await testEndpoint(
        `GET /api/meeting-notes?monthKey=${monthKey}`,
        `/api/meeting-notes?monthKey=${monthKey}`
    ));

    // Test 3: Create monthly notes (will fail without auth, but tests endpoint exists)
    results.push(await testEndpoint(
        'POST /api/meeting-notes',
        '/api/meeting-notes',
        'POST',
        {
            monthKey: monthKey,
            monthlyGoals: 'Test goals'
        }
    ));

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.authRequired).length;
    const authRequired = results.filter(r => r.authRequired).length;

    console.log(`${GREEN}✅ Passed: ${passed}${RESET}`);
    if (authRequired > 0) {
        console.log(`${YELLOW}⚠️  Auth Required: ${authRequired}${RESET}`);
    }
    if (failed > 0) {
        console.log(`${RED}❌ Failed: ${failed}${RESET}`);
    }

    // Check if server is running
    if (results.every(r => r.error && r.error.includes('ECONNREFUSED'))) {
        console.log(`\n${RED}❌ Server is not running!${RESET}`);
        console.log(`   Start the server with: npm start or node server.js`);
        process.exit(1);
    }

    console.log('\n✅ Test suite completed');
}

// Run tests
runTests().catch(console.error);

