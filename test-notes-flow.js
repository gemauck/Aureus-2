/**
 * Comprehensive test to trace the notes persistence flow
 * This simulates the exact sequence of events that happens when notes are typed
 */

console.log('🧪 === COMPREHENSIVE NOTES PERSISTENCE FLOW TEST ===\n');

// Simulate the state
let formData = { id: 'client-123', name: 'Test Client', notes: '' };
let formDataRef = { current: { id: 'client-123', name: 'Test Client', notes: '' } };
let clientProp = { id: 'client-123', name: 'Test Client', notes: '' };
let isAutoSavingRef = { current: false };
let isEditingRef = { current: false };
let hasUserEditedForm = { current: false };
let userEditedFieldsRef = { current: new Set() };

// Simulate React's setState (async)
const setFormData = (updater) => {
    if (typeof updater === 'function') {
        formData = updater(formData);
    } else {
        formData = updater;
    }
    formDataRef.current = formData;
    console.log('📝 setFormData called:', formData.notes?.substring(0, 50) || 'empty');
};

// Simulate setSelectedClient (updates client prop)
const setSelectedClient = (client) => {
    clientProp = { ...client };
    console.log('🔄 setSelectedClient called, client prop notes:', clientProp.notes?.substring(0, 50) || 'empty');
    // This triggers useEffect
    simulateUseEffect();
};

// Simulate the useEffect that runs when client prop changes
const simulateUseEffect = () => {
    console.log('\n🔍 useEffect triggered by client prop change');
    console.log('   isEditingRef.current:', isEditingRef.current);
    console.log('   isAutoSavingRef.current:', isAutoSavingRef.current);
    console.log('   formDataRef.current.notes:', formDataRef.current?.notes?.substring(0, 50) || 'empty');
    console.log('   clientProp.notes:', clientProp.notes?.substring(0, 50) || 'empty');
    
    // Check guards
    if (isEditingRef.current) {
        console.log('   ✅ BLOCKED: User is editing');
        return;
    }
    
    if (isAutoSavingRef.current) {
        console.log('   ✅ BLOCKED: Auto-saving in progress');
        return;
    }
    
    // Check if formDataRef has notes but client prop doesn't
    const refHasNotes = formDataRef.current?.notes && formDataRef.current.notes.trim().length > 0;
    const clientHasNotes = clientProp.notes && clientProp.notes.trim().length > 0;
    
    if (refHasNotes && !clientHasNotes) {
        console.log('   ✅ BLOCKED: formDataRef has notes but client prop doesn\'t');
        return;
    }
    
    // If we get here, useEffect would update formData
    console.log('   ⚠️ WARNING: useEffect would overwrite formData!');
    const currentNotesFromRef = formDataRef.current?.notes || '';
    const notesToPreserve = (currentNotesFromRef && currentNotesFromRef.trim().length > 0) 
        ? currentNotesFromRef 
        : (formData.notes && formData.notes.trim().length > 0) 
            ? formData.notes 
            : (clientProp.notes && clientProp.notes.trim().length > 0) 
                ? clientProp.notes 
                : '';
    
    setFormData(prev => ({
        ...prev,
        notes: notesToPreserve
    }));
    console.log('   📝 useEffect updated formData, notes:', formData.notes?.substring(0, 50) || 'empty');
};

// Simulate onBlur handler
const simulateOnBlur = (textareaValue) => {
    console.log('\n💾 === onBlur Handler ===');
    console.log('   Textarea value:', textareaValue.substring(0, 50));
    
    isEditingRef.current = false;
    hasUserEditedForm.current = true;
    isAutoSavingRef.current = true;
    
    // Update formData with notes
    setFormData(prev => {
        const latest = {...prev, notes: textareaValue};
        formDataRef.current = latest;
        return latest;
    });
    
    // Update ref immediately
    const latest = {...(formDataRef.current || {}), notes: textareaValue};
    formDataRef.current = latest;
    
    console.log('   ✅ formData updated, notes:', formData.notes?.substring(0, 50));
    console.log('   ✅ formDataRef updated, notes:', formDataRef.current.notes?.substring(0, 50));
    
    // Simulate onSave call
    setTimeout(() => {
        simulateOnSave(latest);
    }, 200);
};

// Simulate onSave (handleSaveClient)
const simulateOnSave = (clientFormData) => {
    console.log('\n💾 === onSave Handler ===');
    console.log('   clientFormData.notes:', clientFormData.notes?.substring(0, 50) || 'empty');
    
    // Simulate API call
    const comprehensiveClient = { ...clientFormData };
    const apiResponse = {
        data: {
            client: {
                id: 'client-123',
                name: 'Test Client',
                notes: comprehensiveClient.notes // API returns the notes
            }
        }
    };
    
    console.log('   ✅ API response received, notes:', apiResponse.data.client.notes?.substring(0, 50) || 'empty');
    
    // Update selectedClient
    const savedClient = apiResponse?.data?.client || apiResponse?.client || comprehensiveClient;
    
    // CRITICAL: Always preserve notes from comprehensiveClient
    if (savedClient && comprehensiveClient.notes !== undefined && comprehensiveClient.notes !== null) {
        savedClient.notes = comprehensiveClient.notes;
        console.log('   ✅ Preserved notes from comprehensiveClient');
    }
    
    // Delay setSelectedClient
    setTimeout(() => {
        console.log('\n⏰ setSelectedClient called after delay');
        setSelectedClient(savedClient);
        
        // Clear isAutoSavingRef after longer delay
        setTimeout(() => {
            isAutoSavingRef.current = false;
            console.log('\n🔓 isAutoSavingRef cleared');
            console.log('📊 Final state:');
            console.log('   formData.notes:', formData.notes?.substring(0, 50) || 'empty');
            console.log('   formDataRef.current.notes:', formDataRef.current?.notes?.substring(0, 50) || 'empty');
            console.log('   clientProp.notes:', clientProp.notes?.substring(0, 50) || 'empty');
            
            if (formData.notes && formData.notes.includes('Test notes')) {
                console.log('\n✅ SUCCESS: Notes persisted!');
            } else {
                console.log('\n❌ FAILURE: Notes were lost!');
            }
        }, 1000);
    }, 100);
    
    return Promise.resolve(savedClient);
};

// Run the test
console.log('📋 Starting test sequence...\n');
console.log('1. User types notes in textarea');
const typedNotes = 'Test notes that should persist';

console.log('\n2. User clicks outside (onBlur fires)');
simulateOnBlur(typedNotes);

// Wait for all async operations
setTimeout(() => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 FINAL TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════');
    
    const success = formData.notes && formData.notes.includes('Test notes');
    console.log('formData.notes:', formData.notes || '(empty)');
    console.log('formDataRef.current.notes:', formDataRef.current?.notes || '(empty)');
    console.log('clientProp.notes:', clientProp.notes || '(empty)');
    
    if (success) {
        console.log('\n✅ TEST PASSED: Notes persisted correctly!');
    } else {
        console.log('\n❌ TEST FAILED: Notes were lost!');
        console.log('\n🔍 Debugging info:');
        console.log('   - isAutoSavingRef cleared too early?', !isAutoSavingRef.current);
        console.log('   - formDataRef has notes?', formDataRef.current?.notes?.includes('Test notes'));
        console.log('   - clientProp has notes?', clientProp.notes?.includes('Test notes'));
    }
}, 2000);

