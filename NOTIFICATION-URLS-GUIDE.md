# Notification URLs Guide

This guide explains how to ensure that each component of the application is accessible through a unique URL when a notification is sent to a user.

## Overview

The notification system uses a combination of:
1. **EntityUrl Utility** - Maps entity types to their page routes
2. **NotificationUrlHelper** - Ensures notifications always have valid URLs
3. **Automatic URL Construction** - Server-side fallback to build URLs from metadata

## URL Structure

### Basic URL Patterns

```
/{page}/{entityId}                    # Simple entity (e.g., /clients/abc123)
/{page}/{entityId}?tab={tab}         # Entity with tab (e.g., /projects/xyz789?tab=comments)
/{parent}/{parentId}/{child}/{childId} # Nested entity (e.g., /projects/abc123/tasks/task456)
```

### Component URLs

| Component | Base URL | Example |
|-----------|----------|---------|
| Dashboard | `/dashboard` | `/dashboard` |
| Clients | `/clients` | `/clients/{clientId}` |
| Projects | `/projects` | `/projects/{projectId}` |
| Tasks | `/tasks` | `/tasks/{taskId}` or `/projects/{projectId}/tasks/{taskId}` |
| Teams | `/teams` | `/teams/{teamId}` |
| Users | `/users` | `/users/{userId}` |
| Manufacturing | `/manufacturing` | `/manufacturing/{productionOrderId}` |
| Service & Maintenance | `/service-maintenance` | `/service-maintenance/{jobcardId}` |
| Time Tracking | `/time-tracking` | `/time-tracking/{timeEntryId}` |
| Leave Platform | `/leave-platform` | `/leave-platform/{leaveApplicationId}` |
| Settings | `/settings` | `/settings?tab=notifications` |
| Reports | `/reports` | `/reports?tab=analytics` |

## Creating Notifications with URLs

### Method 1: Using EntityUrl (Recommended - Client-Side)

```javascript
// For entities
const url = window.EntityUrl.getEntityUrl('project', projectId, { tab: 'comments' });
await createNotification({
    userId: targetUserId,
    type: 'comment',
    title: 'New comment',
    message: 'You have a new comment',
    link: url,
    metadata: { projectId, commentId }
});

// For tasks (nested in projects)
const taskUrl = window.EntityUrl.getEntityUrl('task', taskId, {
    parentId: projectId,
    parentType: 'project',
    tab: 'overview'
});
```

### Method 2: Using NotificationUrlHelper (Client-Side)

```javascript
// Ensure URL is always valid
const url = window.NotificationUrlHelper.ensureUrl(link, metadata);

// Or construct from entity
const url = window.NotificationUrlHelper.getUrlForEntity('client', clientId, {
    tab: 'overview'
});

// Or from component
const url = window.NotificationUrlHelper.getUrlForComponent('settings', {
    tab: 'notifications'
});
```

### Method 3: Server-Side (API)

When creating notifications via the API (`POST /api/notifications`), the server automatically constructs URLs from metadata if the `link` field is missing:

```javascript
// The server will automatically construct the URL from metadata
await fetch('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({
        userId: targetUserId,
        type: 'comment',
        title: 'New comment',
        message: 'You have a new comment',
        // link is optional - will be constructed from metadata
        metadata: {
            projectId: 'abc123',
            taskId: 'task456',
            tab: 'comments'
        }
    })
});
```

## Entity Type to URL Mapping

### Client Entities
- `client` → `/clients/{clientId}`
- `lead` → `/clients/{leadId}`
- `opportunity` → `/clients/{opportunityId}`
- `invoice` → `/clients/{clientId}?tab=invoices` (or with invoiceId in metadata)

### Project Entities
- `project` → `/projects/{projectId}`
- `task` → `/projects/{projectId}/tasks/{taskId}` (nested) or `/tasks/{taskId}` (standalone)
- `comment` → `/projects/{projectId}?tab=comments&commentId={commentId}`

### Manufacturing Entities
- `productionorder` → `/manufacturing/{productionOrderId}`
- `bom` → `/manufacturing?tab=boms&bomId={bomId}`
- `inventoryitem` → `/manufacturing?tab=inventory&itemId={itemId}`
- `stocklocation` → `/manufacturing?tab=locations`
- `stockmovement` → `/manufacturing?tab=movements`
- `supplier` → `/manufacturing?tab=suppliers`
- `purchaseorder` → `/manufacturing?tab=purchase-orders`

### Service & Maintenance Entities
- `jobcard` → `/service-maintenance/{jobcardId}`
- `vehicle` → `/service-maintenance?tab=vehicles&vehicleId={vehicleId}`
- `serviceformtemplate` → `/service-maintenance?tab=templates`
- `serviceforminstance` → `/service-maintenance?tab=forms`

### Team Entities
- `team` → `/teams/{teamId}`
- `teamdocument` → `/teams/{teamId}?tab=documents`
- `teamworkflow` → `/teams/{teamId}?tab=workflows`
- `teamchecklist` → `/teams/{teamId}?tab=checklists`
- `teamnotice` → `/teams/{teamId}?tab=notices`
- `teamtask` → `/teams/{teamId}?tab=tasks`
- `monthlymeetingnotes` → `/teams/{teamId}?tab=meetings`
- `weeklymeetingnotes` → `/teams/{teamId}?tab=meetings`
- `departmentnotes` → `/teams/{teamId}?tab=meetings`
- `meetingactionitem` → `/teams/{teamId}?tab=meetings`
- `meetingcomment` → `/teams/{teamId}?tab=meetings`

### User Entities
- `user` → `/users/{userId}`
- `usertask` → `/my-tasks/{taskId}`

### Leave Entities
- `leaveapplication` → `/leave-platform/{leaveApplicationId}`
- `leavebalance` → `/leave-platform?tab=balance`

### Time Tracking
- `timeentry` → `/time-tracking/{timeEntryId}`

## Metadata Structure

When creating notifications, include relevant metadata to enable automatic URL construction:

```javascript
{
    // Entity identifiers (at least one required for URL construction)
    projectId: 'abc123',
    taskId: 'task456',
    clientId: 'client789',
    
    // Navigation options
    tab: 'comments',        // Tab to open
    section: 'overview',    // Section identifier
    commentId: 'comment123', // Specific comment to highlight
    
    // Additional context
    commentText: '...',     // Comment text for email notifications
    projectName: '...',    // Project name for email notifications
    clientName: '...'       // Client name for email notifications
}
```

## Best Practices

### 1. Always Include Metadata

Even if you provide a `link`, include metadata for:
- Email notifications (project name, client name, etc.)
- Fallback URL construction
- Better context in notification center

```javascript
await createNotification({
    userId: targetUserId,
    type: 'mention',
    title: 'You were mentioned',
    message: '@username mentioned you in a comment',
    link: window.EntityUrl.getEntityUrl('project', projectId, { tab: 'comments' }),
    metadata: {
        projectId: projectId,
        projectName: projectName,
        commentId: commentId,
        tab: 'comments'
    }
});
```

### 2. Use EntityUrl for Consistency

Always use `window.EntityUrl.getEntityUrl()` when available to ensure consistency:

```javascript
// ✅ Good
const url = window.EntityUrl.getEntityUrl('project', projectId, { tab: 'comments' });

// ❌ Avoid hardcoding
const url = `/projects/${projectId}?tab=comments`;
```

### 3. Validate URLs Before Sending

Use `NotificationUrlHelper.isValidUrl()` to validate:

```javascript
const url = window.EntityUrl.getEntityUrl('project', projectId);
if (window.NotificationUrlHelper && !window.NotificationUrlHelper.isValidUrl(url)) {
    console.warn('Invalid notification URL:', url);
    // Fallback to dashboard
    url = '/dashboard';
}
```

### 4. Handle Nested Entities

For nested entities (like tasks within projects), always include parent information:

```javascript
const url = window.EntityUrl.getEntityUrl('task', taskId, {
    parentId: projectId,
    parentType: 'project',
    tab: 'overview'
});
```

## Examples

### Example 1: Project Comment Notification

```javascript
await fetch('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({
        userId: mentionedUserId,
        type: 'mention',
        title: 'You were mentioned',
        message: `${mentionedByName} mentioned you in a comment on ${projectName}`,
        link: window.EntityUrl.getEntityUrl('project', projectId, {
            tab: 'comments',
            commentId: commentId
        }),
        metadata: {
            projectId: projectId,
            projectName: projectName,
            commentId: commentId,
            commentText: commentText,
            tab: 'comments'
        }
    })
});
```

### Example 2: Task Assignment Notification

```javascript
const taskUrl = window.EntityUrl.getEntityUrl('task', taskId, {
    parentId: projectId,
    parentType: 'project'
});

await fetch('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({
        userId: assignedUserId,
        type: 'task',
        title: 'New task assigned',
        message: `You have been assigned to task: ${taskTitle}`,
        link: taskUrl,
        metadata: {
            projectId: projectId,
            taskId: taskId,
            taskTitle: taskTitle
        }
    })
});
```

### Example 3: System Notification

```javascript
await fetch('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({
        userId: userId,
        type: 'system',
        title: 'System Update',
        message: 'A new feature has been released',
        link: window.NotificationUrlHelper.getUrlForComponent('settings', {
            tab: 'notifications'
        }),
        metadata: {
            component: 'settings',
            tab: 'notifications'
        }
    })
});
```

## Troubleshooting

### Notification has no link or invalid link

1. **Check metadata**: Ensure metadata includes entity IDs (projectId, taskId, etc.)
2. **Use NotificationUrlHelper**: Call `NotificationUrlHelper.ensureUrl(link, metadata)` to fix
3. **Server fallback**: The server automatically constructs URLs from metadata if link is missing

### URL doesn't navigate correctly

1. **Check EntityUrl**: Ensure `window.EntityUrl` is loaded
2. **Verify route**: Check that the page route exists in `MainLayout.jsx`
3. **Check hash routing**: URLs should start with `/` (not `#`) - the router handles hash conversion

### Component not accessible via URL

1. **Add to EntityUrl**: Update `src/utils/entityUrl.js` with new entity type mapping
2. **Update MainLayout**: Ensure the page is in `VALID_PAGES` array
3. **Add route handler**: Ensure the component listens for `openEntityDetail` events

## Related Files

- `src/utils/entityUrl.js` - Entity URL mapping and generation
- `src/utils/notificationUrlHelper.js` - Notification URL helper utilities
- `api/notifications.js` - Server-side notification creation with URL construction
- `src/components/common/NotificationCenter.jsx` - Notification display and navigation
- `src/components/layout/MainLayout.jsx` - Route handling and page rendering

