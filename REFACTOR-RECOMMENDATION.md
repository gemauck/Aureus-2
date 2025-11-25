# Refactoring Recommendation: MonthlyDocumentCollectionTracker

## Current Issues

### ❌ Anti-Patterns

1. **Side Effects in State Setters**
   ```javascript
   // ❌ BAD: Side effect inside state setter
   setSections(currentSections => {
       const updated = currentSections.filter(...);
       localStorage.setItem(...); // ❌ Side effect in pure function
       return updated;
   });
   ```

2. **Multiple Competing Sync Mechanisms**
   - "ULTRA AGGRESSIVE" useEffect
   - "Smart merge" useEffect
   - Both fighting each other with time-based heuristics

3. **Time-Based Heuristics**
   ```javascript
   if (timeSinceLocalUpdate < 5000) { ... }  // ❌ Fragile
   if (timeSinceLastSave < 10000) { ... }   // ❌ Arbitrary
   ```

4. **Too Many Refs/Flags**
   - `hasInitializedRef`
   - `isInitialMount`
   - `lastLocalUpdateRef`
   - `previousDocumentSectionsRef`
   - `previousProjectIdRef`
   - `isSavingRef`

## ✅ Best Practice Approach

### 1. Optimistic Updates Pattern

```javascript
const handleDeleteSection = async (sectionId) => {
    // STEP 1: Optimistic update (immediate UI feedback)
    const updatedSections = sections.filter(s => s.id !== sectionId);
    setSections(updatedSections); // Pure state update
    
    // STEP 2: Save to localStorage (after state update)
    useEffect(() => {
        const storageKey = `documentSections_${project.id}`;
        localStorage.setItem(storageKey, JSON.stringify(sections));
    }, [sections, project.id]); // Separate concern
    
    // STEP 3: Save to database (async)
    try {
        await immediatelySaveDocumentSections(updatedSections);
    } catch (error) {
        // STEP 4: Rollback on error
        setSections(sections); // Restore previous state
        throw error;
    }
};
```

### 2. Version-Based Conflict Resolution

Instead of time-based heuristics, use version numbers or timestamps:

```javascript
const [sections, setSections] = useState(() => ({
    data: [],
    version: 0, // Increment on each update
    lastModified: Date.now()
}));

// Compare versions instead of times
const shouldSync = (serverData, localData) => {
    if (serverData.version > localData.version) {
        return true; // Server has newer data
    }
    if (serverData.version === localData.version && 
        serverData.lastModified > localData.lastModified) {
        return true; // Server has newer timestamp
    }
    return false; // Local is newer or equal
};
```

### 3. Single Sync Mechanism

```javascript
// ONE useEffect for syncing, with clear rules
useEffect(() => {
    if (!shouldSync(project.documentSections, sections)) return;
    if (isLocalEditPending) return; // User is editing
    
    // Clear rules for when to sync
    setSections(project.documentSections);
}, [project.documentSections, isLocalEditPending]);
```

### 4. Separation of Concerns

```javascript
// 1. State Management (pure)
const [sections, setSections] = useState([]);

// 2. Persistence (separate useEffect)
useEffect(() => {
    const storageKey = `documentSections_${project.id}`;
    localStorage.setItem(storageKey, JSON.stringify(sections));
}, [sections, project.id]);

// 3. Sync Logic (separate useEffect)
useEffect(() => {
    if (shouldSync(project.documentSections, sections)) {
        setSections(project.documentSections);
    }
}, [project.documentSections, sections]);
```

### 5. Use Existing Hook Pattern

Your codebase already has `usePersistence` hook that does this correctly:

```javascript
// ✅ GOOD: Use existing pattern
const { data: sections, update, create, remove } = usePersistence(
    `documentSections_${project.id}`,
    {
        update: (id, data) => DatabaseAPI.updateProject(project.id, data),
        create: (data) => DatabaseAPI.createProject(data),
        remove: (id) => DatabaseAPI.deleteProject(id)
    },
    {
        enableOffline: true,
        conflictStrategy: 'server-wins'
    }
);
```

## Recommended Refactor Steps

1. **Extract localStorage persistence to separate useEffect**
2. **Use version/timestamp for conflict resolution** (not time windows)
3. **Combine sync mechanisms into one clear useEffect**
4. **Consider using `usePersistence` hook** if it fits your needs
5. **Reduce refs/flags** - use state and clear logic instead

## Quick Fix (Minimal Change)

If you want to keep current structure but fix the immediate issue:

1. Move localStorage save OUT of setSections callback
2. Use a separate useEffect that watches `sections` changes
3. Use a proper version number instead of time windows




