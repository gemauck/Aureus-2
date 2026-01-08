# Helpdesk Module - Quick Reference

## 🎯 Framework Summary

### Technology Stack
- **Frontend**: React (Babel transpilation) + Tailwind CSS
- **Backend**: Node.js/Express + Prisma + PostgreSQL
- **Pattern**: Database-first with localStorage caching

### Module Location
```
src/components/helpdesk/
api/helpdesk.js
```

## 📁 File Structure

```
src/components/helpdesk/
├── Helpdesk.jsx              # Main list component
├── TicketDetailModal.jsx      # Detail/edit modal
├── TicketForm.jsx            # Create/edit form
├── TicketList.jsx            # Reusable list
├── TicketFilters.jsx         # Advanced filters
├── TicketStatusBadge.jsx      # Status UI
├── TicketPriorityBadge.jsx    # Priority UI
├── TicketComments.jsx         # Comments section
├── TicketAttachments.jsx     # File handling
├── TicketTimeline.jsx         # Activity log
└── TicketAssignment.jsx       # Assignment UI
```

## 🗄️ Database Schema

### Ticket Model
- `id`, `ticketNumber` (unique), `title`, `description`
- `status`: open, in-progress, resolved, closed, cancelled
- `priority`: low, medium, high, urgent, critical
- `category`: general, technical, billing, support, feature-request, bug
- `type`: internal, customer
- Relations: `createdBy`, `assignedTo`, `client`, `project`
- JSON fields: `tags`, `attachments`, `comments`, `activityLog`, `customFields`
- Timestamps: `createdAt`, `updatedAt`, `resolvedAt`, `closedAt`, `dueDate`
- SLA: `responseTimeMinutes`, `resolutionTimeMinutes`

## 🔌 API Endpoints

### Base: `/api/helpdesk`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/helpdesk` | List tickets (with filters) |
| POST | `/api/helpdesk` | Create ticket |
| GET | `/api/helpdesk/[id]` | Get ticket details |
| PATCH | `/api/helpdesk/[id]` | Update ticket |
| DELETE | `/api/helpdesk/[id]` | Delete ticket |
| POST | `/api/helpdesk/[id]/comments` | Add comment |
| POST | `/api/helpdesk/[id]/assign` | Assign ticket |
| POST | `/api/helpdesk/[id]/status` | Update status |
| POST | `/api/helpdesk/[id]/priority` | Update priority |
| GET | `/api/helpdesk/stats` | Get statistics |

## 🎨 Component Features

### Helpdesk.jsx (Main)
- Ticket list with filters
- Search functionality
- Create/view tickets
- Quick actions (assign, status)
- View modes: list, grid

### TicketDetailModal.jsx
- Tabbed interface: Overview, Comments, Timeline, Attachments
- Edit ticket details
- Status/priority management
- Assignment
- Comments with @mentions
- File attachments
- Activity timeline

## 🔗 Integration Points

1. **Clients**: Link tickets to clients, view in ClientDetailModal
2. **Projects**: Link tickets to projects, view in ProjectDetail
3. **Users**: Assign tickets, view user statistics
4. **Notifications**: Assignment, status changes, comments
5. **Time Tracking**: Link time entries to tickets
6. **Comments**: Reuse existing comment system

## 🔐 Permissions

- `ACCESS_HELPDESK`: Access module
- `HELPDESK_CREATE`: Create tickets
- `HELPDESK_EDIT`: Edit tickets
- `HELPDESK_DELETE`: Delete tickets
- `HELPDESK_ASSIGN`: Assign tickets
- `HELPDESK_ADMIN`: Full admin access

## 📋 Implementation Checklist

### Phase 1: Core (Week 1-2)
- [ ] Database schema & migration
- [ ] API endpoint (`api/helpdesk.js`)
- [ ] Main component (`Helpdesk.jsx`)
- [ ] Ticket form (`TicketForm.jsx`)
- [ ] Detail modal (`TicketDetailModal.jsx`)
- [ ] Navigation integration
- [ ] Component loader registration
- [ ] Permissions setup

### Phase 2: Features (Week 3-4)
- [ ] Comments integration
- [ ] Assignment functionality
- [ ] Status workflow
- [ ] Attachments
- [ ] Activity timeline
- [ ] Advanced filters
- [ ] Search

### Phase 3: Integration (Week 5)
- [ ] Client linking
- [ ] Project linking
- [ ] Notification integration
- [ ] Time tracking integration

### Phase 4: Polish (Week 6)
- [ ] UI/UX refinements
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Documentation

## 🚀 Quick Start

### 1. Add to Navigation
```javascript
// MainLayout.jsx
const VALID_PAGES = [..., 'helpdesk', ...];
const menuItems = [..., { id: 'helpdesk', label: 'Helpdesk', icon: 'fa-headset', permission: 'ACCESS_HELPDESK' }, ...];
```

### 2. Add to Component Loader
```javascript
// component-loader.js
'components/helpdesk/Helpdesk.jsx',
'components/helpdesk/TicketDetailModal.jsx',
```

### 3. Create API Endpoint
```javascript
// api/helpdesk.js
import { authRequired } from './_lib/authRequired.js';
import { prisma } from './_lib/prisma.js';
// ... follow api/clients.js pattern
```

### 4. Create Components
```javascript
// src/components/helpdesk/Helpdesk.jsx
const Helpdesk = () => {
    // Follow Clients.jsx pattern
};
window.Helpdesk = Helpdesk;
```

## 📝 Code Patterns

### API Call
```javascript
const tickets = await window.DatabaseAPI.get('/api/helpdesk', {
    status: 'open',
    assignedTo: userId
});
```

### Component Registration
```javascript
window.Helpdesk = Helpdesk;
window.dispatchEvent(new CustomEvent('componentLoaded', { 
    detail: { component: 'Helpdesk' } 
}));
```

### Permission Check
```javascript
const canCreate = window.PermissionChecker?.check(user, 'HELPDESK_CREATE');
```

---

**See**: `HELPDESK-MODULE-FRAMEWORK.md` for complete details


