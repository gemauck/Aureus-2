#!/usr/bin/env node

/**
 * Test script for Leads API endpoint
 * Tests the /api/leads endpoint and /api/leads/[id] endpoint
 * 
 * Usage:
 *   node test-leads-api.js [leadId]
 * 
 * If leadId is provided, tests fetching that specific lead
 * Otherwise, tests fetching all leads and then the first lead
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function testLeadsAPI(leadId = null) {
    console.log('🧪 Testing Leads API...\n');
    console.log(`📍 API Base: ${API_BASE}\n`);
    
    // For testing, we'd need authentication
    // This is a basic test structure - you'll need to provide a token
    const token = process.env.TEST_TOKEN;
    
    if (!token && !leadId) {
        console.log('⚠️  No authentication token provided.');
        console.log('   Set TEST_TOKEN environment variable or provide leadId for server-side testing');
        console.log('   Example: TEST_TOKEN=your_token node test-leads-api.js\n');
        console.log('   Or test specific lead: node test-leads-api.js cmiqfdanm00193jwc0zdshlpv\n');
        return;
    }
    
    try {
        // Test 1: Get all leads
        console.log('='.repeat(60));
        console.log('TEST 1: GET /api/leads (List all leads)');
        console.log('='.repeat(60));
        
        const headers = token ? {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        } : {
            'Content-Type': 'application/json'
        };
        
        const allLeadsResponse = await fetch(`${API_BASE}/api/leads`, {
            method: 'GET',
            headers
        });
        
        console.log(`📊 Status: ${allLeadsResponse.status} ${allLeadsResponse.statusText}`);
        
        if (!allLeadsResponse.ok) {
            const errorText = await allLeadsResponse.text();
            console.error(`❌ Failed to get leads: ${allLeadsResponse.status}`);
            console.error(`   Response: ${errorText.substring(0, 200)}`);
            return;
        }
        
        const allLeadsData = await allLeadsResponse.json();
        const leads = allLeadsData.leads || allLeadsData.data?.leads || [];
        
        console.log(`✅ Successfully fetched ${leads.length} leads`);
        
        if (leads.length > 0) {
            console.log(`📋 First 5 lead IDs:`, leads.slice(0, 5).map(l => l.id));
            console.log(`📋 First 5 lead names:`, leads.slice(0, 5).map(l => l.name));
            
            // Test 2: Get specific lead (use provided ID or first lead)
            const testLeadId = leadId || leads[0].id;
            
            console.log('\n' + '='.repeat(60));
            console.log(`TEST 2: GET /api/leads/${testLeadId} (Get specific lead)`);
            console.log('='.repeat(60));
            
            const leadResponse = await fetch(`${API_BASE}/api/leads/${testLeadId}`, {
                method: 'GET',
                headers
            });
            
            console.log(`📊 Status: ${leadResponse.status} ${leadResponse.statusText}`);
            
            if (!leadResponse.ok) {
                const errorText = await leadResponse.text();
                console.error(`❌ Failed to get lead ${testLeadId}: ${leadResponse.status}`);
                console.error(`   Response: ${errorText.substring(0, 500)}`);
                
                // Try to parse as JSON for more details
                try {
                    const errorData = JSON.parse(errorText);
                    console.error(`   Error details:`, JSON.stringify(errorData, null, 2));
                } catch (e) {
                    // Not JSON, already logged as text
                }
                return;
            }
            
            const leadData = await leadResponse.json();
            const lead = leadData.lead || leadData.data?.lead;
            
            if (lead) {
                console.log(`✅ Successfully fetched lead: ${lead.name} (${lead.id})`);
                console.log(`   Status: ${lead.status}`);
                console.log(`   Stage: ${lead.stage}`);
                console.log(`   Type: ${lead.type}`);
                console.log(`   Contacts: ${lead.contacts?.length || lead.clientContacts?.length || 0}`);
                console.log(`   Sites: ${lead.sites?.length || lead.clientSites?.length || 0}`);
            } else {
                console.error(`❌ Lead data not found in response`);
                console.log(`   Response:`, JSON.stringify(leadData, null, 2).substring(0, 500));
            }
        } else {
            console.log('⚠️  No leads found to test individual lead fetch');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Tests completed');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        console.error('   Error message:', error.message);
        console.error('   Stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
    }
}

// Get lead ID from command line args
const leadId = process.argv[2] || null;

// Run the test
testLeadsAPI(leadId).catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});

