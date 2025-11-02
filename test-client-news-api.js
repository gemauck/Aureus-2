// Test Client News API endpoint
import fetch from 'node-fetch';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 Testing Client News API...\n');
  
  // Test GET /api/client-news
  try {
    console.log('📡 Testing GET /api/client-news...');
    const response = await fetch(`${BASE_URL}/api/client-news`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ GET /api/client-news: SUCCESS');
      console.log(`   Articles found: ${data?.data?.newsArticles?.length || data?.newsArticles?.length || 0}`);
    } else {
      console.log('⚠️ GET /api/client-news: Response not OK');
      console.log(`   Status: ${response.status}`);
      console.log(`   Data:`, JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log('❌ GET /api/client-news: ERROR');
    console.log(`   ${error.message}`);
  }
  
  console.log('\n✅ API test completed');
}

testAPI();

