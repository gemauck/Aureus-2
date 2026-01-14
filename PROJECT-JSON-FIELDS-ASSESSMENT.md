# Project JSON Fields Assessment & Recommendations

**Date:** January 10, 2026  
**Purpose:** Assess each JSON field in the Project model and determine if it should be migrated to separate relational tables

---

## Executive Summary

**Total JSON Fields Analyzed:** 10  
**Already Migrated:** 3 (tasksList, documentSections, weeklyFMSReviewSections)  
**Should Migrate:** 5  
**Keep as JSON:** 2  

---

## Detailed Assessment

### ✅ 1. `tasksList` - **ALREADY MIGRATED**

**Current State:**
- **Storage:** JSON string `String @default("[]")`
- **Migration Status:** ✅ Migrated to `Task` table
- **Action:** Remove JSON writes (already done), keep field for backward compatibility

**Recommendation:** ✅ **COMPLETE** - Tasks are now in `Task` table

---

### 2. `taskLists` - **SHOULD MIGRATE** ⚠️

**Current State:**
- **Storage:** JSON string array: `[{ id: 1, name: "To Do", color: "blue" }, ...]`
- **Structure:**
  ```json
  [
    { "id": 1, "name": "To Do", "color": "blue" },
    { "id": 2, "name": "In Progress", "color": "yellow" },
    { "id": 3, "name": "Done", "color": "green" }
  ]
  ```
- **Usage:** Kanban board column definitions, task status management
- **Update Frequency:** Low (defined once per project type, rarely changed)
- **Query Needs:** Minimal (loaded with project)

**Issues:**
- ✅ **Low Priority** - Simple structure, rarely updated
- ✅ **Low Query Needs** - Only loaded with project
- ⚠️ **Potential Issue:** If taskLists need to be shared across projects or customized per user, migration would help

**Recommendation:** ⚠️ **OPTIONAL MIGRATION** (Low Priority)

**Proposed Table Structure:**
```prisma
model ProjectTaskList {
  id        String   @id @default(cuid())
  projectId String
  listId    Int      // Corresponds to id in JSON
  name      String
  color     String
  order     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, listId])
  @@index([projectId])
  @@index([order])
}
```

**Priority:** **LOW** - Can stay as JSON for now

---

### 3. `customFieldDefinitions` - **SHOULD MIGRATE** ⚠️

**Current State:**
- **Storage:** JSON string array: `[{ id: "field1", name: "Field Name", type: "text", ... }, ...]`
- **Structure:**
  ```json
  [
    {
      "id": "field1",
      "name": "Custom Field 1",
      "type": "text",
      "required": false,
      "options": []
    }
  ]
  ```
- **Usage:** Define custom fields for projects (like tags, priorities, etc.)
- **Update Frequency:** Low (configured once, rarely changed)
- **Query Needs:** Minimal (loaded with project)

**Issues:**
- ✅ **Low Priority** - Simple structure, rarely updated
- ✅ **Low Query Needs** - Only loaded with project
- ⚠️ **Potential Issue:** If custom fields need to be shared across projects or have complex validation, migration would help

**Recommendation:** ⚠️ **OPTIONAL MIGRATION** (Low Priority)

**Proposed Table Structure:**
```prisma
model ProjectCustomFieldDefinition {
  id          String   @id @default(cuid())
  projectId   String
  fieldId     String   // Corresponds to id in JSON
  name        String
  type        String   // "text", "number", "select", "date", etc.
  required    Boolean  @default(false)
  options     String   @default("[]") // JSON array of options for select fields
  defaultValue String?
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, fieldId])
  @@index([projectId])
  @@index([type])
  @@index([order])
}
```

**Priority:** **LOW** - Can stay as JSON for now

---

### 4. `documents` - **SHOULD MIGRATE** 🔴

**Current State:**
- **Storage:** JSON string array: `[{ id: "...", name: "...", url: "...", ... }, ...]`
- **Structure:**
  ```json
  [
    {
      "id": "doc1",
      "name": "Document Name",
      "url": "https://...",
      "type": "pdf",
      "uploadDate": "2024-01-01",
      "size": 1024,
      "tags": []
    }
  ]
  ```
