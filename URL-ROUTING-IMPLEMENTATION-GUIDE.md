# URL Routing Implementation Guide

This guide explains how to implement consistent URL routing across all ERP components, following the pattern established in Projects, Clients, Teams, and Users components.

## Overview

The goal is to ensure that:
- Every entity selection updates the URL (e.g., `/clients/123`, `/teams/management`)
- URLs are refreshable and shareable
- Browser back/forward buttons work correctly
- Tabs, sections, and comments are reflected in URLs
- Deep linking works for all entities

## Implementation Pattern

### 1. Update URL When Entity is Selected

When a user clicks to view/edit an entity, update the URL:

```javascript
const handleViewEntity = (entity) => {
    setViewingEntity(entity);
    setShowModal(true); // if using modals
    
    // Update URL
    if (window.RouteState && entity?.id) {
        window.RouteState.setPageSubpath('page-name', [String(entity.id)], {
            replace: false,
            preserveSearch: false,
            preserveHash: false
        });
    }
};
```

### 2. Handle Route Changes to Open Entities from URL

Listen for route changes and open entities when the URL contains an entity ID:

```javascript
useEffect(() => {
    if (!window.RouteState) return;
    
    const handleRouteChange = async (route) => {
        if (route?.page !== 'page-name') return;
        
        // If no segments, clear viewing entity
        if (!route.segments || route.segments.length === 0) {
            if (viewingEntity) {
                setViewingEntity(null);
                setShowModal(false);
            }
            return;
        }
        
        // URL contains an entity ID - open that entity
        const entityId = route.segments[0];
        if (entityId) {
            // Find in cache
            let entity = entities.find(e => String(e.id) === String(entityId));
            
            if (entity) {
                setViewingEntity(entity);
                setShowModal(true);
            } else {
                // Fetch from API if not in cache
                try {
                    const response = await fetch(`/api/entities/${entityId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const entityData = data.data?.entity || data.entity || data.data;
                        if (entityData) {
                            setViewingEntity(entityData);
                            setShowModal(true);
                        }
                    }
                } catch (error) {
                    console.error('Failed to load entity from URL:', error);
                }
            }
            
            // Handle query parameters (tab, section, commentId)
            const tab = route.search?.get('tab');
            const section = route.search?.get('section');
            const commentId = route.search?.get('commentId');
            
            if (tab || section || commentId) {
                setTimeout(() => {
                    if (tab) {
                        window.dispatchEvent(new CustomEvent('switchPageNameTab', {
                            detail: { tab, section, commentId }
                        }));
                    }
                    if (section) {
                        window.dispatchEvent(new CustomEvent('switchPageNameSection', {
                            detail: { section, commentId }
                        }));
                    }
                    if (commentId) {
                        window.dispatchEvent(new CustomEvent('scrollToComment', {
                            detail: { commentId }
                        }));
                    }
                }, 100);
            }
        }
    };
    
    // Check initial route
    const currentRoute = window.RouteState.getRoute();
    handleRouteChange(currentRoute);
    
    // Subscribe to route changes
    const unsubscribe = window.RouteState.subscribe(handleRouteChange);
    
    return () => {
        if (unsubscribe && typeof unsubscribe === 'function') {
            unsubscribe();
        }
    };
}, [entities, viewingEntity]); // Include relevant dependencies
```

### 3. Update URL When Tabs/Sections Change

If your component has tabs or sections, update the URL when they change:

```javascript
const switchTab = (tab, options = {}) => {
    setActiveTab(tab);
    
    // Update URL if entity is selected
    if (viewingEntity && window.RouteState) {
        const searchParams = new URLSearchParams();
        searchParams.set('tab', tab);
        if (options.section) {
            searchParams.set('section', options.section);
        }
        if (options.commentId) {
            searchParams.set('commentId', options.commentId);
        }
        
        window.RouteState.navigate({
            page: 'page-name',
            segments: [String(viewingEntity.id)],
            search: `?${searchParams.toString()}`,
            hash: '',
            replace: false,
            preserveSearch: false,
            preserveHash: false
        });
    }
};
```

### 4. Clear URL When Closing Entity View

When the user clicks "Back" or closes the entity view:

```javascript
const handleBack = () => {
    setViewingEntity(null);
    setShowModal(false);
    
    // Clear URL
    if (window.RouteState) {
        window.RouteState.setPageSubpath('page-name', [], {
            replace: false,
            preserveSearch: false,
            preserveHash: false
        });
    }
};
```

## Component-Specific Notes

### Manufacturing Component
- Entities: Production Orders, BOMs, Inventory Items, Stock Locations, Suppliers, Purchase Orders
- Use entity type in URL if needed: `/manufacturing/production-orders/123`
- Or use entity ID directly: `/manufacturing/123` (if context is clear)

### Service-Maintenance Component
- Entities: Job Cards, Vehicles, Service Form Templates, Service Form Instances
- Similar pattern to Projects

### Tasks Component
- May be nested under Projects: `/projects/123/tasks/456`
- Or standalone: `/tasks/456`
- Check EntityUrl utility for nested entity handling

### Time-Tracking Component
- Entities: Time Entries
- Usually filtered by date range, user, project
- Consider adding filters to URL: `/time-tracking?date=2024-01-01&userId=123`

### Leave Platform Component
- Entities: Leave Applications, Leave Balances
- Similar to Users pattern

### Dashboard Component
- Usually doesn't have entity views
- May have widget states that could be in URL
- Consider: `/dashboard?widget=projects&filter=active`

## Testing Checklist

For each component, verify:
- [ ] Clicking an entity updates the URL
- [ ] Refreshing the page opens the same entity
- [ ] Browser back button works correctly
- [ ] Sharing a URL opens the correct entity/view
- [ ] Tabs/sections are reflected in URL
- [ ] Comments can be linked via URL
- [ ] Closing entity view clears URL segments

## Utility Functions

### Using ComponentUrlRouting Utility

For simpler components, you can use the utility:

```javascript
// In component
const { updateUrl, clearUrl, handleRouteChange } = window.ComponentUrlRouting?.create(
    'page-name',
    viewingEntity?.id,
    setViewingEntity,
    (id) => entities.find(e => String(e.id) === String(id)),
    { tab: activeTab }
) || {};

