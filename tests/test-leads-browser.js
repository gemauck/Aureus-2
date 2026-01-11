/**
 * Browser Console Test Script for Leads
 * 
 * Run this in the browser console to test leads functionality
 * 
 * Instructions:
 * 1. Open browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire script
 * 3. Run it to test leads API and UI
 */

(async function testLeadsInBrowser() {
    console.log('🧪 Testing Leads in Browser...\n');
    console.log('='.repeat(60));
    
    // Check authentication
    const token = window.storage?.getToken?.();
    if (!token) {
        console.error('❌ No authentication token found. Please log in first.');
        return;
    }
    
    console.log('✅ Authentication token found\n');
    
    const API_BASE = window.location.origin;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    
    try {
        // Test 1: Get all leads
        console.log('='.repeat(60));
        console.log('TEST 1: GET /api/leads (List all leads)');
        console.log('='.repeat(60));
        
        const leadsRes = await fetch(`${API_BASE}/api/leads`, { headers });
        console.log(`📊 Status: ${leadsRes.status} ${leadsRes.statusText}`);
        
        if (!leadsRes.ok) {
            const errorText = await leadsRes.text();
            console.error(`❌ Failed to get leads: ${leadsRes.status}`);
            console.error(`   Response: ${errorText.substring(0, 500)}`);
            return;
        }
        
        const leadsData = await leadsRes.json();
        const leads = leadsData.leads || leadsData.data?.leads || [];
        console.log(`✅ Successfully fetched ${leads.length} leads\n`);
        
        if (leads.length === 0) {
            console.log('⚠️  No leads found');
            return;
        }
        
        console.log(`📋 First 5 leads:`);
        leads.slice(0, 5).forEach((lead, idx) => {
            console.log(`   ${idx + 1}. ${lead.name} (${lead.id}) - ${lead.status || 'N/A'}`);
        });
        console.log('');
        
        // Test 2: Test fetching specific leads
        console.log('='.repeat(60));
        console.log('TEST 2: GET /api/leads/[id] (Get specific leads)');
        console.log('='.repeat(60));
        
        const testLeadIds = leads.slice(0, 3).map(l => l.id);
        const testResults = [];
        
        for (const leadId of testLeadIds) {
            const lead = leads.find(l => l.id === leadId);
            console.log(`\n📋 Testing lead: ${lead?.name || leadId}`);
            
            try {
                const leadRes = await fetch(`${API_BASE}/api/leads/${leadId}`, { headers });
                const status = leadRes.status;
                
                console.log(`   Status: ${status} ${leadRes.statusText}`);
                
                if (!leadRes.ok) {
                    const errorText = await leadRes.text();
                    console.error(`   ❌ Failed to get lead ${leadId}: ${status}`);
                    console.error(`   Response: ${errorText.substring(0, 300)}`);
                    
                    // Try to parse error for more details
                    try {
                        const errorData = JSON.parse(errorText);
                        console.error(`   Error details:`, errorData);
                    } catch (e) {
                        // Not JSON
                    }
                    
                    testResults.push({ leadId, name: lead?.name, status, error: true });
                } else {
                    const leadData = await leadRes.json();
                    const fetchedLead = leadData.lead || leadData.data?.lead;
                    
                    if (fetchedLead) {
                        console.log(`   ✅ Successfully fetched lead: ${fetchedLead.name}`);
                        console.log(`      Status: ${fetchedLead.status || 'N/A'}`);
                        console.log(`      Type: ${fetchedLead.type || 'N/A'}`);
                        testResults.push({ leadId, name: fetchedLead.name, status, error: false });
                    } else {
                        console.error(`   ❌ Lead data not found in response`);
                        testResults.push({ leadId, name: lead?.name, status, error: true, message: 'No lead data in response' });
                    }
                }
            } catch (error) {
                console.error(`   ❌ Error fetching lead ${leadId}:`, error.message);
                testResults.push({ leadId, name: lead?.name, error: true, message: error.message });
            }
        }
        
        // Test 3: Test opening lead in UI
        console.log('\n' + '='.repeat(60));
        console.log('TEST 3: UI Integration (Opening leads)');
        console.log('='.repeat(60));
        
        // Check if API methods are available
        if (window.api?.getLead) {
            console.log('✅ window.api.getLead is available');
            
            // Test using the API wrapper
            const testLeadId = testResults.find(r => !r.error)?.leadId || leads[0].id;
            console.log(`\n📋 Testing window.api.getLead('${testLeadId}')...`);
            
            try {
                const apiResponse = await window.api.getLead(testLeadId);
                const apiLead = apiResponse?.data?.lead || apiResponse?.lead;
                
                if (apiLead) {
                    console.log(`✅ window.api.getLead succeeded: ${apiLead.name}`);
                } else {
                    console.error(`❌ window.api.getLead returned no lead data`);
                }
            } catch (error) {
                console.error(`❌ window.api.getLead failed:`, error.message);
            }
        } else {
            console.log('⚠️  window.api.getLead not available');
        }
        
        // Check if LeadDetailModal component is available
        if (window.LeadDetailModal) {
            console.log('✅ LeadDetailModal component is available');
        } else {
            console.log('⚠️  LeadDetailModal component not found in window object');
        }
        
        // Test event system
        console.log('\n📋 Testing event system...');
        
        // Test the actual event used in the app: openLeadDetailFromPipeline
        const testEvent = new CustomEvent('openLeadDetailFromPipeline', { 
            detail: { leadId: leads[0].id, lead: leads[0] } 
        });
        
        let eventHandled = false;
        const eventHandler = () => {
            eventHandled = true;
            console.log('✅ openLeadDetailFromPipeline event was handled');
        };
        
        window.addEventListener('openLeadDetailFromPipeline', eventHandler);
        window.dispatchEvent(testEvent);
        window.removeEventListener('openLeadDetailFromPipeline', eventHandler);
        
        if (!eventHandled) {
            console.log('⚠️  openLeadDetailFromPipeline event was not handled (no listener found)');
        }
        
        // Test direct function call if available
        if (window.__openLeadDetailFromPipeline) {
            console.log('✅ window.__openLeadDetailFromPipeline function is available');
            console.log('   You can call it directly: window.__openLeadDetailFromPipeline({ leadId: "..." })');
        } else {
            console.log('⚠️  window.__openLeadDetailFromPipeline function not found');
        }
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('TEST SUMMARY');
        console.log('='.repeat(60));
        
        const successful = testResults.filter(r => !r.error).length;
        const failed = testResults.filter(r => r.error).length;
        
        console.log(`📊 Total leads tested: ${testResults.length}`);
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        
        if (failed > 0) {
            console.log('\n❌ Failed leads:');
            testResults.filter(r => r.error).forEach(r => {
                console.log(`   - ${r.name || r.leadId}: Status ${r.status || 'Error'}`);
                if (r.message) console.log(`     ${r.message}`);
            });
        }
        
        // Check for the specific problematic lead
        const problemLeadId = 'cmiqfdanm00193jwc0zdshlpv';
        const problemLead = leads.find(l => l.id === problemLeadId);
        
        if (problemLead) {
            console.log('\n' + '='.repeat(60));
            console.log(`TESTING PROBLEMATIC LEAD: ${problemLeadId}`);
            console.log('='.repeat(60));
            console.log(`Name: ${problemLead.name}`);
            
            try {
                const problemRes = await fetch(`${API_BASE}/api/leads/${problemLeadId}`, { headers });
                console.log(`Status: ${problemRes.status} ${problemRes.statusText}`);
                
                if (!problemRes.ok) {
                    const errorText = await problemRes.text();
                    console.error(`❌ Failed with status ${problemRes.status}`);
                    console.error(`Response: ${errorText.substring(0, 500)}`);
                    
                    try {
                        const errorData = JSON.parse(errorText);
                        console.error(`Error object:`, JSON.stringify(errorData, null, 2));
                    } catch (e) {
                        // Not JSON
                    }
                } else {
                    const problemData = await problemRes.json();
                    console.log(`✅ Successfully fetched problematic lead`);
                    console.log(`Data:`, problemData);
                }
            } catch (error) {
                console.error(`❌ Error:`, error);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Tests completed');
        console.log('='.repeat(60));
        
        // Return results for further inspection
        return {
            totalLeads: leads.length,
            testResults,
            successful,
            failed
        };
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        console.error('Stack:', error.stack);
        return { error: error.message };
    }
})();

