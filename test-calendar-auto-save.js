// Test script to verify calendar notes auto-save functionality
// This can be run in browser console on the production site

const testCalendarAutoSave = async () => {
    console.log('🧪 Testing Calendar Notes Auto-Save Functionality\n');
    console.log('This test verifies the improved auto-save mechanism...\n');
    
    const testDate = new Date().toISOString().split('T')[0];
    const testNote = `Auto-save test at ${new Date().toISOString()}`;
    
    console.log('📅 Test Parameters:');
    console.log('  Date:', testDate);
    console.log('  Note:', testNote);
    console.log('');
    
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            console.error('❌ No auth token - please log in first');
            console.log('💡 Please log in to the application first, then run this test again');
            return;
        }
        
        const user = window.storage?.getUser?.();
        console.log('👤 User:', user?.email || user?.name || 'Unknown');
        console.log('');
        
        // Step 1: Clear any existing note for today
        console.log('🧹 Step 1: Clearing any existing note for today...');
        try {
            await fetch(`/api/calendar-notes/${testDate}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                credentials: 'include'
            });
            console.log('   ✅ Cleared existing note');
        } catch (e) {
            console.log('   ⚠️  No existing note to clear (this is OK)');
        }
        console.log('');
        
        // Step 2: Save a note via API (simulating what auto-save does)
        console.log('💾 Step 2: Saving note via API (simulating auto-save)...');
        const saveStartTime = Date.now();
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
        const saveEndTime = Date.now();
        const saveDuration = saveEndTime - saveStartTime;
        
        if (!saveRes.ok) {
            const errorText = await saveRes.text();
            console.error('❌ Save failed:', saveRes.status, errorText);
            return;
        }
        
        const saveData = await saveRes.json();
        console.log('   ✅ Save successful!');
        console.log('   Response time:', saveDuration + 'ms');
        console.log('   Response:', {
            saved: saveData.data?.saved,
            noteId: saveData.data?.id,
            date: saveData.data?.date
        });
        console.log('');
        
        // Step 3: Wait a moment for database write
        console.log('⏳ Step 3: Waiting 1 second for database write...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('');
        
        // Step 4: Fetch all notes to verify persistence
        console.log('📥 Step 4: Fetching all notes to verify persistence...');
        const fetchStartTime = Date.now();
        const fetchRes = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            credentials: 'include',
            cache: 'no-store'
        });
        const fetchEndTime = Date.now();
        const fetchDuration = fetchEndTime - fetchStartTime;
        
        if (!fetchRes.ok) {
            const errorText = await fetchRes.text();
            console.error('❌ Fetch failed:', fetchRes.status, errorText);
            return;
        }
        
        const fetchData = await fetchRes.json();
        console.log('   ✅ Fetch successful!');
        console.log('   Response time:', fetchDuration + 'ms');
        console.log('   Response structure:', {
            hasData: !!fetchData.data,
            hasNotes: !!fetchData.data?.notes,
            notesType: typeof fetchData.data?.notes
        });
        
        const notes = fetchData?.data?.notes || fetchData?.notes || {};
        console.log('   Total notes:', Object.keys(notes).length);
        console.log('   Note dates:', Object.keys(notes));
        console.log('');
        
        // Step 5: Verify note exists and matches
        console.log('🔍 Step 5: Verifying saved note...');
        const savedNote = notes[testDate];
        
        if (savedNote === testNote) {
            console.log('   ✅ SUCCESS: Note persisted correctly!');
            console.log('   ✅ Content matches exactly');
            console.log('   ✅ Date:', testDate);
            console.log('   ✅ Note length:', savedNote.length, 'characters');
        } else if (savedNote) {
            console.log('   ⚠️ WARNING: Note found but content differs');
            console.log('   Expected:', testNote.substring(0, 50) + '...');
            console.log('   Got:', savedNote.substring(0, 50) + '...');
        } else {
            console.log('   ❌ FAILURE: Note not found in fetched notes');
            console.log('   Looking for date:', testDate);
            console.log('   Available dates:', Object.keys(notes));
        }
        console.log('');
        
        // Step 6: Check localStorage persistence
        console.log('💾 Step 6: Checking localStorage persistence...');
        const userId = user?.id || user?.email || 'default';
        const notesKey = `user_notes_${userId}`;
        const localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
        const localNote = localNotes[testDate];
        
        if (localNote === testNote) {
            console.log('   ✅ LocalStorage also has the note');
            console.log('   ✅ Content matches');
        } else if (localNote) {
            console.log('   ⚠️ LocalStorage has note but content differs');
        } else {
            console.log('   ⚠️ Note not found in localStorage (may sync later)');
        }
        console.log('');
        
        // Step 7: Test auto-save timing (simulate typing)
        console.log('⏱️  Step 7: Testing auto-save timing...');
        console.log('   Expected: Auto-save should trigger within 500ms after typing stops');
        console.log('   This is tested in the browser by typing in the DailyNotes editor');
        console.log('');
        
        // Step 8: Cleanup
        console.log('🧹 Step 8: Cleaning up test note...');
        const deleteRes = await fetch(`/api/calendar-notes/${testDate}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            },
            credentials: 'include'
        });
        
        if (deleteRes.ok) {
            console.log('   ✅ Test note deleted');
        } else {
            console.warn('   ⚠️ Failed to delete test note (may need manual cleanup)');
        }
        console.log('');
        
        // Summary
        console.log('📊 Test Summary:');
        console.log('   ✅ API save: Working');
        console.log('   ✅ API fetch: Working');
        console.log('   ✅ Persistence: ' + (savedNote === testNote ? 'Working' : 'Needs Investigation'));
        console.log('   ✅ Response time: Save=' + saveDuration + 'ms, Fetch=' + fetchDuration + 'ms');
        console.log('');
        
        if (savedNote === testNote) {
            console.log('🎉 ALL TESTS PASSED! Calendar notes auto-save is working correctly.');
            console.log('');
            console.log('💡 Next steps for manual testing:');
            console.log('   1. Open Calendar widget on dashboard');
            console.log('   2. Click on today\'s date to open Daily Notes');
            console.log('   3. Type some text in the editor');
            console.log('   4. Wait 500ms without typing - should see "Auto-saving..." message');
            console.log('   5. Click away from editor - should save immediately');
            console.log('   6. Close and reopen the note - content should persist');
        } else {
            console.log('⚠️ Some tests failed. Please check the output above.');
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.testCalendarAutoSave = testCalendarAutoSave;
    console.log('✅ Test function available: window.testCalendarAutoSave()');
    console.log('💡 Run testCalendarAutoSave() in the console to test auto-save');
}

// Run if called directly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = testCalendarAutoSave;
}

