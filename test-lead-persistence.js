// Test script to diagnose lead status persistence issue
// Run this in the browser console

window.testLeadPersistence = async () => {
    console.log('🔬 === LEAD PERSISTENCE DIAGNOSTIC TEST ===');
    
    try {
        // 1. Get the Zamera lead
        console.log('\n📋 Step 1: Fetching Zamera lead...');
        const leadsResponse = await window.api.getLeads();
        const leads = leadsResponse?.data?.leads || [];
        const zamera = leads.find(l => l.name === 'Zamera');
        
        if (!zamera) {
            console.error('❌ Zamera lead not found!');
            return;
        }
        
        console.log('✅ Found Zamera:', {
            id: zamera.id,
            status: zamera.status,
            stage: zamera.stage,
            updatedAt: zamera.updatedAt
        });
        
        // 2. Update status to a test value
        const testStatus = zamera.status === 'Active' ? 'Disinterested' : 'Active';
        console.log(`\n🔄 Step 2: Updating status from "${zamera.status}" to "${testStatus}"...`);
        
        const updateResponse = await window.api.updateLead(zamera.id, {
            status: testStatus,
            stage: zamera.stage
        });
        
        console.log('✅ Update response:', {
            status: updateResponse?.data?.lead?.status,
            stage: updateResponse?.data?.lead?.stage,
            updatedAt: updateResponse?.data?.lead?.updatedAt
        });
        
        // 3. Immediately re-fetch to verify
        console.log('\n🔍 Step 3: Re-fetching immediately to verify...');
        const verifyResponse1 = await window.api.getLead(zamera.id);
        const verifiedLead1 = verifyResponse1?.data?.lead;
        
        console.log('✅ Immediate re-fetch:', {
            status: verifiedLead1?.status,
            stage: verifiedLead1?.stage,
            updatedAt: verifiedLead1?.updatedAt
        });
        
        if (verifiedLead1?.status !== testStatus) {
            console.error('❌ PROBLEM DETECTED: Status changed immediately!');
            console.error(`   Expected: ${testStatus}, Got: ${verifiedLead1?.status}`);
        } else {
            console.log('✅ Status persisted correctly in immediate re-fetch');
        }
        
        // 4. Wait 2 seconds and check again
        console.log('\n⏳ Step 4: Waiting 2 seconds and checking again...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const verifyResponse2 = await window.api.getLead(zamera.id);
        const verifiedLead2 = verifyResponse2?.data?.lead;
        
        console.log('✅ After 2 seconds:', {
            status: verifiedLead2?.status,
            stage: verifiedLead2?.stage,
            updatedAt: verifiedLead2?.updatedAt
        });
        
        if (verifiedLead2?.status !== testStatus) {
            console.error('❌ PROBLEM DETECTED: Status reverted after 2 seconds!');
            console.error(`   Expected: ${testStatus}, Got: ${verifiedLead2?.status}`);
        } else {
            console.log('✅ Status still correct after 2 seconds');
        }
        
        // 5. Check via /clients endpoint (how data is loaded on page refresh)
        console.log('\n🌐 Step 5: Checking via /clients endpoint (used on page load)...');
        const clientsResponse = await window.api.listClients();
        const allClients = clientsResponse?.data?.clients || [];
        const zameraViaClients = allClients.find(c => c.id === zamera.id);
        
        console.log('✅ Via /clients endpoint:', {
            status: zameraViaClients?.status,
            stage: zameraViaClients?.stage,
            updatedAt: zameraViaClients?.updatedAt
        });
        
        if (zameraViaClients?.status !== testStatus) {
            console.error('❌ CRITICAL PROBLEM: /clients endpoint returns different status!');
            console.error(`   Expected: ${testStatus}, Got: ${zameraViaClients?.status}`);
            console.error('   This explains why page refresh shows wrong data!');
        } else {
            console.log('✅ /clients endpoint returns correct status');
        }
        
        // Summary
        console.log('\n📊 === TEST SUMMARY ===');
        console.log(`Original status: ${zamera.status}`);
        console.log(`Updated to: ${testStatus}`);
        console.log(`Immediate /leads check: ${verifiedLead1?.status} ${verifiedLead1?.status === testStatus ? '✅' : '❌'}`);
        console.log(`After 2 seconds /leads check: ${verifiedLead2?.status} ${verifiedLead2?.status === testStatus ? '✅' : '❌'}`);
        console.log(`/clients endpoint check: ${zameraViaClients?.status} ${zameraViaClients?.status === testStatus ? '✅' : '❌'}`);
        
        return {
            success: true,
            originalStatus: zamera.status,
            testStatus: testStatus,
            immediateCheck: verifiedLead1?.status,
            delayedCheck: verifiedLead2?.status,
            clientsEndpointCheck: zameraViaClients?.status
        };
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

console.log('✅ Lead persistence test loaded');
console.log('💡 Run: window.testLeadPersistence()');
