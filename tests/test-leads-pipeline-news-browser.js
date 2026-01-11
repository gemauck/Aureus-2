/**
 * Browser Console Test Script for Leads, Pipeline, and News
 * 
 * Tests why leads, pipeline, and news are not opening
 * 
 * Instructions:
 * 1. Open browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire script
 * 3. Run it to diagnose the issues
 */

(async function testLeadsPipelineNews() {
    console.log('🧪 Testing Leads, Pipeline, and News...\n');
    console.log('='.repeat(70));
    
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
    
    const results = {
        leads: { api: false, components: false, events: false, errors: [] },
        pipeline: { api: false, components: false, events: false, errors: [] },
        news: { api: false, components: false, events: false, errors: [] }
    };
    
    try {
        // ============================================
        // TEST 1: LEADS
        // ============================================
        console.log('='.repeat(70));
        console.log('TEST 1: LEADS FUNCTIONALITY');
        console.log('='.repeat(70));
        
        try {
            // Test API: Get all leads
            console.log('\n📋 Testing GET /api/leads...');
            const leadsRes = await fetch(`${API_BASE}/api/leads`, { headers });
            console.log(`   Status: ${leadsRes.status} ${leadsRes.statusText}`);
            
            if (leadsRes.ok) {
                const leadsData = await leadsRes.json();
                const leads = leadsData.leads || leadsData.data?.leads || [];
                console.log(`   ✅ API works - Found ${leads.length} leads`);
                results.leads.api = true;
                
                // Test fetching a specific lead
                if (leads.length > 0) {
                    const testLead = leads[0];
                    console.log(`\n📋 Testing GET /api/leads/${testLead.id}...`);
                    const leadRes = await fetch(`${API_BASE}/api/leads/${testLead.id}`, { headers });
                    console.log(`   Status: ${leadRes.status} ${leadRes.statusText}`);
                    
                    if (leadRes.ok) {
                        console.log(`   ✅ Individual lead API works`);
                    } else {
                        const errorText = await leadRes.text();
                        console.error(`   ❌ Individual lead API failed: ${errorText.substring(0, 200)}`);
                        results.leads.errors.push(`Individual lead fetch failed: ${leadRes.status}`);
                    }
                }
            } else {
                const errorText = await leadsRes.text();
                console.error(`   ❌ API failed: ${errorText.substring(0, 200)}`);
                results.leads.errors.push(`List leads failed: ${leadsRes.status}`);
            }
        } catch (error) {
            console.error(`   ❌ API error:`, error.message);
            results.leads.errors.push(`API error: ${error.message}`);
        }
        
        // Check components
        console.log('\n📋 Checking Lead components...');
        const leadComponents = {
            'window.LeadDetailModal': window.LeadDetailModal,
            'window.api.getLead': window.api?.getLead,
            'window.__openLeadDetailFromPipeline': window.__openLeadDetailFromPipeline,
            'window.openLeadDetailFromPipeline': window.openLeadDetailFromPipeline
        };
        
        let leadComponentsFound = 0;
        for (const [name, component] of Object.entries(leadComponents)) {
            if (component) {
                console.log(`   ✅ ${name} is available`);
                leadComponentsFound++;
            } else {
                console.log(`   ❌ ${name} is NOT available`);
            }
        }
        
        if (leadComponentsFound > 0) {
            results.leads.components = true;
        }
        
        // Test event system
        console.log('\n📋 Testing Lead event system...');
        let leadEventHandled = false;
        const leadEventHandler = () => {
            leadEventHandled = true;
            console.log('   ✅ openLeadDetailFromPipeline event was handled');
        };
        
        window.addEventListener('openLeadDetailFromPipeline', leadEventHandler);
        window.dispatchEvent(new CustomEvent('openLeadDetailFromPipeline', { 
            detail: { leadId: 'test', lead: { id: 'test', name: 'Test' } } 
        }));
        window.removeEventListener('openLeadDetailFromPipeline', leadEventHandler);
        
        if (!leadEventHandled) {
            console.log('   ⚠️  openLeadDetailFromPipeline event was not handled');
        } else {
            results.leads.events = true;
        }
        
        // Try to open a lead programmatically
        if (window.__openLeadDetailFromPipeline) {
            console.log('\n📋 Testing programmatic lead opening...');
            try {
                const testLeadsRes = await fetch(`${API_BASE}/api/leads`, { headers });
                if (testLeadsRes.ok) {
                    const testLeadsData = await testLeadsRes.json();
                    const testLeads = testLeadsData.leads || testLeadsData.data?.leads || [];
                    if (testLeads.length > 0) {
                        console.log(`   Attempting to open lead: ${testLeads[0].name}`);
                        window.__openLeadDetailFromPipeline({ 
                            leadId: testLeads[0].id, 
                            lead: testLeads[0] 
                        });
                        console.log('   ✅ Function called successfully');
                    }
                }
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                results.leads.errors.push(`Opening lead failed: ${error.message}`);
            }
        }
        
        // ============================================
        // TEST 2: PIPELINE
        // ============================================
        console.log('\n' + '='.repeat(70));
        console.log('TEST 2: PIPELINE FUNCTIONALITY');
        console.log('='.repeat(70));
        
        try {
            // Test API: Get pipeline data (opportunities)
            console.log('\n📋 Testing GET /api/opportunities...');
            const oppRes = await fetch(`${API_BASE}/api/opportunities`, { headers });
            console.log(`   Status: ${oppRes.status} ${oppRes.statusText}`);
            
            if (oppRes.ok) {
                const oppData = await oppRes.json();
                const opportunities = oppData.opportunities || oppData.data?.opportunities || [];
                console.log(`   ✅ API works - Found ${opportunities.length} opportunities`);
                results.pipeline.api = true;
            } else {
                const errorText = await oppRes.text();
                console.error(`   ❌ API failed: ${errorText.substring(0, 200)}`);
                results.pipeline.errors.push(`Opportunities API failed: ${oppRes.status}`);
            }
        } catch (error) {
            console.error(`   ❌ API error:`, error.message);
            results.pipeline.errors.push(`API error: ${error.message}`);
        }
        
        // Check components
        console.log('\n📋 Checking Pipeline components...');
        const pipelineComponents = {
            'window.Pipeline': window.Pipeline,
            'window.Clients': window.Clients,
            'window.api.getOpportunities': window.api?.getOpportunities,
            'window.__openOpportunityDetailFromPipeline': window.__openOpportunityDetailFromPipeline
        };
        
        let pipelineComponentsFound = 0;
        for (const [name, component] of Object.entries(pipelineComponents)) {
            if (component) {
                console.log(`   ✅ ${name} is available`);
                pipelineComponentsFound++;
            } else {
                console.log(`   ❌ ${name} is NOT available`);
            }
        }
        
        if (pipelineComponentsFound > 0) {
            results.pipeline.components = true;
        }
        
        // Test event system
        console.log('\n📋 Testing Pipeline event system...');
        let pipelineEventHandled = false;
        const pipelineEventHandler = () => {
            pipelineEventHandled = true;
            console.log('   ✅ Pipeline events are working');
        };
        
        window.addEventListener('openOpportunityDetailFromPipeline', pipelineEventHandler);
        window.dispatchEvent(new CustomEvent('openOpportunityDetailFromPipeline', { 
            detail: { opportunityId: 'test', opportunity: { id: 'test' } } 
        }));
        window.removeEventListener('openOpportunityDetailFromPipeline', pipelineEventHandler);
        
        if (!pipelineEventHandled) {
            console.log('   ⚠️  Pipeline events were not handled');
        } else {
            results.pipeline.events = true;
        }
        
        // ============================================
        // TEST 3: NEWS
        // ============================================
        console.log('\n' + '='.repeat(70));
        console.log('TEST 3: NEWS FUNCTIONALITY');
        console.log('='.repeat(70));
        
        try {
            // Test API: Get news
            console.log('\n📋 Testing GET /api/client-news...');
            const newsRes = await fetch(`${API_BASE}/api/client-news`, { headers });
            console.log(`   Status: ${newsRes.status} ${newsRes.statusText}`);
            
            if (newsRes.ok) {
                const newsData = await newsRes.json();
                const news = newsData.news || newsData.data?.news || newsData.articles || [];
                console.log(`   ✅ API works - Found ${news.length} news items`);
                results.news.api = true;
            } else {
                const errorText = await newsRes.text();
                console.error(`   ❌ API failed: ${errorText.substring(0, 200)}`);
                results.news.errors.push(`News API failed: ${newsRes.status}`);
            }
        } catch (error) {
            console.error(`   ❌ API error:`, error.message);
            results.news.errors.push(`API error: ${error.message}`);
        }
        
        // Try alternative news endpoints
        const newsEndpoints = [
            '/api/news',
            '/api/client-news',
            '/api/rss-news',
            '/api/feeds'
        ];
        
        console.log('\n📋 Testing alternative news endpoints...');
        for (const endpoint of newsEndpoints) {
            try {
                const altRes = await fetch(`${API_BASE}${endpoint}`, { headers });
                if (altRes.ok) {
                    console.log(`   ✅ ${endpoint} works (Status: ${altRes.status})`);
                } else {
                    console.log(`   ❌ ${endpoint} failed (Status: ${altRes.status})`);
                }
            } catch (error) {
                console.log(`   ❌ ${endpoint} error: ${error.message}`);
            }
        }
        
        // Check components
        console.log('\n📋 Checking News components...');
        const newsComponents = {
            'window.ClientNewsFeed': window.ClientNewsFeed,
            'window.NewsFeed': window.NewsFeed
        };
        
        let newsComponentsFound = 0;
        for (const [name, component] of Object.entries(newsComponents)) {
            if (component) {
                console.log(`   ✅ ${name} is available`);
                newsComponentsFound++;
            } else {
                console.log(`   ❌ ${name} is NOT available`);
            }
        }
        
        if (newsComponentsFound > 0) {
            results.news.components = true;
        }
        
        // ============================================
        // SUMMARY
        // ============================================
        console.log('\n' + '='.repeat(70));
        console.log('DIAGNOSTIC SUMMARY');
        console.log('='.repeat(70));
        
        const features = [
            { name: 'Leads', result: results.leads },
            { name: 'Pipeline', result: results.pipeline },
            { name: 'News', result: results.news }
        ];
        
        for (const feature of features) {
            console.log(`\n📊 ${feature.name}:`);
            console.log(`   API: ${feature.result.api ? '✅' : '❌'}`);
            console.log(`   Components: ${feature.result.components ? '✅' : '❌'}`);
            console.log(`   Events: ${feature.result.events ? '✅' : '❌'}`);
            if (feature.result.errors.length > 0) {
                console.log(`   Errors:`);
                feature.result.errors.forEach(err => console.log(`     - ${err}`));
            }
        }
        
        // Check for common issues
        console.log('\n' + '='.repeat(70));
        console.log('COMMON ISSUES CHECK');
        console.log('='.repeat(70));
        
        // Check if React is loaded
        console.log(`\n📋 React: ${window.React ? '✅ Loaded' : '❌ NOT loaded'}`);
        console.log(`📋 ReactDOM: ${window.ReactDOM ? '✅ Loaded' : '❌ NOT loaded'}`);
        
        // Check if main app components are loaded
        console.log(`\n📋 Main Components:`);
        console.log(`   App: ${window.App ? '✅' : '❌'}`);
        console.log(`   Clients: ${window.Clients ? '✅' : '❌'}`);
        console.log(`   Projects: ${window.Projects ? '✅' : '❌'}`);
        
        // Check for console errors
        console.log(`\n⚠️  Check browser console for errors (red messages)`);
        
        // Recommendations
        console.log('\n' + '='.repeat(70));
        console.log('RECOMMENDATIONS');
        console.log('='.repeat(70));
        
        if (!results.leads.api) {
            console.log('\n❌ Leads API is not working - check server logs');
        }
        if (!results.leads.components) {
            console.log('\n❌ Lead components are not loaded - try refreshing the page');
        }
        if (!results.leads.events && results.leads.components) {
            console.log('\n⚠️  Lead events not working - components may not be initialized');
        }
        
        if (!results.pipeline.api) {
            console.log('\n❌ Pipeline API is not working - check server logs');
        }
        if (!results.pipeline.components) {
            console.log('\n❌ Pipeline components are not loaded - try refreshing the page');
        }
        
        if (!results.news.api) {
            console.log('\n❌ News API is not working - check server logs or endpoint URL');
        }
        if (!results.news.components) {
            console.log('\n❌ News components are not loaded - try refreshing the page');
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ Diagnostic test completed');
        console.log('='.repeat(70));
        
        return results;
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        console.error('Stack:', error.stack);
        return { error: error.message };
    }
})();

