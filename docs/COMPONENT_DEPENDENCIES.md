# Component Dependency Management Guide

## Overview
This document explains how to prevent component loading race conditions in the ERP system.

## Problem
Components that depend on other components loaded via lazy loading can fail if the dependency isn't loaded yet. This causes "Component not found" errors.

## Solution: Component Dependency System

### 1. Document Dependencies in Component Files

Every component that depends on others should declare them at the top:

```javascript
// ✅ GOOD - Declare dependencies clearly
// Get dependencies from window
const { useState, useEffect } = React;
const ProjectModal = window.ProjectModal;
const ProjectDetail = window.ProjectDetail; // Required dependency

// ❌ BAD - Using component without checking
const ProjectDetailComponent = window.ProjectDetail; // May be undefined!
```

### 2. Check Dependencies Before Using

```javascript
// ✅ GOOD - Check if component exists before using
const MyComponent = () => {
    if (!window.ProjectDetail) {
        return <div>Loading...</div>; // Show loading state
    }
    return <window.ProjectDetail />;
};

// ❌ BAD - Direct usage without check
const MyComponent = () => {
    return <window.ProjectDetail />; // Will crash if not loaded!
};
```

### 3. Register Components Properly

Every component should register itself on window and dispatch an event:

```javascript
// ✅ GOOD - Proper registration
window.MyComponent = MyComponent;

// Dispatch event to notify other components
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'MyComponent' } 
    }));
    console.log('✅ MyComponent component registered and event dispatched');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}
```

### 4. Load Order in lazy-load-components.js

Components must be loaded in dependency order:

```javascript
// ✅ GOOD - Dependencies before dependents
const componentFiles = [
    './src/components/projects/ProjectModal.jsx',      // Dependency
    './src/components/projects/ProjectDetail.jsx',     // Depends on ProjectModal
    './src/components/projects/Projects.jsx',          // Depends on ProjectDetail
];
```

## Dependency Map

### Projects Module
- `Projects.jsx` depends on:
  - ✅ `ProjectDetail.jsx`
  - ✅ `ProjectModal.jsx`
  - ✅ `ProjectProgressTracker.jsx` (optional)

- `ProjectDetail.jsx` depends on:
  - ✅ `ProjectModal.jsx`
  - ✅ `ListModal.jsx`
  - ✅ `TaskDetailModal.jsx`
  - ✅ `KanbanView.jsx`
  - ✅ `CustomFieldModal.jsx`
  - ✅ `CommentsPopup.jsx`
  - ✅ `DocumentCollectionModal.jsx`
  - ✅ `MonthlyDocumentCollectionTracker.jsx`

### Clients Module
- `Clients.jsx` depends on:
  - ✅ `ClientDetailModal.jsx` (loaded early in index.html)
  - ✅ `LeadDetailModal.jsx` (loaded early in index.html)

## Best Practices

### ✅ DO:
1. **Check dependencies before use**: Always verify `window.ComponentName` exists
2. **Show loading states**: Display a loading UI while dependencies load
3. **Register components**: Always register on `window` and dispatch events
4. **Order dependencies correctly**: Load dependencies before dependents in lazy-loader
5. **Add logging**: Log when components register for debugging

### ❌ DON'T:
1. **Don't assume components are loaded**: Always check first
2. **Don't load out of order**: Dependencies must come first
3. **Don't forget to register**: Components won't be available without registration
4. **Don't ignore errors**: Handle missing components gracefully

## Testing Component Loading

Before committing, verify:
1. Components register properly (check console for registration logs)
2. Dependencies load in correct order
3. Missing dependencies show loading states, not errors
4. Component events are dispatched correctly

## Quick Reference Checklist

When adding a new component:
- [ ] Document all dependencies at the top of the file
- [ ] Check dependencies exist before using them
- [ ] Register component on `window.ComponentName`
- [ ] Dispatch `componentLoaded` event
- [ ] Add to lazy-loader in correct dependency order
- [ ] Test that component loads correctly
- [ ] Verify dependent components wait properly
