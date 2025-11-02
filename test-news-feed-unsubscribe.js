#!/usr/bin/env node
/**
 * Test script for news feed unsubscribe functionality
 * Tests that unsubscribed clients' articles are filtered out
 */

const API_BASE = process.env.API_BASE || 'https://abcoafrica.co.za/api';
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

let authToken = null;
let testClientId = null;
let testClientName = null;
let originalSubscriptionStatus = null;

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
}

async function login() {
    console.log('🔐 Step 1: Logging in...');
    const result = await fetchJSON(`${API_BASE}/login`, {
        method: 'POST',
        body: JSON.stringify({
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        })
    });

    authToken = result.data?.accessToken || result.accessToken;
    if (!authToken) {
        throw new Error('Login failed: No token received');
    }
    console.log('✅ Login successful\n');
    return authToken;
}

async function getNewsArticles() {
    console.log('📰 Step 2: Fetching news articles...');
    const result = await fetchJSON(`${API_BASE}/client-news`);
    const articles = result.data?.newsArticles || result.newsArticles || [];
    console.log(`✅ Found ${articles.length} news articles\n`);
    return articles;
}

async function findClientWithArticles(articles) {
    console.log('🔍 Step 3: Finding a client with articles...');
    
    if (articles.length === 0) {
        throw new Error('No articles found to test with');
    }

    // Group articles by client
    const clientArticles = {};
    articles.forEach(article => {
        const clientId = article.clientId;
        if (!clientArticles[clientId]) {
            clientArticles[clientId] = {
                id: clientId,
                name: article.clientName,
                articles: []
            };
        }
        clientArticles[clientId].articles.push(article);
    });

    // Find a client with multiple articles (better for testing)
    const clientsWithArticles = Object.values(clientArticles).sort((a, b) => b.articles.length - a.articles.length);
    const testClient = clientsWithArticles[0];

    testClientId = testClient.id;
    testClientName = testClient.name;
    
    console.log(`✅ Selected client: ${testClientName} (ID: ${testClientId})`);
    console.log(`   Has ${testClient.articles.length} articles\n`);
    
    return testClient;
}

async function getSubscriptionStatus(clientId) {
    console.log('📋 Step 4: Getting current subscription status...');
    const result = await fetchJSON(`${API_BASE}/clients/${clientId}/rss-subscription`);
    const status = result.data?.client?.rssSubscribed;
    console.log(`✅ Current subscription status: ${status}\n`);
    return status;
}

async function unsubscribe(clientId) {
    console.log('🚫 Step 5: Unsubscribing client...');
    const result = await fetchJSON(`${API_BASE}/clients/${clientId}/rss-subscription`, {
        method: 'POST',
        body: JSON.stringify({ subscribed: false })
    });
    
    const newStatus = result.data?.client?.rssSubscribed;
    console.log(`✅ Unsubscribed. New status: ${newStatus}\n`);
    
    if (newStatus !== false) {
        throw new Error(`Unsubscribe failed: status is ${newStatus}, expected false`);
    }
    
    return newStatus;
}

async function verifyArticlesFiltered(clientId, clientName) {
    console.log('🔍 Step 6: Verifying articles are filtered out...');
    
    // Wait a moment for database to commit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const articles = await getNewsArticles();
    const clientArticles = articles.filter(a => a.clientId === clientId);
    
    console.log(`📊 Results:`);
    console.log(`   Total articles: ${articles.length}`);
    console.log(`   Articles from ${clientName}: ${clientArticles.length}`);
    
    if (clientArticles.length > 0) {
        console.error(`❌ TEST FAILED: Found ${clientArticles.length} articles for unsubscribed client ${clientName}`);
        console.error(`   Articles:`, clientArticles.map(a => `"${a.title}"`).join(', '));
        return false;
    } else {
        console.log(`✅ TEST PASSED: No articles found for unsubscribed client ${clientName}\n`);
        return true;
    }
}

async function resubscribe(clientId) {
    console.log('↩️  Step 7: Re-subscribing client (cleanup)...');
    const result = await fetchJSON(`${API_BASE}/clients/${clientId}/rss-subscription`, {
        method: 'POST',
        body: JSON.stringify({ subscribed: originalSubscriptionStatus !== false })
    });
    
    const newStatus = result.data?.client?.rssSubscribed;
    console.log(`✅ Re-subscribed. Status restored to: ${newStatus}\n`);
    return newStatus;
}

async function runTest() {
    console.log('🧪 ============================================');
    console.log('🧪 News Feed Unsubscribe Functionality Test');
    console.log('🧪 ============================================\n');

    try {
        // Step 1: Login
        await login();

        // Step 2: Get all news articles
        const initialArticles = await getNewsArticles();
        
        if (initialArticles.length === 0) {
            console.log('⚠️  No articles found. Cannot test unsubscribe functionality.');
            console.log('   This is expected if no clients have news articles yet.\n');
            return;
        }

        // Step 3: Find a client with articles
        const testClient = await findClientWithArticles(initialArticles);

        // Step 4: Get current subscription status
        originalSubscriptionStatus = await getSubscriptionStatus(testClientId);

        // Step 5: Unsubscribe
        await unsubscribe(testClientId);

        // Step 6: Verify articles are filtered out
        const testPassed = await verifyArticlesFiltered(testClientId, testClientName);

        // Step 7: Re-subscribe to restore state
        await resubscribe(testClientId);

        // Final summary
        console.log('📊 ============================================');
        console.log('📊 Test Summary');
        console.log('📊 ============================================');
        if (testPassed) {
            console.log('✅ TEST PASSED: Unsubscribe functionality is working correctly!');
            console.log('   - Unsubscribed client articles are properly filtered out');
        } else {
            console.log('❌ TEST FAILED: Unsubscribe functionality is NOT working');
            console.log('   - Articles from unsubscribed clients are still appearing');
        }
        console.log('📊 ============================================\n');

        process.exit(testPassed ? 0 : 1);

    } catch (error) {
        console.error('\n❌ ============================================');
        console.error('❌ Test Error');
        console.error('❌ ============================================');
        console.error(`❌ ${error.message}`);
        console.error(error.stack);
        console.error('❌ ============================================\n');

        // Try to cleanup if we got far enough
        if (testClientId && originalSubscriptionStatus !== null) {
            try {
                console.log('🧹 Attempting cleanup...');
                await resubscribe(testClientId);
            } catch (cleanupError) {
                console.error('⚠️  Cleanup failed:', cleanupError.message);
            }
        }

        process.exit(1);
    }
}

// Run the test
runTest();