- **Usage:** General project documents (not the Document Collection Process)
- **Update Frequency:** Medium (documents added/removed regularly)
- **Query Needs:** Medium (search by name, filter by type, sort by date)

**Issues:**
- 🔴 **Should Query:** Need to search documents, filter by type, sort by upload date
- 🔴 **File Management:** Documents may need versioning, access control
- 🔴 **Relationships:** Documents may be shared across projects or linked to tasks
- ⚠️ **Note:** Document Collection Process already has `DocumentSection` table, but this is for general documents

**Recommendation:** 🔴 **SHOULD MIGRATE** (Medium Priority)

**Proposed Table Structure:**
```prisma
model ProjectDocument {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  description String   @default("")
  url         String?
  filePath    String?  // Server file path
  type        String?  // "pdf", "docx", "xlsx", etc.
  size        Int?     // File size in bytes
  mimeType    String?
  uploadDate  DateTime @default(now())
  uploadedBy  String?  // User ID
  tags        String   @default("[]") // JSON array of tags
  version     Int      @default(1)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  uploader    User?    @relation("ProjectDocumentUploader", fields: [uploadedBy], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([type])
  @@index([uploadDate])
  @@index([uploadedBy])
  @@index([isActive])
}
```

**Priority:** **MEDIUM** - Should migrate for better querying and file management

---

### 5. `comments` - **SHOULD MIGRATE** 🔴

**Current State:**
- **Storage:** JSON string array: `[{ id: "...", text: "...", author: "...", timestamp: "...", ... }, ...]`
- **Structure:**
  ```json
  [
    {
      "id": "comment1",
      "text": "Comment text",
      "author": "User Name",
      "authorId": "user-id",
      "timestamp": "2024-01-01T00:00:00Z",
      "type": "project"
    }
  ]
  ```
- **Usage:** General project comments (not task-specific comments)
- **Update Frequency:** High (comments added frequently)
- **Query Needs:** High (filter by author, sort by date, search text)

**Issues:**
- 🔴 **Already Have Pattern:** `TaskComment` table exists - should follow same pattern
- 🔴 **High Query Needs:** Comments need to be searchable, filterable, sortable
- 🔴 **Relationships:** Comments linked to users, may need threading/replies
- ⚠️ **Note:** `TaskComment` exists for task comments, but project-level comments are still JSON

**Recommendation:** 🔴 **SHOULD MIGRATE** (High Priority)

**Proposed Table Structure:**
```prisma
model ProjectComment {
  id        String   @id @default(cuid())
  projectId String
  text      String
  authorId  String?
  author    String   @default("") // Denormalized author name for quick display
  userName  String?  // Username/email (denormalized)
  type      String   @default("comment") // "comment", "note", "status_update", etc.
  parentId  String?  // For threaded replies (self-referential)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  authorUser User?   @relation("ProjectCommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  parent    ProjectComment? @relation("ProjectCommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   ProjectComment[] @relation("ProjectCommentReplies")

  @@index([projectId])
  @@index([authorId])
  @@index([createdAt])
  @@index([parentId])
  @@index([type])
}
```

**Priority:** **HIGH** - Should migrate to match TaskComment pattern and enable querying

---

### 6. `activityLog` - **SHOULD MIGRATE** 🔴

**Current State:**
- **Storage:** JSON string array: `[{ id: "...", type: "...", user: "...", timestamp: "...", ... }, ...]`
- **Structure:**
  ```json
  [
    {
      "id": "activity1",
      "type": "task_created",
      "user": "User Name",
      "userId": "user-id",
      "timestamp": "2024-01-01T00:00:00Z",
      "description": "User created a new task",
      "metadata": {}
    }
  ]
  ```
- **Usage:** Audit trail of all project activities
- **Update Frequency:** Very High (every action creates an entry)
- **Query Needs:** Very High (filter by type, user, date range, search)

**Issues:**
- 🔴 **Audit Trail:** Critical for compliance and debugging
- 🔴 **High Query Needs:** Need to filter, search, and analyze activity logs
- 🔴 **Performance:** Large JSON arrays become slow to query and update
- 🔴 **Data Growth:** Activity logs grow continuously and can bloat the Project record
- ⚠️ **Note:** There's a general `AuditLog` model, but project-specific logs are still in JSON

