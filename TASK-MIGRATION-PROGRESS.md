# Task Migration Progress

**Date:** 2026-01-09  
**Status:** ✅ Backend Complete - Frontend Pending

---

## ✅ Completed

### 1. **Quick Fixes - Merge Logic** ✅
- ✅ Added merge logic for `activityLog` in `api/projects.js`
- ✅ Added merge logic for `team` in `api/projects.js`
- **Impact:** Prevents immediate data loss from concurrent updates

### 2. **Task Table Schema** ✅
- ✅ Updated `Task` model in `prisma/schema.prisma` with all required fields:
  - Basic fields: `title`, `description`, `status`, `priority`, `assigneeId`, `assignee`, `dueDate`, `listId`
  - Time tracking: `estimatedHours`, `actualHours`
  - Relationships: `blockedBy`, `parentTaskId` (for subtasks)
  - JSON fields: `tags`, `attachments`, `checklist`, `dependencies`, `subscribers`, `customFields`
  - Relations: `assigneeUser`, `parentTask`, `subtasks`, `project`, `comments`

### 3. **TaskComment Foreign Key** ✅
- ✅ Updated `TaskComment` model to use proper foreign key to `Task` table
- ✅ Changed from `String taskId` to `Task task @relation(fields: [taskId], references: [id])`
- **Impact:** Proper relational integrity, cascade deletes

### 4. **Task API Endpoints** ✅
- ✅ Created `api/tasks.js` with full CRUD operations:
  - `GET /api/tasks?projectId=XXX` - Get all tasks for project
  - `GET /api/tasks?id=XXX` - Get single task with comments and subtasks
  - `POST /api/tasks` - Create new task
  - `PUT /api/tasks?id=XXX` - Update task
  - `DELETE /api/tasks?id=XXX` - Delete task (cascades to subtasks and comments)

### 5. **Migration Script** ✅
- ✅ Created `migrate-tasks-to-table.js`
- ✅ Handles tasks and subtasks
- ✅ Preserves all task data
- ✅ Skips existing tasks (idempotent)

---

## ⏳ Pending

### 6. **Database Schema Application** ⏳
- ⏳ Run `npx prisma db push` to apply schema changes
- ⏳ This will create/update the Task table with new fields
- ⏳ This will update TaskComment to use Task foreign key

### 7. **Run Migration Script** ⏳
- ⏳ Run `node migrate-tasks-to-table.js` to migrate existing tasks
- ⏳ This moves tasks from `Project.tasksList` JSON to `Task` table

### 8. **Frontend Updates** ⏳
- ⏳ Update `ProjectDetail.jsx` to load tasks from API instead of JSON
- ⏳ Update `TaskDetailModal.jsx` to use Task API for CRUD
- ⏳ Update task creation/editing to use Task API
- ⏳ Update Kanban view to use Task API
- ⏳ Maintain backward compatibility during transition

---

## 📋 Next Steps

1. **Apply Schema Changes:**
   ```bash
   npx prisma db push
   ```

2. **Run Migration:**
   ```bash
   node migrate-tasks-to-table.js
   ```

3. **Update Frontend:**
   - Modify `ProjectDetail.jsx` to load tasks from `/api/tasks?projectId=XXX`
   - Modify `TaskDetailModal.jsx` to use Task API endpoints
   - Update all task operations to use Task API

4. **Test:**
   - Verify tasks load from API
   - Verify task creation works
   - Verify task updates work
   - Verify task deletion works
   - Verify subtasks work
   - Verify comments still work (now via Task FK)

5. **Deploy:**
   - Commit changes
   - Deploy to production
   - Monitor for issues

---

## 🔄 Hybrid Approach (During Transition)

During the migration, we can maintain backward compatibility:

1. **Load:** Try Task API first, fallback to JSON
2. **Save:** Save to both Task table AND JSON (during transition)
3. **Once stable:** Remove JSON handling

This ensures no data loss during the transition period.

---

## 📊 Files Modified

- ✅ `api/projects.js` - Added merge logic for activityLog and team
- ✅ `prisma/schema.prisma` - Updated Task and TaskComment models
- ✅ `api/tasks.js` - New Task API endpoints
- ✅ `migrate-tasks-to-table.js` - Migration script
- ⏳ `src/components/projects/ProjectDetail.jsx` - Pending frontend updates
- ⏳ `src/components/projects/TaskDetailModal.jsx` - Pending frontend updates

---

## 🎯 Benefits Once Complete

1. **No Race Conditions:** Tasks updated atomically
2. **Better Performance:** No JSON parsing on every save
3. **Queryable:** Can query tasks by status, assignee, due date, etc.
4. **Scalable:** Can handle thousands of tasks efficiently
5. **Data Integrity:** Foreign keys ensure referential integrity
6. **Consistent:** Same pattern as TaskComment, DocumentSection, etc.

---

**Status:** Ready for schema application and migration!



