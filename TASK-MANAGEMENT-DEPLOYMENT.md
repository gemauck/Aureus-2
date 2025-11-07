# Task Management System - Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. Database Schema ✅
- [x] UserTask model defined
- [x] UserTaskTag model defined
- [x] UserTaskTagRelation model defined
- [x] User model updated with relations
- [x] Schema validated with `prisma format`

### 2. API Endpoints ✅
- [x] `/api/user-tasks` - Created and tested
- [x] `/api/user-task-tags` - Created and tested
- [x] Routes registered in `server.js`
- [x] Authentication middleware applied
- [x] Error handling implemented

### 3. Frontend Component ✅
- [x] TaskManagement.jsx created
- [x] Integrated into Dashboard
- [x] Added to lazy loader
- [x] Component registered globally
- [x] All views implemented (List, Kanban, Calendar)

### 4. File Structure ✅
- [x] `api/user-tasks.js` exists
- [x] `api/user-task-tags.js` exists
- [x] `src/components/tasks/TaskManagement.jsx` exists
- [x] Directory structure correct

## 🚀 Deployment Steps

### Step 1: Backup Database (Recommended)
```bash
# Create a backup before migration
pg_dump $DATABASE_URL > backup_before_task_management.sql
```

### Step 2: Run Migration
```bash
# Development
npx prisma migrate dev --name add_user_task_management

# Production (if using migrations)
npx prisma migrate deploy

# OR if using db push
npx prisma db push
```

### Step 3: Verify Migration
```bash
# Check if tables were created
npx prisma studio
# Or query directly:
# SELECT * FROM "UserTask" LIMIT 1;
# SELECT * FROM "UserTaskTag" LIMIT 1;
# SELECT * FROM "UserTaskTagRelation" LIMIT 1;
```

### Step 4: Restart Server
```bash
npm start
# or
pm2 restart your-app
# or
systemctl restart your-service
```

### Step 5: Test the Feature
1. Navigate to Dashboard
2. Verify Task Management component appears
3. Create a test task
4. Test all views (List, Kanban, Calendar)
5. Test filtering and search
6. Test tag creation
7. Test file uploads

## 🔍 Post-Deployment Verification

### API Endpoints Test
```bash
# Test GET /api/user-tasks
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/user-tasks

# Test POST /api/user-tasks
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","status":"todo","priority":"medium"}' \
  http://localhost:3000/api/user-tasks

# Test GET /api/user-task-tags
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/user-task-tags
```

### Database Verification
```sql
-- Check UserTask table exists
SELECT COUNT(*) FROM "UserTask";

-- Check UserTaskTag table exists
SELECT COUNT(*) FROM "UserTaskTag";

-- Check UserTaskTagRelation table exists
SELECT COUNT(*) FROM "UserTaskTagRelation";

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'UserTask';
```

### Frontend Verification
- [ ] Component loads without errors
- [ ] All views render correctly
- [ ] Filters work
- [ ] Search works
- [ ] Task creation works
- [ ] Task editing works
- [ ] Task deletion works
- [ ] Tag creation works
- [ ] File uploads work
- [ ] Quick status toggle works

## 🐛 Troubleshooting

### Issue: Migration Fails
**Solution:**
- Check database connection
- Verify Prisma schema is valid: `npx prisma format`
- Check for existing tables that might conflict
- Review migration logs

### Issue: API Returns 404
**Solution:**
- Verify routes are registered in `server.js`
- Check server logs for errors
- Ensure server was restarted after adding routes
- Verify file paths are correct

### Issue: Component Not Loading
**Solution:**
- Check browser console for errors
- Verify component is in lazy loader
- Check component registration: `window.TaskManagement`
- Clear browser cache

### Issue: Tasks Not Saving
**Solution:**
- Check authentication token
- Verify API endpoint is accessible
- Check server logs for errors
- Verify database migration completed
- Check user ID in request

### Issue: Files Not Uploading
**Solution:**
- Verify `/uploads/tasks/` directory exists
- Check file permissions
- Verify file size (max 8MB)
- Check server logs for upload errors

## 📊 Performance Considerations

### Database Indexes
The following indexes are automatically created:
- `UserTask.ownerId` - Fast user queries
- `UserTask.status` - Fast status filtering
- `UserTask.category` - Fast category filtering
- `UserTask.dueDate` - Fast date sorting
- `UserTask.clientId` - Fast client linking
- `UserTask.projectId` - Fast project linking
- `UserTask.createdAt` - Fast date sorting

### Query Optimization
- Tasks are filtered by `ownerId` first (most selective)
- Tags are loaded with tasks (single query)
- Categories are distinct queries (minimal data)

### File Storage
- Files stored in `/uploads/tasks/` directory
- 8MB limit per file
- Unique filenames prevent conflicts

## 🔒 Security Checklist

- [x] All endpoints require authentication
- [x] Users can only access their own tasks
- [x] File uploads validated (size, type)
- [x] Input sanitization on all fields
- [x] SQL injection protection (Prisma)
- [x] XSS protection (React escaping)
- [x] CSRF protection (token-based auth)

## 📝 Rollback Plan

If issues occur, you can rollback:

### 1. Rollback Migration
```bash
# Find the migration
npx prisma migrate status

# Rollback to previous migration
npx prisma migrate resolve --rolled-back add_user_task_management
```

### 2. Remove Routes (if needed)
Comment out routes in `server.js`:
```javascript
// app.all('/api/user-tasks', ...)
// app.all('/api/user-tasks/:id', ...)
// app.all('/api/user-task-tags', ...)
// app.all('/api/user-task-tags/:id', ...)
```

### 3. Remove Component (if needed)
Comment out in `Dashboard.jsx`:
```javascript
// const TaskManagement = window.TaskManagement || ...
// <TaskManagement />
```

## ✅ Success Criteria

The deployment is successful when:
1. ✅ Migration completes without errors
2. ✅ All API endpoints respond correctly
3. ✅ Component loads in dashboard
4. ✅ Tasks can be created, edited, deleted
5. ✅ All views work (List, Kanban, Calendar)
6. ✅ Filtering and search work
7. ✅ Tags can be created and assigned
8. ✅ Files can be uploaded
9. ✅ No console errors
10. ✅ No server errors

## 📞 Support

If you encounter issues:
1. Check server logs
2. Check browser console
3. Verify database connection
4. Review this checklist
5. Check documentation files

---

**Ready to Deploy**: ✅ Yes
**Last Verified**: 2025-01-27
**Schema Status**: ✅ Valid