**Recommendation:** 🔴 **SHOULD MIGRATE** (High Priority)

**Proposed Table Structure:**
```prisma
model ProjectActivityLog {
  id          String   @id @default(cuid())
  projectId   String
  type        String   // "task_created", "status_changed", "comment_added", etc.
  userId      String?
  userName    String   @default("") // Denormalized for quick display
  description String
  metadata    String   @default("{}") // JSON object for additional data
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User?   @relation("ProjectActivityUser", fields: [userId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([type])
  @@index([userId])
  @@index([createdAt])
  @@index([projectId, createdAt]) // Composite for date range queries
}
```

**Priority:** **HIGH** - Should migrate for performance, querying, and audit compliance

---

### 7. `team` - **SHOULD MIGRATE** 🔴

**Current State:**
- **Storage:** JSON string array: `[{ userId: "...", name: "...", role: "...", email: "...", ... }, ...]`
- **Structure:**
  ```json
  [
    {
      "userId": "user-id",
      "name": "Team Member Name",
      "role": "Developer",
      "email": "user@example.com",
      "permissions": [],
      "addedDate": "2024-01-01"
    }
  ]
  ```
- **Usage:** Project team members and their roles/permissions
- **Update Frequency:** Medium (team members added/removed, roles changed)
- **Query Needs:** Medium (filter by role, find projects by team member, check permissions)

**Issues:**
- 🔴 **Relationships:** Should link to User table via foreign key
- 🔴 **Query Needs:** Need to find "all projects user is on", "all team members with role X"
- 🔴 **Permissions:** Team member permissions/permissions need proper structure
- ⚠️ **Note:** There's a general `Team` model and `Membership` model, but project teams are separate

**Recommendation:** 🔴 **SHOULD MIGRATE** (Medium Priority)

**Proposed Table Structure:**
```prisma
model ProjectTeamMember {
  id          String   @id @default(cuid())
  projectId   String
  userId      String
  role        String   @default("member") // "owner", "admin", "member", "viewer", etc.
  permissions String   @default("[]") // JSON array of specific permissions
  addedDate   DateTime @default(now())
  addedBy     String?  // User ID who added this member
  notes       String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation("ProjectTeamMember", fields: [userId], references: [id], onDelete: Cascade)
  adder   User?   @relation("ProjectTeamMemberAddedBy", fields: [addedBy], references: [id], onDelete: SetNull)

  @@unique([projectId, userId])
  @@index([projectId])
  @@index([userId])
  @@index([role])
  @@index([addedDate])
}
```

**Priority:** **MEDIUM** - Should migrate for proper relationships and querying

---

### ✅ 8. `documentSections` - **ALREADY MIGRATED**

**Current State:**
- **Storage:** JSON string (hybrid - also stored in `DocumentSection` table)
- **Migration Status:** ✅ Migrated to `DocumentSection` table with related models
- **Action:** Keep JSON for backward compatibility, primary storage in table

**Recommendation:** ✅ **COMPLETE** - Document Collection Process already normalized

---

### ✅ 9. `weeklyFMSReviewSections` - **ALREADY MIGRATED**

**Current State:**
- **Storage:** JSON string (hybrid - also stored in `WeeklyFMSReviewSection` table)
- **Migration Status:** ✅ Migrated to `WeeklyFMSReviewSection` table with related models
- **Action:** Keep JSON for backward compatibility, primary storage in table

**Recommendation:** ✅ **COMPLETE** - Weekly FMS Review already normalized

---

### 10. `monthlyProgress` - **KEEP AS JSON** ✅

**Current State:**
- **Storage:** JSON object: `{ "2024-01": { compliance: "...", data: "...", comments: "..." }, ... }`
- **Structure:**
  ```json
  {
    "2024-01": {
      "compliance": "100%",
      "data": "Data entry complete",
      "comments": "Monthly review notes"
    },
    "2024-02": { ... }
  }
  ```
