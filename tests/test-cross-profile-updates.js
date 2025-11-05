#!/usr/bin/env node

// Test script to verify cross-profile updates work correctly
// Tests that when one user creates/updates a client or lead, other users see it quickly

import 'dotenv/config';

const API_BASE = process.env.TEST_URL || process.env.APP_URL || 'https://abcoafrica.co.za';

// Test credentials (these should be real test users)
const USER1 = {
    email: 'gemauck@gmail.com',
    password: process.env.USER1_PASSWORD // Must be set via environment variable
};

const USER2 = {
    email: 'garethm@abcotronics.co.za',
    password: process.env.USER2_PASSWORD // Must be set via environment variable
};

let user1Token = null;
let user2Token = null;

async function login(email, password) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.accessToken || data.data?.accessToken;
}

async function getLeads(token) {
    const response = await fetch(`${API_BASE}/api/leads`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get leads: ${response.status}`);
    }
    
    const data = await response.json();
    return data.leads || data.data?.leads || [];
}

async function getClients(token) {
    const response = await fetch(`${API_BASE}/api/clients`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get clients: ${response.status}`);
    }
    
    const data = await response.json();
    return data.clients || data.data?.clients || [];
}

async function createLead(token, leadData) {
    const response = await fetch(`${API_BASE}/api/leads`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(leadData)
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create lead: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.lead || data.data?.lead;
}

async function createClient(token, clientData) {
    const response = await fetch(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(clientData)
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create client: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.client || data.data?.client;
}

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAPIStructure() {
    console.log('\n🔍 Testing API structure (no authentication required)...');
    
    try {
        // Test health endpoint
        const healthResponse = await fetch(`${API_BASE}/api/health`);
        if (healthResponse.ok) {
            console.log('✅ Health endpoint accessible');
        } else {
            console.log(`⚠️  Health endpoint returned ${healthResponse.status}`);
        }
        
        console.log('\n📝 To test cross-profile updates:');
        console.log('   1. Set USER1_PASSWORD and USER2_PASSWORD environment variables');
        console.log('   2. Run: USER1_PASSWORD=xxx USER2_PASSWORD=yyy node tests/test-cross-profile-updates.js');
        console.log('   3. Or manually test by:');
        console.log('      - Creating a lead/client on one profile');
        console.log('      - Checking if it appears on the other profile within 5-10 seconds');
        console.log('      - Checking browser console logs for sync messages');
        
        return 0;
    } catch (error) {
        console.error('❌ API structure test failed:', error.message);
        return 1;
    }
}

async function testCrossProfileUpdates() {
    console.log('🧪 Starting Cross-Profile Update Test');
    console.log('='.repeat(60));
    
    // Check if passwords are provided
    if (!USER1.password || !USER2.password) {
        console.log('\n⚠️  Passwords not provided via environment variables.');
        console.log('   Set USER1_PASSWORD and USER2_PASSWORD environment variables to run full test.');
        console.log('   Example: USER1_PASSWORD=pass1 USER2_PASSWORD=pass2 node tests/test-cross-profile-updates.js');
        console.log('\n📋 Running API structure test instead...');
        return testAPIStructure();
    }
    
    try {
        // Step 1: Login both users
        console.log('\n📝 Step 1: Logging in both users...');
        user1Token = await login(USER1.email, USER1.password);
        console.log(`✅ User 1 (${USER1.email}) logged in`);
        
        user2Token = await login(USER2.email, USER2.password);
        console.log(`✅ User 2 (${USER2.email}) logged in`);
        
        // Step 2: Get initial counts
        console.log('\n📊 Step 2: Getting initial counts...');
        const user1InitialLeads = await getLeads(user1Token);
        const user2InitialLeads = await getLeads(user2Token);
        const user1InitialClients = await getClients(user1Token);
        const user2InitialClients = await getClients(user2Token);
        
        console.log(`User 1: ${user1InitialLeads.length} leads, ${user1InitialClients.length} clients`);
        console.log(`User 2: ${user2InitialLeads.length} leads, ${user2InitialClients.length} clients`);
        
        // Verify both users see the same data initially
        if (user1InitialLeads.length !== user2InitialLeads.length) {
            console.warn(`⚠️ WARNING: Lead counts differ! User1: ${user1InitialLeads.length}, User2: ${user2InitialLeads.length}`);
        } else {
            console.log(`✅ Both users see same number of leads: ${user1InitialLeads.length}`);
        }
        
        if (user1InitialClients.length !== user2InitialClients.length) {
            console.warn(`⚠️ WARNING: Client counts differ! User1: ${user1InitialClients.length}, User2: ${user2InitialClients.length}`);
        } else {
            console.log(`✅ Both users see same number of clients: ${user1InitialClients.length}`);
        }
        
        // Step 3: User 1 creates a test lead
        console.log('\n➕ Step 3: User 1 creating test lead...');
        const testLeadName = `TEST LEAD ${Date.now()}`;
        const newLead = await createLead(user1Token, {
            name: testLeadName,
            industry: 'Technology',
            stage: 'Awareness',
            value: 10000
        });
        console.log(`✅ User 1 created lead: ${newLead.name} (ID: ${newLead.id})`);
        
        // Step 4: Wait and check if User 2 sees it
        console.log('\n⏳ Step 4: Waiting 5 seconds for sync...');
        await wait(5000);
        
        console.log('🔍 Checking if User 2 sees the new lead...');
        let user2LeadsAfter = await getLeads(user2Token);
        let foundLead = user2LeadsAfter.find(l => l.id === newLead.id);
        
        if (foundLead) {
            console.log(`✅ SUCCESS: User 2 sees the new lead immediately!`);
            console.log(`   Lead name: ${foundLead.name}`);
        } else {
            console.log(`⚠️ User 2 doesn't see the lead yet, checking again in 5 seconds...`);
            await wait(5000);
            user2LeadsAfter = await getLeads(user2Token);
            foundLead = user2LeadsAfter.find(l => l.id === newLead.id);
            
            if (foundLead) {
                console.log(`✅ SUCCESS: User 2 sees the new lead after 10 seconds`);
            } else {
                console.log(`❌ FAILURE: User 2 still doesn't see the lead after 10 seconds`);
                console.log(`   Expected lead ID: ${newLead.id}`);
                console.log(`   User 2 lead IDs: ${user2LeadsAfter.map(l => l.id).join(', ')}`);
            }
        }
        
        // Step 5: User 2 creates a test client
        console.log('\n➕ Step 5: User 2 creating test client...');
        const testClientName = `TEST CLIENT ${Date.now()}`;
        const newClient = await createClient(user2Token, {
            name: testClientName,
            industry: 'Manufacturing',
            status: 'active'
        });
        console.log(`✅ User 2 created client: ${newClient.name} (ID: ${newClient.id})`);
        
        // Step 6: Wait and check if User 1 sees it
        console.log('\n⏳ Step 6: Waiting 5 seconds for sync...');
        await wait(5000);
        
        console.log('🔍 Checking if User 1 sees the new client...');
        let user1ClientsAfter = await getClients(user1Token);
        let foundClient = user1ClientsAfter.find(c => c.id === newClient.id);
        
        if (foundClient) {
            console.log(`✅ SUCCESS: User 1 sees the new client immediately!`);
            console.log(`   Client name: ${foundClient.name}`);
        } else {
            console.log(`⚠️ User 1 doesn't see the client yet, checking again in 5 seconds...`);
            await wait(5000);
            user1ClientsAfter = await getClients(user1Token);
            foundClient = user1ClientsAfter.find(c => c.id === newClient.id);
            
            if (foundClient) {
                console.log(`✅ SUCCESS: User 1 sees the new client after 10 seconds`);
            } else {
                console.log(`❌ FAILURE: User 1 still doesn't see the client after 10 seconds`);
                console.log(`   Expected client ID: ${newClient.id}`);
                console.log(`   User 1 client IDs: ${user1ClientsAfter.map(c => c.id).join(', ')}`);
            }
        }
        
        // Step 7: Final verification
        console.log('\n📊 Step 7: Final verification...');
        const user1FinalLeads = await getLeads(user1Token);
        const user2FinalLeads = await getLeads(user2Token);
        const user1FinalClients = await getClients(user1Token);
        const user2FinalClients = await getClients(user2Token);
        
        console.log(`\nFinal counts:`);
        console.log(`User 1: ${user1FinalLeads.length} leads, ${user1FinalClients.length} clients`);
        console.log(`User 2: ${user2FinalLeads.length} leads, ${user2FinalClients.length} clients`);
        
        // Check if counts match
        const leadsMatch = user1FinalLeads.length === user2FinalLeads.length;
        const clientsMatch = user1FinalClients.length === user2FinalClients.length;
        
        if (leadsMatch && clientsMatch) {
            console.log(`\n✅ TEST PASSED: Both users see the same counts`);
        } else {
            console.log(`\n❌ TEST FAILED: Counts don't match`);
            if (!leadsMatch) {
                console.log(`   Leads: User1=${user1FinalLeads.length}, User2=${user2FinalLeads.length}`);
            }
            if (!clientsMatch) {
                console.log(`   Clients: User1=${user1FinalClients.length}, User2=${user2FinalClients.length}`);
            }
        }
        
        // Check if both users see both test records
        const user1SeesLead = user1FinalLeads.find(l => l.id === newLead.id);
        const user2SeesLead = user2FinalLeads.find(l => l.id === newLead.id);
        const user1SeesClient = user1FinalClients.find(c => c.id === newClient.id);
        const user2SeesClient = user2FinalClients.find(c => c.id === newClient.id);
        
        console.log(`\nVisibility check:`);
        console.log(`Lead "${newLead.name}":`);
        console.log(`   User 1 sees it: ${user1SeesLead ? '✅' : '❌'}`);
        console.log(`   User 2 sees it: ${user2SeesLead ? '✅' : '❌'}`);
        console.log(`Client "${newClient.name}":`);
        console.log(`   User 1 sees it: ${user1SeesClient ? '✅' : '❌'}`);
        console.log(`   User 2 sees it: ${user2SeesClient ? '✅' : '❌'}`);
        
        const allVisible = user1SeesLead && user2SeesLead && user1SeesClient && user2SeesClient;
        
        if (allVisible) {
            console.log(`\n🎉 ALL TESTS PASSED: Cross-profile updates working correctly!`);
            return 0;
        } else {
            console.log(`\n❌ SOME TESTS FAILED: Cross-profile updates not working correctly`);
            return 1;
        }
        
    } catch (error) {
        console.error('\n❌ TEST ERROR:', error.message);
        console.error(error.stack);
        return 1;
    }
}

// Run the test
testCrossProfileUpdates()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });

