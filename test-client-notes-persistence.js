/**
 * Browser console test for notes persistence in ClientDetailModal
 * 
 * Usage: Copy this entire script and paste it into the browser console
 * while viewing a client detail modal
 * 
 * Or run: window.testClientNotesPersistence()
 */

window.testClientNotesPersistence = async () => {
    console.log('🧪 === CLIENT NOTES PERSISTENCE TEST ===\n');
    
    try {
        // Step 1: Find a test client
        console.log('📋 Step 1: Finding a test client...');
        const clientsResponse = await window.api.listClients();
        const clients = clientsResponse?.data?.clients || [];
        
        if (clients.length === 0) {
            console.error('❌ No clients found!');
            return;
        }
        
        const testClient = clients[0];
        console.log('✅ Found test client:', {
            id: testClient.id,
            name: testClient.name,
            currentNotes: testClient.notes?.substring(0, 50) || '(none)'
        });
        
        // Step 2: Save a unique test note
        const timestamp = new Date().toISOString();
        const testNotes = `TEST NOTES ${timestamp} - This should persist`;
        console.log(`\n💾 Step 2: Saving test notes: "${testNotes}"`);
        
        const updateResponse = await window.api.updateClient(testClient.id, {
            notes: testNotes
        });
        
        const savedClient = updateResponse?.data?.client;
        console.log('✅ Save response:', {
            notesLength: savedClient?.notes?.length || 0,
            notesPreview: savedClient?.notes?.substring(0, 50) || '(none)'
        });
        
        if (!savedClient?.notes || !savedClient.notes.includes('TEST NOTES')) {
            console.error('❌ PROBLEM: Notes not saved correctly!');
            return;
        }
        
        // Step 3: Immediately re-fetch to verify
        console.log('\n🔍 Step 3: Immediately re-fetching to verify...');
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        
        const verifyResponse1 = await window.api.getClient(testClient.id);
        const verifiedClient1 = verifyResponse1?.data?.client;
        
        console.log('✅ Immediate re-fetch:', {
            notesLength: verifiedClient1?.notes?.length || 0,
            notesPreview: verifiedClient1?.notes?.substring(0, 50) || '(none)',
            hasTestNotes: verifiedClient1?.notes?.includes('TEST NOTES') || false
        });
        
        if (!verifiedClient1?.notes?.includes('TEST NOTES')) {
            console.error('❌ PROBLEM DETECTED: Notes disappeared immediately!');
            console.error('   Expected:', testNotes);
            console.error('   Got:', verifiedClient1?.notes || '(empty)');
        } else {
            console.log('✅ Notes persisted correctly in immediate re-fetch');
        }
        
        // Step 4: Wait 2 seconds and check again
        console.log('\n⏳ Step 4: Waiting 2 seconds and checking again...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const verifyResponse2 = await window.api.getClient(testClient.id);
        const verifiedClient2 = verifyResponse2?.data?.client;
        
        console.log('✅ After 2 seconds:', {
            notesLength: verifiedClient2?.notes?.length || 0,
            notesPreview: verifiedClient2?.notes?.substring(0, 50) || '(none)',
            hasTestNotes: verifiedClient2?.notes?.includes('TEST NOTES') || false
        });
        
        if (!verifiedClient2?.notes?.includes('TEST NOTES')) {
            console.error('❌ PROBLEM DETECTED: Notes disappeared after 2 seconds!');
            console.error('   Expected:', testNotes);
            console.error('   Got:', verifiedClient2?.notes || '(empty)');
        } else {
            console.log('✅ Notes still correct after 2 seconds');
        }
        
        // Step 5: Check via /clients endpoint (how data is loaded on page refresh)
        console.log('\n🌐 Step 5: Checking via /clients endpoint (used on page load)...');
        const clientsResponse2 = await window.api.listClients();
        const allClients = clientsResponse2?.data?.clients || [];
        const clientViaClients = allClients.find(c => c.id === testClient.id);
        
        console.log('✅ Via /clients endpoint:', {
            notesLength: clientViaClients?.notes?.length || 0,
            notesPreview: clientViaClients?.notes?.substring(0, 50) || '(none)',
            hasTestNotes: clientViaClients?.notes?.includes('TEST NOTES') || false
        });
        
        if (!clientViaClients?.notes?.includes('TEST NOTES')) {
            console.error('❌ CRITICAL PROBLEM: /clients endpoint returns different notes!');
            console.error('   Expected:', testNotes.substring(0, 50));
            console.error('   Got:', clientViaClients?.notes?.substring(0, 50) || '(empty)');
            console.error('   This explains why page refresh shows wrong data!');
        } else {
            console.log('✅ /clients endpoint returns correct notes');
        }
        
        // Step 6: Simulate page refresh by reloading from localStorage
        console.log('\n💾 Step 6: Checking localStorage...');
        const storedClients = JSON.parse(localStorage.getItem('clients') || '[]');
        const clientFromStorage = storedClients.find(c => c.id === testClient.id);
        
        console.log('✅ From localStorage:', {
            notesLength: clientFromStorage?.notes?.length || 0,
            notesPreview: clientFromStorage?.notes?.substring(0, 50) || '(none)',
            hasTestNotes: clientFromStorage?.notes?.includes('TEST NOTES') || false
        });
        
        if (!clientFromStorage?.notes?.includes('TEST NOTES')) {
            console.warn('⚠️ localStorage notes differ - this might be expected if using API-first approach');
        } else {
            console.log('✅ localStorage contains correct notes');
        }
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 TEST SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Test Notes: ${testNotes.substring(0, 50)}...`);
        console.log(`Immediate /client check: ${verifiedClient1?.notes?.includes('TEST NOTES') ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`After 2 seconds /client check: ${verifiedClient2?.notes?.includes('TEST NOTES') ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`/clients endpoint check: ${clientViaClients?.notes?.includes('TEST NOTES') ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`localStorage check: ${clientFromStorage?.notes?.includes('TEST NOTES') ? '✅ PASS' : '⚠️ WARN'}`);
        
        const allPassed = 
            verifiedClient1?.notes?.includes('TEST NOTES') &&
            verifiedClient2?.notes?.includes('TEST NOTES') &&
            clientViaClients?.notes?.includes('TEST NOTES');
        
        if (allPassed) {
            console.log('\n🎉 ALL TESTS PASSED! Notes persistence is working correctly.');
        } else {
            console.log('\n❌ SOME TESTS FAILED! Check the logs above for details.');
        }
        
        return {
            success: allPassed,
            testNotes: testNotes,
            immediateCheck: verifiedClient1?.notes?.includes('TEST NOTES'),
            delayedCheck: verifiedClient2?.notes?.includes('TEST NOTES'),
            clientsEndpointCheck: clientViaClients?.notes?.includes('TEST NOTES'),
            localStorageCheck: clientFromStorage?.notes?.includes('TEST NOTES')
        };
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        console.error('Stack:', error.stack);
        return {
            success: false,
            error: error.message
        };
    }
};

console.log('✅ Client notes persistence test loaded');
console.log('💡 Run: window.testClientNotesPersistence()');
console.log('💡 Or copy the function and run it manually');

