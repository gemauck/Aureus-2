// Quick test script to verify calendar note persistence
// This can be run in browser console to test the save/load flow

const testCalendarPersistence = async () => {
    console.log('🧪 Testing Calendar Note Persistence\n');
    
    const testDate = new Date().toISOString().split('T')[0];
    const testNote = `Test note at ${new Date().toISOString()}`;
    
    console.log('Test Date:', testDate);
    console.log('Test Note:', testNote);
    console.log('');
    
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            console.error('❌ No auth token - please log in first');
            return;
        }
        
        // Step 1: Save a note
        console.log('📝 Step 1: Saving note...');
        const saveRes = await fetch('/api/calendar-notes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify({
                date: testDate,
                note: testNote
            })
        });
        
        if (!saveRes.ok) {
            const errorText = await saveRes.text();
            console.error('❌ Save failed:', saveRes.status, errorText);
            return;
        }
        
        const saveData = await saveRes.json();
        console.log('✅ Save response:', saveData);
        console.log('   Response structure:', {
            hasData: !!saveData.data,
            saved: saveData.data?.saved,
            noteId: saveData.data?.id
        });
        console.log('');
        
        // Step 2: Wait a moment for database write
        console.log('⏳ Waiting 1 second for database write...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('');
        
        // Step 3: Fetch all notes
        console.log('📥 Step 2: Fetching all notes...');
        const fetchRes = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            },
            credentials: 'include',
            cache: 'no-store'
        });
        
        if (!fetchRes.ok) {
            const errorText = await fetchRes.text();
            console.error('❌ Fetch failed:', fetchRes.status, errorText);
            return;
        }
        
        const fetchData = await fetchRes.json();
        console.log('✅ Fetch response received');
        console.log('   Response structure:', {
            hasData: !!fetchData.data,
            hasNotes: !!fetchData.data?.notes,
            notesType: typeof fetchData.data?.notes
        });
        
        const notes = fetchData?.data?.notes || fetchData?.notes || {};
        console.log('   Total notes:', Object.keys(notes).length);
        console.log('   Note dates:', Object.keys(notes));
        console.log('');
        
        // Step 4: Verify note exists
        console.log('🔍 Step 3: Verifying saved note...');
        const savedNote = notes[testDate];
        
        if (savedNote === testNote) {
            console.log('✅ SUCCESS: Note persisted correctly!');
            console.log('   Date:', testDate);
            console.log('   Content matches:', savedNote === testNote);
            console.log('   Note length:', savedNote.length);
        } else if (savedNote) {
            console.log('⚠️ WARNING: Note found but content differs');
            console.log('   Expected:', testNote);
            console.log('   Got:', savedNote);
        } else {
            console.log('❌ FAILURE: Note not found in fetched notes');
            console.log('   Looking for date:', testDate);
            console.log('   Available dates:', Object.keys(notes));
        }
        console.log('');
        
        // Step 5: Clean up
        console.log('🧹 Step 4: Cleaning up test note...');
        const deleteRes = await fetch(`/api/calendar-notes/${testDate}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            },
            credentials: 'include'
        });
        
        if (deleteRes.ok) {
            console.log('✅ Test note deleted');
        } else {
            console.warn('⚠️ Failed to delete test note (may need manual cleanup)');
        }
        
        console.log('');
        console.log('✅ Test completed!');
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.testCalendarPersistence = testCalendarPersistence;
    console.log('✅ Test function available: window.testCalendarPersistence()');
}

// Run if called directly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = testCalendarPersistence;
}
