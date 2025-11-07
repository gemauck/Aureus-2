# Task Management System

## Overview
A fully functional personal task management platform integrated into the dashboard, allowing users to track their own tasks with categories, tags, checklists, photo uploads, file uploads, and links to clients and projects.

## Features

### Core Functionality
- ✅ Create, read, update, and delete tasks
- ✅ Task statuses: todo, in-progress, completed, cancelled
- ✅ Priority levels: low, medium, high, urgent
- ✅ User-defined categories
- ✅ Custom tags with colors
- ✅ Checklists within tasks
- ✅ Photo uploads (multiple photos per task)
- ✅ File uploads (multiple files per task)
- ✅ Link tasks to clients
- ✅ Link tasks to projects
- ✅ Due dates
- ✅ Task descriptions

### Views
1. **List View**: All tasks displayed in a scrollable list
2. **Kanban View**: Tasks organized by status in columns (todo, in-progress, completed, cancelled)
3. **Calendar View**: Tasks organized by due date in a monthly calendar grid

### Filtering & Search
- Filter by status
- Filter by category
- Filter by tag
- Filter by priority
- Search by title, description, or category
- Real-time statistics (total, todo, in-progress, completed)

## Database Schema

### UserTask Model
```prisma
model UserTask {
  id            String        @id @default(cuid())
  title         String
  description   String        @default("")
  status        String        @default("todo")
  priority      String        @default("medium")
  category      String        @default("")
  dueDate       DateTime?
  completedDate DateTime?
  ownerId       String
  clientId      String?
  projectId     String?
  checklist     String        @default("[]")
  photos        String        @default("[]")
  files         String        @default("[]")
  tags          UserTaskTagRelation[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}
```

### UserTaskTag Model
```prisma
model UserTaskTag {
  id          String                @id @default(cuid())
  name        String
  color       String                @default("#3B82F6")
  ownerId     String
  tasks       UserTaskTagRelation[]
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
}
```

## API Endpoints

### Tasks
- `GET /api/user-tasks` - List all tasks (with optional filters)
- `GET /api/user-tasks/:id` - Get single task
- `POST /api/user-tasks` - Create new task
- `PUT /api/user-tasks/:id` - Update task
- `DELETE /api/user-tasks/:id` - Delete task

### Tags
- `GET /api/user-task-tags` - List all tags
- `GET /api/user-task-tags/:id` - Get single tag
- `POST /api/user-task-tags` - Create new tag
- `PUT /api/user-task-tags/:id` - Update tag
- `DELETE /api/user-task-tags/:id` - Delete tag

## Setup Instructions

### 1. Run Database Migration
```bash
npx prisma migrate dev --name add_user_task_management
```

Or if using `db push`:
```bash
npx prisma db push
```

### 2. Restart Server
The API endpoints are automatically registered in `server.js`. Just restart your server:
```bash
npm start
```

### 3. Access the Feature
Navigate to the Dashboard - the Task Management component will appear below the Calendar component.

## Usage

### Creating a Task
1. Click "New Task" button
2. Fill in task details:
   - Title (required)
   - Description
   - Status
   - Priority
   - Category (can type new or select existing)
   - Due Date
   - Link to Client (optional)
   - Link to Project (optional)
3. Add tags (create new tags if needed)
4. Add checklist items
5. Upload photos
6. Upload files
7. Click "Save Task"

### Managing Tasks
- **Edit**: Click on any task card or use the edit button
- **Delete**: Click the delete button on a task card
- **Filter**: Use the filter dropdowns to narrow down tasks
- **Search**: Type in the search box to find tasks by title/description
- **Switch Views**: Use the view toggle buttons (List, Kanban, Calendar)

### Creating Tags
1. When creating/editing a task, click "Create New Tag"
2. Enter tag name
3. Select tag color
4. Click "Create"
5. Tag will be automatically added to the task

## File Structure

```
api/
  ├── user-tasks.js          # Task CRUD operations
  └── user-task-tags.js      # Tag management

src/components/tasks/
  └── TaskManagement.jsx    # Main task management component

prisma/schema.prisma         # Database schema (UserTask, UserTaskTag models)
```

## Security

- All tasks are user-specific (users can only see/manage their own tasks)
- All API endpoints require authentication
- File uploads are restricted to 8MB per file
- Files are stored in `/uploads/tasks/` directory

## Notes

- Tasks are completely separate from project tasks (which are in the `Task` model)
- Each user has their own set of tags
- Categories are free-form text (not a separate model)
- Photos and files are uploaded via the existing `/api/files` endpoint
- The component is lazy-loaded for optimal performance