// When entity is selected
const handleViewEntity = (entity) => {
    setViewingEntity(entity);
    if (updateUrl) updateUrl();
};

// When closing
const handleBack = () => {
    setViewingEntity(null);
    if (clearUrl) clearUrl();
};

// In useEffect
useEffect(() => {
    if (!window.RouteState) return;
    const unsubscribe = window.RouteState.subscribe((route) => {
        if (handleRouteChange) handleRouteChange(route, entities);
    });
    return () => unsubscribe();
}, [entities]);
```

## Common Patterns

### Pattern 1: Simple Entity List/Detail
- List view: `/page-name`
- Detail view: `/page-name/123`
- Example: Users, Teams (simple teams)

### Pattern 2: Entity with Tabs
- List: `/page-name`
- Detail: `/page-name/123`
- Tab: `/page-name/123?tab=overview`
- Example: Projects, Clients

### Pattern 3: Nested Entities
- Parent: `/parent-page/123`
- Child: `/parent-page/123/child-type/456`
- Example: `/projects/123/tasks/456`

### Pattern 4: Filtered Views
- List with filter: `/page-name?status=active&type=client`
- Consider preserving filters in URL for shareability

## Integration with EntityUrl Utility

The `EntityUrl` utility (in `src/utils/entityUrl.js`) provides:
- `getEntityUrl(entityType, entityId, options)` - Generate URLs
- `parseEntityUrl(url)` - Parse URLs
- `navigateToEntity(entityType, entityId, options)` - Navigate to entity

Use these for cross-component navigation (e.g., from notifications, comments).

## Example: Complete Implementation

See these files for complete examples:
- `src/components/projects/Projects.jsx` - Full implementation with tabs, comments
- `src/components/clients/Clients.jsx` - Multiple entity types (clients, leads)
- `src/components/teams/Teams.jsx` - Tab navigation with URL updates
- `src/components/users/Users.jsx` - Simple entity list/detail

## Next Steps

1. Apply pattern to Manufacturing component
2. Apply pattern to Service-Maintenance component
3. Apply pattern to Tasks component (if standalone)
4. Apply pattern to Time-Tracking component
5. Apply pattern to Leave Platform component
6. Consider Dashboard widget state in URLs
7. Test all components for URL routing consistency
