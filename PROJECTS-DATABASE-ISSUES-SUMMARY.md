# Projects Section Database Issues - Summary & Action Plan

## 🔴 Critical Issues Found

### 1. **Tasks Stored in JSON (CRITICAL)**

**Current State:**
- Tasks stored in `Project.tasksList` as JSON string
- `Task` table exists but **NOT being used** for project tasks
- `TaskComment.taskId` is a String (not foreign key) because tasks are in JSON

**Risk Level:** 🔴 **CRITICAL**
- Same race condition issues as comments had
- Two users editing different tasks can overwrite each other
- Performance issues with large projects
- No way to query individual tasks efficiently

**Evidence:**
```prisma
// Task table exists but unused
model Task {
  id           String    @id @default(cuid())
  projectId    String
  // ... fields exist
}

// But tasks are stored in JSON
model Project {
  tasksList String @default("[]")  // ❌ Tasks in JSON
  tasks     Task[]                  // ✅ Table exists but unused
}

// TaskComment references taskId as String (not FK)
model TaskComment {
  taskId String  // ❌ String because tasks are in JSON
}
```

**Impact:**
- **Data Loss:** High risk of concurrent update conflicts
- **Performance:** Parsing entire JSON on every save
- **Scalability:** Can't handle large numbers of tasks efficiently
- **Query Limitations:** Can't query tasks by status, assignee, etc. without parsing JSON

---

### 2. **ActivityLog Stored in JSON (MEDIUM)**

**Current State:**
- `Project.activityLog` stored as JSON string
- No merge logic (unlike comments)
- Multiple users adding entries simultaneously will lose data

**Risk Level:** 🟡 **MEDIUM**
- Less frequent updates than tasks
- But still has race condition risks

**Impact:**
- Activity entries can be lost
- No way to query or filter activity logs
- No audit trail capabilities

---

### 3. **Team Assignments Stored in JSON (MEDIUM)**

**Current State:**
- `Project.team` stored as JSON string
- No merge logic
- Can't query "all projects user X is on"

**Risk Level:** 🟡 **MEDIUM**
- Less frequent updates
- But concurrent updates can overwrite

**Impact:**
- Team changes can be lost
- Can't efficiently query user's projects
- No way to prevent duplicate assignments

---

### 4. **Project-Level Comments Stored in JSON (MEDIUM)**

**Current State:**
- `Project.comments` stored as JSON string
- Same issues as task comments had (before we fixed them)

**Risk Level:** 🟡 **MEDIUM**
- Less frequent than task comments
- But same race condition risks

**Impact:**
- Comments can be lost
- No way to query or filter comments

---

## ✅ What's Working Well

1. **TaskComment Table** ✅ - Just migrated, working correctly
2. **DocumentSection Tables** ✅ - Hybrid approach (table + JSON fallback)
3. **WeeklyFMSReviewSection Tables** ✅ - Hybrid approach (table + JSON fallback)
4. **Merge Logic for Comments** ✅ - Prevents data loss in tasks

---

## 📋 Recommended Action Plan

### Phase 1: Quick Fixes (1-2 days) 🟡

**Add merge logic to prevent immediate data loss:**

1. **Add ActivityLog merge logic** in `api/projects.js`
   - Similar to comments merge logic
   - Prevents concurrent update conflicts

2. **Add Team merge logic** in `api/projects.js`
   - Merge team arrays by userId
   - Prevent duplicate assignments

**Files to modify:**
- `api/projects.js` (PUT handler, around line 928)

**Estimated effort:** 4-6 hours

---

### Phase 2: Task Migration (1 week) 🔴 **HIGH PRIORITY**

**Migrate tasks from JSON to Task table:**

1. **Update Task table schema** (if needed)
   - Add fields: `title`, `description`, `priority`, `dueDate`, `status`, `assignee`, `tags`, `attachments`, `checklist`, `subtasks`, etc.
   - Currently Task table is minimal

2. **Create migration script**
   - Similar to `migrate-comments-to-table.js`
   - Move tasks from `tasksList` JSON to `Task` table
   - Handle subtasks (nested structure)

3. **Create Task API endpoints**
   - `GET /api/tasks?projectId=XXX` - Get all tasks for project
   - `GET /api/tasks/:id` - Get single task
   - `POST /api/tasks` - Create task
   - `PUT /api/tasks/:id` - Update task
   - `DELETE /api/tasks/:id` - Delete task

4. **Update frontend**
   - `ProjectDetail.jsx` - Load tasks from API instead of JSON
   - `TaskDetailModal.jsx` - Use Task API for updates
   - Update all task-related operations

5. **Update TaskComment**
   - Change `taskId` from String to foreign key
   - Add proper relation to Task table

**Files to create:**
- `api/tasks.js` - Task CRUD endpoints
- `migrate-tasks-to-table.js` - Migration script

**Files to modify:**
- `prisma/schema.prisma` - Update Task model, TaskComment relation
- `src/components/projects/ProjectDetail.jsx` - Load from API
- `src/components/projects/TaskDetailModal.jsx` - Use Task API
- `api/task-comments.js` - Update to use Task FK

