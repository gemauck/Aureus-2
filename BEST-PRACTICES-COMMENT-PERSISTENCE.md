# Best Practices for Comment Persistence

## Problem
Comments stored in JSON within `tasksList` are being lost when multiple users edit simultaneously due to:
- Race conditions (User A saves, overwriting User B's comments)
- Stale data in memory
- No atomic operations on JSON fields

## Solutions (Ranked by Effectiveness)

### 🏆 Solution 1: Separate Comment Table (RECOMMENDED)

**Why:** Proper relational model with ACID guarantees, no race conditions, better querying.

**Implementation:**

```prisma
// Add to prisma/schema.prisma
model TaskComment {
  id        String   @id @default(cuid())
  taskId    String   // Reference to task ID (can be in tasksList JSON)
  projectId String   // Reference to project for quick queries
  text      String
  authorId  String
  author    String   // Denormalized for quick display
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  project   Project  @relation(fields: [projectId], references: [id])
  authorUser User?    @relation(fields: [authorId], references: [id])
  
  @@index([taskId])
  @@index([projectId])
  @@index([createdAt])
}

// Update Project model
model Project {
  // ... existing fields ...
  taskComments TaskComment[]
}
```

**Benefits:**
- ✅ Atomic inserts (no race conditions)
- ✅ Easy to query/filter comments
- ✅ Can add features (reactions, mentions, threading)
- ✅ Better performance (indexed queries)
- ✅ Audit trail (createdAt, updatedAt)

**Migration Strategy:**
1. Create new table
2. Migrate existing comments from JSON to table
3. Update frontend to use new API endpoints
4. Keep JSON as fallback during transition

---

### 🥈 Solution 2: Database-Level JSON Merging (Good Interim)

**Why:** Works with existing schema, atomic at database level.

**Implementation in `api/projects.js`:**

```javascript
// Use PostgreSQL JSON functions to merge atomically
const updateData = {
  // ... other fields ...
  tasksList: prisma.$queryRaw`
    UPDATE "Project"
    SET "tasksList" = (
      SELECT jsonb_agg(
        CASE 
          WHEN new_task.id = old_task.id THEN
            jsonb_set(
              old_task::jsonb,
              '{comments}',
              (
                SELECT jsonb_agg(DISTINCT comment)
                FROM jsonb_array_elements(
                  COALESCE(old_task->'comments', '[]'::jsonb) || 
                  COALESCE(new_task->'comments', '[]'::jsonb)
                ) AS comment
              )
            )
          ELSE new_task
        END
      )
      FROM jsonb_array_elements(${JSON.stringify(tasksToSave)}::jsonb) AS new_task
      LEFT JOIN jsonb_array_elements("tasksList"::jsonb) AS old_task 
        ON new_task->>'id' = old_task->>'id'
    )
    WHERE id = ${projectId}
  `
}
```

**Or use Prisma's JSON operations:**

```javascript
// Fetch current state
const currentProject = await prisma.project.findUnique({
  where: { id: projectId },
  select: { tasksList: true }
});

const currentTasks = JSON.parse(currentProject.tasksList || '[]');
const newTasks = JSON.parse(body.tasksList || '[]');

// Merge at database level
const mergedTasks = currentTasks.map(currentTask => {
  const newTask = newTasks.find(t => t.id === currentTask.id);
  if (!newTask) return currentTask;
  
  // Merge comments by ID
  const currentComments = Array.isArray(currentTask.comments) ? currentTask.comments : [];
  const newComments = Array.isArray(newTask.comments) ? newTask.comments : [];
  
  const commentsMap = new Map();
  currentComments.forEach(c => {
    if (c.id) commentsMap.set(c.id, c);
  });
  newComments.forEach(c => {
    if (c.id) commentsMap.set(c.id, c);
    else commentsMap.set(`new-${Date.now()}-${Math.random()}`, c);
  });
  
  return {
    ...newTask,
    comments: Array.from(commentsMap.values())
  };
});

// Add any new tasks
newTasks.forEach(newTask => {
  if (!mergedTasks.find(t => t.id === newTask.id)) {
    mergedTasks.push(newTask);
  }
});

await prisma.project.update({
  where: { id: projectId },
  data: {
    tasksList: JSON.stringify(mergedTasks)
  }
});
```

---

### 🥉 Solution 3: Optimistic Locking (Good Addition)

**Why:** Detects conflicts before they happen.

**Implementation:**

```prisma
// Add to Project model
model Project {
  // ... existing fields ...
  version Int @default(1) // Increment on each update
}
```

```javascript
// In api/projects.js
const currentProject = await prisma.project.findUnique({
  where: { id: projectId },
  select: { version: true, tasksList: true }
});

// Check version
if (body.version && body.version !== currentProject.version) {
  return res.status(409).json({ 
    error: 'Conflict',
    message: 'Project was modified by another user. Please refresh and try again.',
    currentVersion: currentProject.version
  });
}

// Update with version increment
await prisma.project.update({
  where: { 
    id: projectId,
    version: currentProject.version // Optimistic lock
  },
  data: {
    // ... update data ...
    version: { increment: 1 }
  }
});
```

**Frontend:**
```javascript
// Include version in save requests
const saveProject = async (projectData) => {
  const response = await window.DatabaseAPI.updateProject(project.id, {
    ...projectData,
    version: project.version
  });
  
  if (response.error === 'Conflict') {
    // Refresh and retry
    await refreshProject();
    alert('Project was updated. Please try again.');
  }
};
```

---

### Solution 4: Real-Time Sync (Advanced)

**Why:** Users see changes immediately, reduces conflicts.

**Implementation:**
- Use WebSockets (Socket.io, Pusher, etc.)
- Broadcast comment additions to all connected clients
- Update UI in real-time without page refresh

```javascript
// Example with Socket.io
socket.on('comment-added', (data) => {
  const { taskId, comment } = data;
  // Update local state
  setTasks(prevTasks => 
    prevTasks.map(task => 
      task.id === taskId 
        ? { ...task, comments: [...(task.comments || []), comment] }
        : task
    )
  );
});

// When adding comment
socket.emit('add-comment', { taskId, comment });
```

---

## Recommended Approach

**Short-term (Now):**
1. ✅ Keep the frontend merge fix (already implemented)
2. ✅ Add database-level merging in API (Solution 2)
3. ✅ Add optimistic locking (Solution 3)

**Long-term (Next Sprint):**
1. Migrate to separate Comment table (Solution 1)
2. Add real-time sync (Solution 4)

---

## Implementation Priority

1. **Immediate:** Database-level merging in API (prevents most losses)
2. **This Week:** Optimistic locking (detects conflicts)
3. **Next Month:** Separate Comment table (proper solution)
4. **Future:** Real-time sync (nice-to-have)

---

## Testing Checklist

- [ ] Two users add comments simultaneously
- [ ] User adds comment via SQL, another user saves
- [ ] User A adds comment, User B edits task, User A's comment persists
- [ ] Version conflict detection works
- [ ] Comments persist after page refresh
- [ ] Comments persist after browser close/reopen

