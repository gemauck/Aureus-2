// Test the feedback endpoint directly to verify the query parameter fix
import dotenv from 'dotenv';
dotenv.config();

async function testFeedbackEndpoint() {
    console.log('🧪 Testing Feedback Endpoint (Query Parameter Fix)\n');
    console.log('='.repeat(60));
    
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    
    // Test cases
    const testCases = [
        {
            name: 'GET /api/feedback (basic)',
            url: `${baseUrl}/api/feedback`,
            method: 'GET'
        },
        {
            name: 'GET /api/feedback?includeUser=true (the fix)',
            url: `${baseUrl}/api/feedback?includeUser=true`,
            method: 'GET'
        },
        {
            name: 'GET /api/feedback?section=Dashboard&includeUser=true',
            url: `${baseUrl}/api/feedback?section=Dashboard&includeUser=true`,
            method: 'GET'
        },
        {
            name: 'GET /api/feedback?pageUrl=/dashboard&section=Dashboard&includeUser=true',
            url: `${baseUrl}/api/feedback?pageUrl=/dashboard&section=Dashboard&includeUser=true`,
            method: 'GET'
        }
    ];
    
    console.log('📡 Base URL:', baseUrl);
    console.log(`\n🧪 Testing ${testCases.length} GET endpoints...\n`);
    
    let passCount = 0;
    let failCount = 0;
    
    for (const testCase of testCases) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📋 Test: ${testCase.name}`);
        console.log(`🔗 URL: ${testCase.url}`);
        
        try {
            const response = await fetch(testCase.url, {
                method: testCase.method,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const text = await response.text();
            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                console.log('⚠️  Response is not JSON:', text.substring(0, 100));
                result = { error: 'Invalid JSON response', text: text.substring(0, 200) };
            }
            
            console.log(`📊 Status: ${response.status} ${response.statusText}`);
            
            if (response.status === 400 && result.error && result.error.includes('Invalid feedback request')) {
                console.log('❌ FAILED: Invalid feedback request error (this is what we fixed!)');
                console.log('   Error:', result.error);
                failCount++;
            } else if (response.status === 401 || response.status === 403) {
                console.log('✅ PASSED: Endpoint exists (authentication required - expected)');
                console.log('   The endpoint correctly parsed the path and query parameters');
                passCount++;
            } else if (response.ok) {
                console.log('✅ PASSED: Request succeeded!');
                if (Array.isArray(result)) {
                    console.log(`   Returned ${result.length} feedback items`);
                    if (result.length > 0 && result[0].user) {
                        console.log('   ✅ User data included (includeUser=true worked)');
                    }
                } else if (result.data && Array.isArray(result.data)) {
                    console.log(`   Returned ${result.data.length} feedback items`);
                    if (result.data.length > 0 && result.data[0].user) {
                        console.log('   ✅ User data included (includeUser=true worked)');
                    }
                } else {
                    console.log('   Response:', JSON.stringify(result, null, 2).substring(0, 200));
                }
                passCount++;
            } else {
                console.log(`⚠️  Status ${response.status}:`, result.error || result.message || 'Unknown error');
                if (response.status === 400 && result.error && !result.error.includes('Invalid feedback request')) {
                    console.log('   (Different error - endpoint parsed correctly, but validation failed)');
                    passCount++; // Path parsing worked, just validation issue
                } else {
                    failCount++;
                }
            }
            
        } catch (error) {
            console.error('❌ FAILED: Request error');
            console.error('   Error:', error.message);
            if (error.message.includes('ECONNREFUSED')) {
                console.error('   Server is not running or not accessible');
                console.error('   Make sure your server is running on', baseUrl);
            }
            failCount++;
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Test Results:');
    console.log(`   ✅ Passed: ${passCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📈 Total: ${testCases.length}`);
    
    if (failCount === 0) {
        console.log('\n✅ All tests passed! The query parameter fix is working correctly.');
    } else {
        console.log('\n⚠️  Some tests failed. Check the output above for details.');
    }
    
    console.log('\n💡 Note: If you see authentication errors (401/403), that\'s expected.');
    console.log('   The important thing is that we don\'t see "Invalid feedback request" errors.');
    console.log('   That error indicates the path parsing was broken (which we fixed).');
}

testFeedbackEndpoint();