**Estimated effort:** 1 week

---

### Phase 3: ActivityLog Table (3-5 days) 🟡

**Create ProjectActivityLog table:**

1. **Add to schema:**
   ```prisma
   model ProjectActivityLog {
     id        String   @id @default(cuid())
     projectId String
     type      String   // "Task Created", "Status Changed", etc.
     userId    String?
     user      String   // Denormalized
     details   String?
     metadata  Json?    // Additional data
     createdAt DateTime @default(now())
     
     project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
     author    User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
     
     @@index([projectId])
     @@index([createdAt])
     @@index([type])
   }
   ```

2. **Create API endpoints**
3. **Create migration script**
4. **Update frontend**

**Estimated effort:** 3-5 days

---

### Phase 4: Team Table (3-5 days) 🟡

**Create ProjectTeamMember table:**

1. **Add to schema:**
   ```prisma
   model ProjectTeamMember {
     id        String   @id @default(cuid())
     projectId String
     userId    String
     role      String?
     createdAt DateTime @default(now())
     
     project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
     user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
     
     @@unique([projectId, userId])
     @@index([projectId])
     @@index([userId])
   }
   ```

2. **Create API endpoints**
3. **Create migration script**
4. **Update frontend**

**Estimated effort:** 3-5 days

---

### Phase 5: ProjectComment Table (2-3 days) 🟡

**Create ProjectComment table (similar to TaskComment):**

1. **Add to schema** (similar to TaskComment)
2. **Create API endpoints** (can reuse TaskComment API pattern)
3. **Create migration script**
4. **Update frontend**

**Estimated effort:** 2-3 days

---

## 🎯 Priority Matrix

| Issue | Priority | Risk | Effort | Impact |
|-------|----------|------|--------|--------|
| Tasks in JSON | 🔴 HIGH | Critical | 1 week | Very High |
| ActivityLog merge | 🟡 MEDIUM | Medium | 4 hours | Medium |
| Team merge | 🟡 MEDIUM | Medium | 4 hours | Medium |
| ActivityLog table | 🟡 MEDIUM | Medium | 3-5 days | High |
| Team table | 🟡 MEDIUM | Medium | 3-5 days | High |
| ProjectComment table | 🟡 MEDIUM | Medium | 2-3 days | Medium |

---

## 📊 Current vs Recommended Architecture

### Current (Problematic)
```
Project
├── tasksList: "[{id, title, comments: [...], ...}]"  ❌ JSON
├── activityLog: "[{id, type, ...}]"                  ❌ JSON
├── team: "[{userId, name, ...}]"                     ❌ JSON
├── comments: "[{id, text, ...}]"                    ❌ JSON
└── TaskComment (separate table)                      ✅ Good
```

### Recommended (Best Practice)
```
Project
├── tasks: Task[] (relation)                           ✅ Table
│   ├── comments: TaskComment[] (relation)            ✅ Table
│   └── subtasks: Task[] (self-relation)              ✅ Table
├── activityLog: ProjectActivityLog[] (relation)      ✅ Table
├── team: ProjectTeamMember[] (relation)              ✅ Table
└── comments: ProjectComment[] (relation)              ✅ Table
```

---

## 🚀 Quick Wins (Do First)

1. **Add merge logic for ActivityLog** (4 hours)
   - Prevents immediate data loss
   - Low risk, high value

2. **Add merge logic for Team** (4 hours)
   - Prevents immediate data loss
   - Low risk, high value

3. **Plan Task migration** (1 day planning)
   - Design migration strategy
   - Create detailed migration plan
   - Get approval before starting

---

## 📝 Implementation Notes

### Task Migration Considerations

**Challenge:** Tasks have complex nested structure
- Subtasks (nested tasks)
- Comments (now in separate table ✅)
- Attachments
- Checklist items
- Custom fields
- Tags

**Solution:**
- Use `Task.parentTaskId` for subtasks (already in schema)
- Keep attachments/checklist/tags as JSON in Task table (acceptable for now)
- Or create separate tables if they become complex

**Migration Strategy:**
1. Keep `tasksList` JSON during transition (hybrid)
2. Load from Task table, fallback to JSON
3. Save to both during transition
4. Once stable, remove JSON handling

---

## ✅ Success Criteria

After migrations:

- [ ] No data loss during concurrent updates
- [ ] Tasks can be queried efficiently (by status, assignee, etc.)
- [ ] Activity logs are queryable and filterable
- [ ] Can query "all projects user X is on"
- [ ] Performance is acceptable with 500+ tasks
- [ ] All migrations tested and verified
- [ ] Rollback plan documented

---

## 📚 Related Documentation

- `BEST-PRACTICES-COMMENT-PERSISTENCE.md` - Comment migration pattern
- `COMMENT-TABLE-IMPLEMENTATION-COMPLETE.md` - Implementation guide
- `migrate-comments-to-table.js` - Migration script example

---

**Next Steps:**
1. Review this analysis
2. Decide on priority order
3. Start with quick fixes (merge logic)
4. Plan Task migration in detail
5. Execute migrations incrementally



