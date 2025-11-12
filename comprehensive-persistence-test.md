# Comprehensive Persistence Test

## Test Plan

### 1. Schema Verification

**Backend Schema (Prisma):**
- ✅ Project model has all required fields
- ✅ JSON fields stored as TEXT (tasksList, taskLists, etc.)
- ✅ Document collection fields added (hasDocumentCollectionProcess, documentSections)

**Frontend Data Structure:**
- ✅ Uses arrays for: tasks, taskLists, customFieldDefinitions, documents, comments
- ✅ Uses objects for: project metadata
- ⚠️ **POTENTIAL MISMATCH**: Frontend sends arrays/objects, backend expects JSON strings

### 2. Key Areas to Test

1. **Project Creation**
   - Name, client, description
   - Tasks and task lists
   - Custom fields
   - Document collection

2. **Project Update**
   - Modify basic fields
   - Add/remove tasks
   - Update task lists
   - Modify document sections

3. **Data Persistence**
   - Server restart
   - Page refresh
   - Browser close/reopen

4. **Schema Alignment**
   - JSON serialization/deserialization
   - Field name consistency
   - Data type matching

## Running Tests

### Test 1: Create Project with Tasks
```bash
# This will be done via API calls
```

### Test 2: Update Project Tasks
```bash
# Verify tasks persist and can be modified
```

### Test 3: Check JSON Serialization
```bash
# Verify arrays are properly converted to JSON strings
```














