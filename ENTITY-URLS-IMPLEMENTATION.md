# Entity URLs Implementation

## Overview

All entities in the system now have URLs that can be accessed via comments and notifications. This allows users to navigate directly to specific entities (clients, projects, tasks, invoices, etc.) from notifications, comments, and other linking mechanisms.

## Implementation Details

### 1. Entity URL Utility (`src/utils/entityUrl.js`)

A comprehensive utility that generates and parses URLs for all entity types in the system.

**Key Functions:**
- `getEntityUrl(entityType, entityId, options)` - Generates a URL for an entity
- `parseEntityUrl(url)` - Parses a URL to extract entity information
- `navigateToEntity(entityType, entityId, options)` - Navigates to an entity
- `getEntityUrlFromObject(entity, options)` - Generates URL from entity object

**Supported Entity Types:**
- Client entities: `client`, `lead`, `opportunity`
- Project entities: `project`, `task`
- Invoice entities: `invoice`
- Sales entities: `salesorder`
- Manufacturing entities: `productionorder`, `bom`, `inventoryitem`, `stocklocation`, `stockmovement`, `supplier`, `purchaseorder`
- Service entities: `jobcard`, `vehicle`, `serviceformtemplate`, `serviceforminstance`
- User entities: `user`, `usertask`
- Team entities: `team`, `teamdocument`, `teamworkflow`, `teamchecklist`, `teamnotice`, `teamtask`
- Meeting entities: `monthlymeetingnotes`, `weeklymeetingnotes`, `departmentnotes`, `meetingactionitem`, `meetingcomment`
- Leave entities: `leaveapplication`, `leavebalance`
- Time tracking: `timeentry`

**URL Format:**
```
/{page}/{entityId}?tab={tab}&section={section}
```

Examples:
- `/clients/abc123` - Client detail
- `/projects/xyz789?tab=comments` - Project detail with comments tab
- `/projects/xyz789/task123?tab=comments` - Task detail (nested in project)

### 2. Notification System Integration

**Updated Files:**
- `src/utils/mentionHelper.js` - Generates entity URLs from metadata
- `src/components/projects/ProjectDetail.jsx` - Uses entity URLs in notifications
- `src/components/projects/TaskDetailModal.jsx` - Uses entity URLs in notifications
- `src/components/common/NotificationCenter.jsx` - Navigates using entity URLs

**How It Works:**
1. When a notification is created, it automatically generates an entity URL based on the metadata
2. The notification stores the entity URL in the `link` field
3. When a user clicks a notification, it uses `EntityUrl.navigateToEntity()` to navigate
4. The routing system parses the URL and opens the appropriate entity detail view

### 3. Routing Integration

**Updated Files:**
- `src/components/layout/MainLayout.jsx` - Handles entity navigation events and route parsing
- `src/components/clients/Clients.jsx` - Listens for entity navigation events
- `src/components/projects/Projects.jsx` - Listens for entity navigation events

**How It Works:**
1. When a route changes and contains an entity ID, `MainLayout` parses it
2. It dispatches an `openEntityDetail` event with entity information
3. Components (Clients, Projects) listen for this event
4. They open the appropriate entity detail view (modal or full-page)

**Event Flow:**
```
URL Change → RouteState → MainLayout → openEntityDetail Event → Component → Entity Detail View
```

### 4. Comment System

Comments can now include entity URLs in their metadata. The infrastructure is in place for:
- Linking comments to specific entities
- Navigating to entities from comments
- Including entity context in comment metadata

## Usage Examples

### Creating a Notification with Entity URL

```javascript
// Automatic (recommended)
const notification = {
    userId: targetUserId,
    type: 'comment',
    title: 'New comment on task',
    message: 'User commented on task',
    link: window.EntityUrl.getEntityUrl('task', taskId, { tab: 'comments' }),
    metadata: {
        taskId: taskId,
        projectId: projectId,
        // ... other metadata
    }
};
```

### Navigating to an Entity

```javascript
// Direct navigation
window.EntityUrl.navigateToEntity('client', clientId, { tab: 'overview' });

// From a URL string
const parsed = window.EntityUrl.parseEntityUrl('/clients/abc123?tab=comments');
if (parsed) {
    window.EntityUrl.navigateToEntity(parsed.entityType, parsed.entityId, parsed.options);
}
```

### Listening for Entity Navigation

```javascript
useEffect(() => {
    const handleEntityNavigation = (event) => {
        const { entityType, entityId, options } = event.detail;
        // Open entity detail view
        openEntityDetail(entityType, entityId, options);
    };
    
    window.addEventListener('openEntityDetail', handleEntityNavigation);
    return () => window.removeEventListener('openEntityDetail', handleEntityNavigation);
}, []);
```

## Benefits

1. **Consistent Linking**: All entities have standardized URLs
2. **Deep Linking**: Users can bookmark or share links to specific entities
3. **Notification Navigation**: Clicking notifications takes users directly to the relevant entity
4. **Comment Context**: Comments can link back to the entities they reference
5. **Better UX**: Users can easily navigate between related entities

## Future Enhancements

1. **Comment Threading**: Link comments to specific entities for better organization
2. **Entity Relationships**: Show related entities in entity detail views
3. **Breadcrumbs**: Show navigation path when viewing entities
4. **Share Links**: Generate shareable links for entities
5. **Entity History**: Track navigation history for entities

## Testing

To test the implementation:

1. **Create a notification** - Should include entity URL in `link` field
2. **Click a notification** - Should navigate to the entity detail view
3. **Navigate to entity URL** - Should open the correct entity view
4. **Check route parsing** - URLs like `/clients/123` should open client detail

## Files Modified

- `src/utils/entityUrl.js` (new)
- `src/utils/mentionHelper.js`
- `src/components/projects/ProjectDetail.jsx`
- `src/components/projects/TaskDetailModal.jsx`
- `src/components/common/NotificationCenter.jsx`
- `src/components/layout/MainLayout.jsx`
- `src/components/clients/Clients.jsx`
- `src/components/projects/Projects.jsx`
- `component-loader.js`
- `src/core-entry.js`

