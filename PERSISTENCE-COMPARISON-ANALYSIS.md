# Persistence Comparison: Document Collection vs Weekly FMS Review

## Key Finding: Why Document Collection Persists But Weekly FMS Review Doesn't

### Critical Difference #1: `handleSaveSection` Implementation

**Document Collection (WORKING):**
```javascript
const handleSaveSection = (sectionData) => {
    if (editingSection) {
        setSections(prev => prev.map(s => 
            s.id === editingSection.id ? { ...s, ...sectionData } : s
        ));
    } else {
        const newSection = {
            id: Date.now(),
            ...sectionData,
            documents: []
        };
        setSections(prev => [...prev, newSection]);
    }
    
    setShowSectionModal(false);
    setEditingSection(null);
    // Relies on auto-save mechanism which uses API service
};
```

**Weekly FMS Review (BROKEN - BEFORE FIX):**
```javascript
const handleSaveSection = (sectionData) => {
    // ... calculate new state ...
    
    // Tried to save immediately but:
    // 1. Bypassed API service
    // 2. Directly called DatabaseAPI.updateProject
    // 3. Manual parent update (might fail)
    // 4. Async IIFE that doesn't properly await
    
    if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
        const result = await window.DatabaseAPI.updateProject(project.id, updatePayload);
        // Manual parent update - might not work correctly
    }
};
```

### Critical Difference #2: API Service Usage

**Document Collection:**
- Uses `DocumentCollectionAPI.saveDocumentSections()` 
- API service automatically updates parent component via `window.updateViewingProject()`
- Ensures project prop is refreshed when navigating back

**Weekly FMS Review (BEFORE FIX):**
- In `handleSaveSection`: Bypassed API service, called `DatabaseAPI.updateProject` directly
- In `saveToDatabase`: Tried to use API service but `handleSaveSection` bypassed it
- Manual parent update that might fail silently

### Critical Difference #3: Auto-Save Mechanism

**Document Collection:**
- `handleSaveSection` just updates state
- Auto-save (debounced) uses API service
- API service handles parent updates correctly

**Weekly FMS Review:**
- `handleSaveSection` tried to save immediately
- But bypassed the API service
- Parent update might not complete before navigation

## The Fix

Changed `handleSaveSection` in Weekly FMS Review to:
1. **Use API service first** (`apiRef.current.saveWeeklyFMSReviewSections`)
2. **Fallback to documentSections API** if weekly API doesn't exist
3. **Final fallback** to direct DatabaseAPI call with manual parent update
4. **Same pattern as Document Collection** - rely on API service for parent updates

## Why This Matters

When you navigate away and come back:
1. **Document Collection**: Parent component's project prop has latest data because API service updated it
2. **Weekly FMS Review (before fix)**: Parent component's project prop might not have latest data because manual update failed or didn't complete

## Additional Differences (Not Critical)

1. **Polling**: Both have 5-second polling to refresh from database
2. **localStorage**: Both save snapshots to localStorage
3. **Unmount handlers**: Both have unmount handlers for cleanup
4. **State management**: Both use similar state management patterns

## Conclusion

The root cause was that `handleSaveSection` in Weekly FMS Review bypassed the API service that properly updates the parent component. By using the API service (like Document Collection does), the parent component's project prop gets updated correctly, ensuring data persists when navigating back.

