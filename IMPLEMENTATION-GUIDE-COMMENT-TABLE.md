# Implementation Guide: Separate Comment Table

## Overview
This guide explains how to implement the recommended solution: storing comments in a separate `TaskComment` table instead of JSON.

## Steps Completed ✅

1. ✅ Added `TaskComment` model to Prisma schema
2. ✅ Created API endpoints (`api/task-comments.js`)
3. ✅ Created migration script (`migrate-comments-to-table.js`)

## Steps Remaining

### Step 1: Run Database Migration

```bash
# Generate Prisma client with new model
npx prisma generate

# Create and run migration
npx prisma migrate dev --name add_task_comment_table

# Or if using production database:
npx prisma migrate deploy
```

### Step 2: Migrate Existing Comments

```bash
# Run the migration script to move existing comments from JSON to table
node migrate-comments-to-table.js
```

This will:
- Read all comments from `tasksList` JSON
- Create `TaskComment` records
- Preserve all comment data (text, author, timestamps)

### Step 3: Update Frontend to Use New API

The frontend needs to be updated to:
1. **Load comments** from `/api/task-comments?taskId=XXX` instead of from JSON
2. **Save comments** to `/api/task-comments` instead of through task update
3. **Merge comments** from both sources during transition period

### Step 4: Update TaskDetailModal

Update `src/components/projects/TaskDetailModal.jsx`:

**Current approach (saves through task update):**
```javascript
onUpdate(taskToAutoSave, { closeModal: false });
```

**New approach (saves directly to comment API):**
```javascript
// Add comment via API
const response = await window.DatabaseAPI.makeRequest('/task-comments', {
  method: 'POST',
  body: JSON.stringify({
    taskId: task.id,
    projectId: project.id,
    text: newComment,
    author: currentUser.name,
    authorId: currentUser.id,
    userName: currentUser.email
  })
});

// Refresh comments from API
await loadCommentsFromAPI();
```

### Step 5: Create Comment Loading Function

Add to `TaskDetailModal.jsx`:

```javascript
const loadCommentsFromAPI = async () => {
  if (!task?.id || !project?.id) return;
  
  try {
    const response = await window.DatabaseAPI.makeRequest(
      `/task-comments?taskId=${task.id}&projectId=${project.id}`
    );
    const data = await response.json();
    
    if (data.comments && Array.isArray(data.comments)) {
      // Transform API comments to match expected format
      const formattedComments = data.comments.map(c => ({
        id: c.id,
        text: c.text,
        author: c.author,
        authorId: c.authorId,
        userName: c.userName,
        timestamp: c.createdAt,
        date: new Date(c.createdAt).toLocaleString()
      }));
      
      setComments(formattedComments);
    }
  } catch (error) {
    console.error('Failed to load comments:', error);
    // Fallback to JSON comments during transition
  }
};

// Call on mount and when task changes
useEffect(() => {
  loadCommentsFromAPI();
}, [task?.id, project?.id]);
```

### Step 6: Hybrid Approach (During Migration)

During the transition, support both sources:

```javascript
const loadComments = async () => {
  // Try new API first
  try {
    const apiComments = await loadCommentsFromAPI();
    // Also check JSON for any unmigrated comments
    const jsonComments = Array.isArray(task.comments) ? task.comments : [];
    
    // Merge both sources, deduplicate by ID
    const allComments = [...apiComments, ...jsonComments];
    const uniqueComments = Array.from(
      new Map(allComments.map(c => [c.id || c.text + c.author, c])).values()
    );
    
    setComments(uniqueComments);
  } catch (error) {
    // Fallback to JSON only
    setComments(Array.isArray(task.comments) ? task.comments : []);
  }
};
```

### Step 7: Update ProjectDetail to Load Comments

Update `src/components/projects/ProjectDetail.jsx` to load comments from API when loading tasks:

```javascript
// When loading project, also load comments for all tasks
const loadTaskComments = async (tasks) => {
  if (!project?.id) return tasks;
  
  const tasksWithComments = await Promise.all(
    tasks.map(async (task) => {
      try {
        const response = await window.DatabaseAPI.makeRequest(
          `/task-comments?taskId=${task.id}&projectId=${project.id}`
        );
        const data = await response.json();
        
        if (data.comments && Array.isArray(data.comments)) {
          return {
            ...task,
            comments: data.comments.map(c => ({
              id: c.id,
              text: c.text,
              author: c.author,
              timestamp: c.createdAt,
              date: new Date(c.createdAt).toLocaleString()
            }))
          };
        }
      } catch (error) {
        console.warn('Failed to load comments for task:', task.id);
      }
      return task;
    })
  );
  
  return tasksWithComments;
};
```

## Benefits of This Approach

1. **No Race Conditions**: Each comment is inserted atomically
2. **Better Performance**: Indexed queries, no JSON parsing
3. **Scalability**: Can handle millions of comments
4. **Features**: Easy to add reactions, threading, mentions
5. **Audit Trail**: Proper timestamps, user tracking

## Migration Strategy

1. **Phase 1** (Current): Both JSON and table (hybrid)
2. **Phase 2**: Write only to table, read from both
3. **Phase 3**: Read only from table, remove JSON comments
4. **Phase 4**: Remove JSON comment handling code

## Testing Checklist

- [ ] Comments save to new table
- [ ] Comments load from new table
- [ ] Existing JSON comments still work (during migration)
- [ ] Two users can add comments simultaneously
- [ ] Comments persist after page refresh
- [ ] Comments work for subtasks
- [ ] Migration script runs successfully
- [ ] No duplicate comments after migration

## Rollback Plan

If issues occur:
1. Comments are still in JSON (not deleted)
2. Revert frontend changes
3. Continue using JSON approach
4. Fix issues and retry migration