- **Usage:** Monthly progress tracking data (compliance, data entry status, comments)
- **Update Frequency:** Low (once per month per project)
- **Query Needs:** Low (usually accessed by month key, rarely filtered/searched)

**Issues:**
- ✅ **Simple Structure:** Key-value pairs by month (year-month as key)
- ✅ **Low Query Needs:** Usually accessed by specific month, not filtered/searched
- ✅ **Self-Contained:** Data is project-specific and time-based
- ⚠️ **Note:** Could be normalized, but complexity may not justify it

**Recommendation:** ✅ **KEEP AS JSON** (Low Priority for Migration)

**Reasoning:**
- The structure is simple and self-contained
- Access pattern is direct key lookup (`monthlyProgress["2024-01"]`)
- No complex relationships needed
- Monthly data is typically accessed as a whole, not individually queried

**If Migration Needed Later:**
```prisma
model ProjectMonthlyProgress {
  id          String   @id @default(cuid())
  projectId   String
  year        Int
  month       Int      // 1-12
  compliance  String   @default("")
  data        String   @default("")
  comments    String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, year, month])
  @@index([projectId])
  @@index([year, month])
}
```

**Priority:** **VERY LOW** - Can stay as JSON

---

## Migration Priority Summary

| Priority | Field | Recommendation | Reason |
|----------|-------|----------------|--------|
| 🔴 **HIGH** | `comments` | **MIGRATE** | High query needs, follows TaskComment pattern |
| 🔴 **HIGH** | `activityLog` | **MIGRATE** | Audit trail, performance, querying needs |
| 🟡 **MEDIUM** | `documents` | **MIGRATE** | Query needs, file management, relationships |
| 🟡 **MEDIUM** | `team` | **MIGRATE** | User relationships, permissions, querying |
| 🟢 **LOW** | `taskLists` | **OPTIONAL** | Simple, rarely updated, low query needs |
| 🟢 **LOW** | `customFieldDefinitions` | **OPTIONAL** | Simple, rarely updated, low query needs |
| ✅ **KEEP** | `monthlyProgress` | **KEEP JSON** | Simple structure, direct key access |

---

## Implementation Recommendations

### Phase 1: High Priority Migrations

1. **ProjectComment Table** (Follow TaskComment pattern)
   - Migrate existing comments from JSON
   - Update API endpoints
   - Update frontend components
   - Remove JSON writes

2. **ProjectActivityLog Table**
   - Create new table
   - Start logging new activities to table
   - Optionally migrate historical data
   - Add query endpoints for activity logs

### Phase 2: Medium Priority Migrations

3. **ProjectDocument Table**
   - Migrate general documents (separate from Document Collection)
   - Add file management features
   - Add search/filter capabilities

4. **ProjectTeamMember Table**
   - Migrate team members
   - Link to User table properly
   - Add permission management

### Phase 3: Optional Migrations (Future)

5. **ProjectTaskList Table** (if needed)
   - Only if task lists need to be shared or customized

6. **ProjectCustomFieldDefinition Table** (if needed)
   - Only if custom fields need complex validation or sharing

---

## Estimated Impact

### Benefits of Migration:

✅ **Performance:**
- Faster queries (indexed fields)
- Reduced Project record size
- Better scalability

✅ **Functionality:**
- Better search and filtering
- Proper relationships with User table
- Audit trail capabilities

✅ **Data Integrity:**
- Foreign key constraints
- Cascading deletes
- Data validation

### Risks:

⚠️ **Migration Complexity:**
- Need to migrate existing data
- Update all API endpoints
- Update frontend components
- Maintain backward compatibility

⚠️ **Development Time:**
- High priority: ~2-3 days each
- Medium priority: ~1-2 days each

---

## Conclusion

**Total JSON Fields:** 10  
**Already Migrated:** 3 ✅  
**Should Migrate:** 5 🔴🟡  
**Keep as JSON:** 2 ✅  

**Recommended Next Steps:**
1. Start with `ProjectComment` migration (follows existing TaskComment pattern)
2. Migrate `ProjectActivityLog` for audit trail
3. Then proceed with medium priority items

---

**Assessment Completed:** January 10, 2026











