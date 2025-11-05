// Quick Browser Test for Calendar Auto-Save
// Copy and paste this into your browser console on https://abcoafrica.co.za
// Make sure you're logged in first!

(async () => {
    console.log('🧪 Testing Calendar Notes Auto-Save\n');
    
    const token = window.storage?.getToken?.();
    if (!token) {
        console.error('❌ Please log in first!');
        return;
    }
    
    const testDate = new Date().toISOString().split('T')[0];
    const testNote = `Auto-save test ${Date.now()}`;
    
    console.log('📅 Date:', testDate);
    console.log('📝 Note:', testNote);
    console.log('');
    
    // Test 1: Save
    console.log('💾 Step 1: Saving note...');
    const saveRes = await fetch('/api/calendar-notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ date: testDate, note: testNote })
    });
    
    if (!saveRes.ok) {
        console.error('❌ Save failed:', await saveRes.text());
        return;
    }
    
    const saveData = await saveRes.json();
    console.log('✅ Save successful!', saveData.data?.saved ? '✓' : '✗');
    console.log('');
    
    // Test 2: Wait and fetch
    console.log('⏳ Step 2: Waiting 1 second...');
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('📥 Step 3: Fetching notes...');
    const fetchRes = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    const fetchData = await fetchRes.json();
    const notes = fetchData?.data?.notes || fetchData?.notes || {};
    const saved = notes[testDate];
    
    console.log('');
    console.log('🔍 Step 4: Verifying...');
    if (saved === testNote) {
        console.log('✅ SUCCESS! Note persisted correctly!');
    } else {
        console.log('❌ FAILED! Note:', saved ? 'Found but different' : 'Not found');
        console.log('   Expected:', testNote);
        console.log('   Got:', saved || 'NOT FOUND');
    }
    
    // Cleanup
    await fetch(`/api/calendar-notes/${testDate}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('');
    console.log('✅ Test complete!');
})();

