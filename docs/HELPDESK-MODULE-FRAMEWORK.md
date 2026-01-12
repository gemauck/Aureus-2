# Helpdesk/Ticketing System - Framework & Implementation Outline

## 📋 Table of Contents
1. [Framework & Technology Stack](#framework--technology-stack)
2. [Module Structure](#module-structure)
3. [Database Schema](#database-schema)
4. [API Design](#api-design)
5. [Component Architecture](#component-architecture)
6. [Features & Functionality](#features--functionality)
7. [Integration Points](#integration-points)
8. [Implementation Phases](#implementation-phases)

---

## Framework & Technology Stack

### Frontend
- **Framework**: React (Browser-based Babel transpilation)
- **State Management**: React Hooks (useState, useEffect, useMemo, useCallback)
- **Styling**: Tailwind CSS
- **Component Pattern**: Window-global registration pattern (matches existing modules)
- **Data Fetching**: DatabaseAPI utility (database-first approach)
- **Caching**: localStorage with API sync

### Backend
- **Runtime**: Node.js / Express.js
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Authentication**: JWT (via authRequired middleware)
- **API Pattern**: RESTful endpoints following existing module patterns

### Key Patterns
- **Database-First**: All operations go through database API
- **Optimistic UI Updates**: Immediate UI feedback with background sync
- **Component Lazy Loading**: Components loaded on-demand via component-loader
- **Permission-Based Access**: Role-based access control (RBAC)

---

## Module Structure

### Directory Structure
```
src/components/helpdesk/
├── Helpdesk.jsx                    # Main component (list view)
├── TicketDetailModal.jsx           # Ticket detail/edit modal
├── TicketForm.jsx                  # Create/edit ticket form
├── TicketList.jsx                  # Ticket listing with filters
├── TicketFilters.jsx               # Advanced filtering component
├── TicketStatusBadge.jsx           # Status badge component
├── TicketPriorityBadge.jsx         # Priority badge component
├── TicketComments.jsx              # Comments section (reuse existing pattern)
├── TicketAttachments.jsx           # File attachments component
├── TicketTimeline.jsx              # Activity timeline
├── TicketAssignment.jsx            # Assignment/transfer component
└── Icon                            # Module icon (fa-headset)

api/
└── helpdesk.js                     # Main API endpoint
    └── [id]/
        └── [id].js                 # Individual ticket operations
```

### File Organization Pattern
Following existing module patterns:
- Main list component: `Helpdesk.jsx` (similar to `Clients.jsx`, `Projects.jsx`)
- Detail modal: `TicketDetailModal.jsx` (similar to `ClientDetailModal.jsx`)
- API endpoint: `api/helpdesk.js` (similar to `api/clients.js`)

---

## Database Schema

### Ticket Model
```prisma
model Ticket {
  id              String          @id @default(cuid())
  ticketNumber    String          @unique  // Auto-generated: TKT-YYYY-NNNN
  title           String
  description     String          @default("")
  status          String          @default("open")  // open, in-progress, resolved, closed, cancelled
  priority        String          @default("medium")  // low, medium, high, urgent, critical
  category        String          @default("general")  // general, technical, billing, support, feature-request, bug
  type            String          @default("internal")  // internal, customer, vendor
  
  // Relationships
  createdById     String
  assignedToId    String?
  clientId        String?         // Optional: link to client for customer support
  projectId       String?         // Optional: link to project
  relatedTicketId String?         // Optional: link to related ticket (duplicate, follow-up)
  
  // Metadata
  tags            String          @default("[]")  // JSON array of tags
  attachments    String          @default("[]")  // JSON array of file references
  comments        String          @default("[]")  // JSON array of comments
  activityLog     String          @default("[]")  // JSON array of activity entries
  customFields    String          @default("{}")  // JSON object for extensibility
  
  // Timestamps
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  resolvedAt      DateTime?
  closedAt        DateTime?
  dueDate         DateTime?
  firstResponseAt DateTime?       // SLA tracking
  
  // SLA Tracking
  responseTimeMinutes    Int?    // Time to first response
  resolutionTimeMinutes   Int?    // Time to resolution
  targetResponseMinutes   Int?    // Target SLA response time
  targetResolutionMinutes Int?    // Target SLA resolution time
  
  // Relations
  createdBy      User            @relation("TicketCreator", fields: [createdById], references: [id])
  assignedTo     User?           @relation("TicketAssignee", fields: [assignedToId], references: [id])
  client         Client?         @relation(fields: [clientId], references: [id])
  project        Project?        @relation(fields: [projectId], references: [id])
  relatedTicket  Ticket?         @relation("RelatedTickets", fields: [relatedTicketId], references: [id])
  relatedTickets Ticket[]        @relation("RelatedTickets")
  timeEntries    TimeEntry[]     // Link to time tracking
  
  @@index([status])
  @@index([priority])
  @@index([category])
  @@index([createdById])
  @@index([assignedToId])
  @@index([clientId])
  @@index([projectId])
  @@index([createdAt])
  @@index([dueDate])
  @@index([ticketNumber])
}
```

### TicketComment Model (Optional - if separate from JSON)
```prisma
model TicketComment {
  id        String   @id @default(cuid())
  ticketId  String
  userId    String?
  message   String
  isInternal Boolean @default(false)  // Internal notes vs public comments
  attachments String @default("[]")   // JSON array
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  ticket    Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user      User?    @relation(fields: [userId], references: [id])
  
  @@index([ticketId])
  @@index([userId])
  @@index([createdAt])
}
```

### Update User Model Relations
```prisma
model User {
  // ... existing fields ...
  createdTickets    Ticket[]         @relation("TicketCreator")
  assignedTickets   Ticket[]         @relation("TicketAssignee")
  ticketComments   TicketComment[]
}
```

### Update Client Model Relations
```prisma
model Client {
  // ... existing fields ...
  tickets           Ticket[]
}
```

### Update Project Model Relations
```prisma
model Project {
  // ... existing fields ...
  tickets           Ticket[]
}
```

---

## API Design

### Endpoint Structure
Following existing patterns from `api/clients.js` and `api/projects.js`:

#### Base Endpoint: `/api/helpdesk`

**GET /api/helpdesk**
- List all tickets with filtering, sorting, pagination
- Query parameters:
  - `status`: Filter by status (open, in-progress, resolved, closed)
  - `priority`: Filter by priority
  - `category`: Filter by category
  - `assignedTo`: Filter by assignee ID
  - `createdBy`: Filter by creator ID
  - `clientId`: Filter by client
  - `projectId`: Filter by project
  - `search`: Full-text search on title/description
  - `page`: Page number (pagination)
  - `limit`: Items per page
  - `sortBy`: Sort field (createdAt, updatedAt, priority, dueDate)
  - `sortOrder`: asc or desc

**POST /api/helpdesk**
- Create new ticket
- Body: `{ title, description, priority, category, type, clientId?, projectId?, assignedToId?, dueDate?, tags? }`
- Auto-generates ticket number
- Sets createdById from authenticated user

**GET /api/helpdesk/[id]**
- Get single ticket with full details
- Includes related entities (client, project, assignee, creator)

**PATCH /api/helpdesk/[id]**
- Update ticket
- Supports partial updates
- Tracks changes in activityLog

**DELETE /api/helpdesk/[id]**
- Soft delete or hard delete (based on permissions)
- Only admins or ticket creator can delete

#### Sub-resources

**POST /api/helpdesk/[id]/comments**
- Add comment to ticket
- Body: `{ message, isInternal? }`

**POST /api/helpdesk/[id]/assign**
- Assign/reassign ticket
- Body: `{ assignedToId }`

**POST /api/helpdesk/[id]/status**
- Update ticket status
- Body: `{ status, note? }`
- Auto-updates resolvedAt/closedAt timestamps

**POST /api/helpdesk/[id]/priority**
- Update priority
- Body: `{ priority }`

**POST /api/helpdesk/[id]/link**
- Link ticket to client/project
- Body: `{ clientId?, projectId? }`

**GET /api/helpdesk/stats**
- Get ticket statistics
- Returns: counts by status, priority, category, assigned to me, etc.

---

## Component Architecture

### 1. Helpdesk.jsx (Main Component)
**Purpose**: Main entry point, ticket list view

**Features**:
- Ticket list with filters
- Search functionality
- Status/priority badges
- Quick actions (assign, change status)
- Create new ticket button
- View modes: list, grid, kanban (optional)
- Real-time updates via polling

**State Management**:
```javascript
const [tickets, setTickets] = useState([]);
const [filters, setFilters] = useState({ status: 'all', priority: 'all', ... });
const [searchTerm, setSearchTerm] = useState('');
const [selectedTicket, setSelectedTicket] = useState(null);
const [viewMode, setViewMode] = useState('list'); // list, grid, kanban
const [isLoading, setIsLoading] = useState(true);
```

**Key Functions**:
- `loadTickets()` - Fetch tickets via DatabaseAPI
- `handleCreateTicket()` - Open create modal
- `handleViewTicket()` - Open detail modal
- `handleFilterChange()` - Update filters
- `handleStatusChange()` - Quick status update
- `handleAssign()` - Quick assignment

### 2. TicketDetailModal.jsx
**Purpose**: Full ticket detail view and editing

**Features**:
- Tabbed interface: Overview, Comments, Timeline, Attachments
- Edit ticket details
- Change status/priority
- Assign/reassign
- Add comments (with @mentions)
- Upload attachments
- Link to client/project
- Activity timeline
- SLA tracking display

**Tabs**:
- **Overview**: All ticket details, edit form
- **Comments**: Comment thread with replies
- **Timeline**: Activity log (status changes, assignments, etc.)
- **Attachments**: File uploads and downloads
- **Related**: Linked tickets, client, project

**State Management**:
```javascript
const [ticket, setTicket] = useState(null);
const [activeTab, setActiveTab] = useState('overview');
const [isEditing, setIsEditing] = useState(false);
const [comments, setComments] = useState([]);
const [attachments, setAttachments] = useState([]);
```

### 3. TicketForm.jsx
**Purpose**: Create/edit ticket form

**Fields**:
- Title (required)
- Description (rich text)
- Priority (dropdown)
- Category (dropdown)
- Type (internal/customer)
- Client (optional, searchable)
- Project (optional, filtered by client)
- Assign To (optional, user search)
- Due Date (optional)
- Tags (multi-select)
- Custom Fields (dynamic)

**Validation**:
- Title required
- Description required
- Valid date formats
- Client/project relationship validation

### 4. TicketList.jsx
**Purpose**: Reusable ticket list component

**Features**:
- Sortable columns
- Row actions (quick assign, status change)
- Bulk actions (select multiple)
- Pagination
- Loading states
- Empty states

### 5. TicketFilters.jsx
**Purpose**: Advanced filtering component

**Filters**:
- Status (multi-select)
- Priority (multi-select)
- Category (multi-select)
- Assigned To (user search)
- Created By (user search)
- Client (searchable)
- Project (searchable)
- Date Range (created, updated, due)
- Tags (multi-select)

### 6. Supporting Components
- **TicketStatusBadge.jsx**: Color-coded status badges
- **TicketPriorityBadge.jsx**: Priority indicators
- **TicketComments.jsx**: Comment thread with @mentions
- **TicketAttachments.jsx**: File upload/download
- **TicketTimeline.jsx**: Activity log visualization
- **TicketAssignment.jsx**: User assignment dropdown/search

---

## Features & Functionality

### Core Features

#### 1. Ticket Management
- ✅ Create tickets (with auto-generated ticket numbers)
- ✅ Edit tickets
- ✅ Delete tickets (with permissions)
- ✅ View ticket details
- ✅ Search tickets
- ✅ Filter tickets (status, priority, category, assignee, etc.)
- ✅ Sort tickets (by date, priority, status, etc.)

#### 2. Status Workflow
- **Open**: New ticket, not yet assigned
- **In Progress**: Assigned and being worked on
- **Resolved**: Issue fixed, awaiting confirmation
- **Closed**: Confirmed resolved or cancelled
- **Cancelled**: Ticket no longer needed

#### 3. Priority Levels
- **Low**: Non-urgent, can wait
- **Medium**: Normal priority (default)
- **High**: Important, needs attention soon
- **Urgent**: Critical, needs immediate attention
- **Critical**: System down, business impact

#### 4. Categories
- **General**: General inquiries
- **Technical**: Technical issues
- **Billing**: Billing/payment questions
- **Support**: Customer support
- **Feature Request**: New feature requests
- **Bug**: Bug reports

#### 5. Assignment & Routing
- Assign to users
- Auto-assignment rules (future)
- Reassign tickets
- Unassign tickets
- Assignment history

#### 6. Comments & Communication
- Add comments (public/internal)
- @mention users (triggers notifications)
- Reply to comments
- Edit/delete own comments
- Rich text formatting

#### 7. Attachments
- Upload files
- Download files
- Preview images
- File size limits
- File type restrictions

#### 8. Linking
- Link to clients (customer support tickets)
- Link to projects (project-related issues)
- Link to related tickets (duplicates, follow-ups)
- Link to time entries (track time on tickets)

#### 9. Activity Tracking
- Automatic activity log
- Status change history
- Assignment history
- Comment history
- Timeline view

#### 10. SLA Tracking (Future)
- First response time
- Resolution time
- Target SLAs by priority
- SLA breach alerts

### Advanced Features (Future Phases)

#### Phase 2
- Email integration (create tickets from email)
- Ticket templates
- Auto-assignment rules
- SLA management
- Ticket escalation
- Knowledge base integration

#### Phase 3
- Customer portal (external ticket submission)
- Public ticket status page
- Ticket analytics & reporting
- Custom workflows
- Automation rules
- Integration with external tools

---

## Integration Points

### 1. Clients Module
- Link tickets to clients
- View client tickets in ClientDetailModal
- Create ticket from client context

### 2. Projects Module
- Link tickets to projects
- View project tickets in ProjectDetail
- Create ticket from project context

### 3. Users Module
- Assign tickets to users
- View user's assigned tickets
- User ticket statistics

### 4. Notifications System
- Notify on ticket assignment
- Notify on status changes
- Notify on new comments
- Notify on @mentions
- Email notifications (if configured)

### 5. Time Tracking
- Link time entries to tickets
- Track time spent on tickets
- Billable time tracking

### 6. Comments System
- Reuse existing comment infrastructure
- @mention support
- Rich text editor

### 7. Permissions System
- `ACCESS_HELPDESK`: Access helpdesk module
- `HELPDESK_CREATE`: Create tickets
- `HELPDESK_EDIT`: Edit tickets
- `HELPDESK_DELETE`: Delete tickets
- `HELPDESK_ASSIGN`: Assign tickets
- `HELPDESK_ADMIN`: Full admin access

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
**Goal**: Basic ticket CRUD operations

**Tasks**:
1. ✅ Create database schema (Prisma migration)
2. ✅ Create API endpoint (`api/helpdesk.js`)
3. ✅ Create main component (`Helpdesk.jsx`)
4. ✅ Create ticket form (`TicketForm.jsx`)
5. ✅ Create detail modal (`TicketDetailModal.jsx`)
6. ✅ Add to navigation (MainLayout.jsx)
7. ✅ Add to component loader
8. ✅ Add permissions
9. ✅ Basic list view
10. ✅ Create/edit tickets

**Deliverables**:
- Working ticket creation
- Working ticket list
- Working ticket detail view
- Basic filtering

### Phase 2: Enhanced Features (Week 3-4)
**Goal**: Comments, assignments, status management

**Tasks**:
1. ✅ Comments system integration
2. ✅ Assignment functionality
3. ✅ Status workflow
4. ✅ Priority management
5. ✅ Activity timeline
6. ✅ Attachments
7. ✅ Search functionality
8. ✅ Advanced filters

**Deliverables**:
- Full ticket management
- Comments with @mentions
- File attachments
- Activity tracking

### Phase 3: Integration (Week 5)
**Goal**: Integrate with existing modules

**Tasks**:
1. ✅ Link tickets to clients
2. ✅ Link tickets to projects
3. ✅ View tickets in client/project detail modals
4. ✅ Create tickets from client/project context
5. ✅ Notification integration
6. ✅ Time tracking integration

**Deliverables**:
- Fully integrated with CRM and Projects
- Notifications working
- Cross-module navigation

### Phase 4: Polish & Optimization (Week 6)
**Goal**: UI/UX improvements and performance

**Tasks**:
1. ✅ UI/UX refinements
2. ✅ Mobile responsiveness
3. ✅ Performance optimization
4. ✅ Error handling
5. ✅ Loading states
6. ✅ Empty states
7. ✅ Documentation

**Deliverables**:
- Production-ready module
- Complete documentation
- User guide

---

## Code Patterns & Examples

### Component Registration Pattern
```javascript
// At end of Helpdesk.jsx
window.Helpdesk = Helpdesk;
window.dispatchEvent(new CustomEvent('componentLoaded', { 
    detail: { component: 'Helpdesk' } 
}));
```

### API Call Pattern
```javascript
// Using DatabaseAPI
const tickets = await window.DatabaseAPI.get('/api/helpdesk', {
    status: 'open',
    assignedTo: userId
});
```

### Modal Pattern
```javascript
// Similar to ClientDetailModal pattern
<TicketDetailModal
    ticket={selectedTicket}
    onSave={handleSaveTicket}
    onClose={() => setSelectedTicket(null)}
    onDelete={handleDeleteTicket}
/>
```

### Permission Check Pattern
```javascript
const { user } = window.useAuth();
const canCreate = window.PermissionChecker?.check(user, 'HELPDESK_CREATE');
```

---

## Testing Checklist

### Functional Tests
- [ ] Create ticket
- [ ] Edit ticket
- [ ] Delete ticket
- [ ] Assign ticket
- [ ] Change status
- [ ] Add comment
- [ ] Upload attachment
- [ ] Link to client
- [ ] Link to project
- [ ] Filter tickets
- [ ] Search tickets
- [ ] Sort tickets

### Integration Tests
- [ ] Ticket appears in client detail modal
- [ ] Ticket appears in project detail
- [ ] Notifications sent on assignment
- [ ] Notifications sent on comments
- [ ] Time entries link to tickets

### Permission Tests
- [ ] Users without ACCESS_HELPDESK cannot access
- [ ] Users without HELPDESK_CREATE cannot create
- [ ] Users without HELPDESK_EDIT cannot edit
- [ ] Only admins can delete

---

## Next Steps

1. **Review & Approve**: Review this framework document
2. **Database Migration**: Create Prisma schema and migration
3. **API Development**: Build API endpoint following patterns
4. **Component Development**: Build React components
5. **Integration**: Integrate with existing modules
6. **Testing**: Comprehensive testing
7. **Documentation**: User documentation
8. **Deployment**: Deploy to production

---

**Last Updated**: January 2025  
**Status**: Framework Ready for Implementation  
**Author**: Development Team






