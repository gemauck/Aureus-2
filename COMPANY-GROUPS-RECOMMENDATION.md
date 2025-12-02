# Company Groups Implementation Recommendation

## Overview

This document outlines recommended approaches for grouping clients and leads into company groups (e.g., "Exxaro Group" containing multiple subsidiary companies).

## Current System Architecture

- **Single `Client` table** stores both clients and leads (differentiated by `type` field: `'client'` or `'lead'`)
- Uses Prisma ORM with PostgreSQL
- Clients can have owners, external agents, projects, opportunities, invoices
- Filtering currently by: industry, status, stage (for leads)

## Recommended Approaches

> **Note**: The recommendations below assume **one parent per client**. If you need **multiple parents per client** (e.g., a company belongs to multiple groups), see **Option 4: Many-to-Many Groups** below.

### Option 1: Self-Referential (RECOMMENDED for Single Parent) ⭐

**Concept**: Add a `parentGroupId` field to the `Client` table, allowing clients to be organized hierarchically under parent companies. **Each client can have ONE parent.**

**Pros:**
- ✅ Simple and flexible
- ✅ Works with existing Client/Lead structure
- ✅ Supports multi-level hierarchies (groups within groups)
- ✅ Minimal schema changes
- ✅ A company can be both a group parent and a regular client/lead
- ✅ No additional tables needed

**Cons:**
- ⚠️ Requires careful UI design to distinguish groups from regular clients
- ⚠️ Need to prevent circular references

**Implementation:**

```prisma
model Client {
  // ... existing fields ...
  parentGroupId   String?     // New field: References another Client
  parentGroup     Client?     @relation("CompanyGroups", fields: [parentGroupId], references: [id])
  childCompanies  Client[]    @relation("CompanyGroups")  // Reverse relation
  
  @@index([parentGroupId])
}
```

**Data Model:**
- A client with `parentGroupId = null` is either:
  - A standalone company
  - A group parent (has children)
- A client with `parentGroupId` set belongs to that parent group
- Example: "Exxaro Group" (parentGroupId: null) → "Exxaro Coal" (parentGroupId: "exxaro-group-id")

---

### Option 2: Separate CompanyGroup Table

**Concept**: Create a dedicated `CompanyGroup` table and link clients to groups.

**Pros:**
- ✅ Clear separation of concerns
- ✅ Groups can have their own metadata (description, logo, etc.)
- ✅ Easier to query all groups separately

**Cons:**
- ❌ Additional table complexity
- ❌ More complex queries (joins required)
- ❌ Groups can't be clients/leads themselves
- ❌ Less flexible for companies that are both groups and clients

**Implementation:**

```prisma
model CompanyGroup {
  id          String   @id @default(cuid())
  name        String   @unique
  description String   @default("")
  industry    String   @default("Other")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  companies   Client[]
  
  @@index([name])
}

model Client {
  // ... existing fields ...
  companyGroupId String?
  companyGroup   CompanyGroup? @relation(fields: [companyGroupId], references: [id])
  
  @@index([companyGroupId])
}
```

---

### Option 3: Hybrid - Optional Group Field

**Concept**: Add optional `companyGroup` JSON field to store group membership and metadata inline.

**Pros:**
- ✅ No schema migration needed initially
- ✅ Quick to implement

**Cons:**
- ❌ Harder to query/filter by group
- ❌ No referential integrity
- ❌ Not normalized
- ❌ Limited query capabilities

---

## Detailed Recommendation: Option 1 (Self-Referential)

### 1. Database Schema Changes

**Prisma Schema Update:**

```prisma
model Client {
  id            String          @id @default(cuid())
  name          String
  type          String          // 'client' or 'lead'
  // ... existing fields ...
  
  // Company Group fields
  parentGroupId String?
  parentGroup   Client?         @relation("CompanyGroups", fields: [parentGroupId], references: [id])
  childCompanies Client[]       @relation("CompanyGroups")
  
  // ... rest of existing fields ...
  
  @@index([parentGroupId])
}
```

### 2. API Changes

**New Endpoints:**
- `GET /api/clients/groups` - List all company groups
- `GET /api/clients/:id/children` - Get child companies of a group
- `POST /api/clients/:id/assign-to-group` - Assign client to group
- `DELETE /api/clients/:id/remove-from-group` - Remove from group

**Modified Endpoints:**
- `GET /api/clients` - Include `includeChildren` query param to show grouped structure
- `GET /api/clients/:id` - Include parent group and child companies
- `POST /api/clients` - Support creating group parent companies
- `PUT /api/clients/:id` - Support updating `parentGroupId`

### 3. UI/UX Changes

**In Clients/Leads List:**
- Add "Group By: Company Group" toggle
- Show expandable/collapsible groups
- Display group icon/badge for group parents
- Show company count for each group: "Exxaro Group (5)"

**In Client Detail Modal:**
- Add "Company Group" section
- Dropdown to select/create parent group
- Display child companies in a sub-section
- Show breadcrumb: "Parent Group > Current Company"

**New Group Management UI:**
- Modal to create/edit company groups
- Drag-and-drop to assign companies to groups
- Bulk assign selected companies to a group

### 4. Business Logic Considerations

**Group Parent Rules:**
- A group parent should typically have `type = 'client'` (not 'lead')
- Group parents can still have all client functionality (projects, invoices, etc.)
- When viewing a group parent, show aggregated data from children

**Child Company Rules:**
- Child companies maintain their independence (type, status, stage)
- Can still have own projects, invoices, opportunities
- When removing from group, simply set `parentGroupId = null`

**Circular Reference Prevention:**
- Validate that `parentGroupId` doesn't create cycles
- API should prevent assigning A→B if B is already a child of A

**Data Aggregation:**
- Group revenue = sum of all child company revenue
- Group projects = union of all child company projects
- Group status = aggregate (e.g., if all children are "Active", group is "Active")

### 5. Migration Strategy

**Phase 1: Schema & API**
1. Add `parentGroupId` field to Prisma schema
2. Run migration: `npx prisma migrate dev --name add-company-groups`
3. Update API endpoints to handle groups
4. Add validation logic

**Phase 2: Basic UI**
1. Add group selector in client detail modal
2. Update clients list to show group assignments
3. Create basic group management UI

**Phase 3: Advanced Features**
1. Group-by-group view in clients list
2. Aggregated reporting by group
3. Bulk operations on groups

### 6. Example Use Cases

**Scenario 1: Create Exxaro Group**
```
1. Create client "Exxaro Group" (type: 'client', parentGroupId: null)
2. Set existing clients as children:
   - "Exxaro Coal" → parentGroupId: "exxaro-group-id"
   - "Exxaro Resources" → parentGroupId: "exxaro-group-id"
   - "Matla Coal" → parentGroupId: "exxaro-group-id"
```

**Scenario 2: View Group**
```
- Navigate to "Exxaro Group" client
- See section: "Subsidiary Companies (3)"
- Click to expand and see all child companies
- Aggregate view shows total revenue, project count, etc.
```

**Scenario 3: Filter by Group**
```
- In clients list, filter by "Company Group: Exxaro Group"
- Shows all companies in that group
- Can also view just the parent or just children
```

---

---

## Option 4: Many-to-Many Groups (Multiple Parents Per Client)

**Question: Can a client have two parent IDs?**

**Answer: Yes!** If you need clients to belong to **multiple groups simultaneously**, you'll need a many-to-many relationship using a junction table (similar to your existing `Membership` table pattern).

**Use Cases for Multiple Parents:**
- Joint ventures (company owned by two parent groups)
- Industry associations (company belongs to multiple industry groups)
- Regional groupings (company in "African Mining Group" AND "South African Clients")
- Cross-functional groupings (company in "Enterprise Clients" AND "Mining Industry")

### Implementation: Junction Table Approach

```prisma
model Client {
  // ... existing fields ...
  companyGroups ClientCompanyGroup[]
}

model ClientCompanyGroup {
  clientId  String
  groupId   String  // References another Client that is a group parent
  role      String? @default("member")  // Optional: "member", "subsidiary", "affiliate", etc.
  createdAt DateTime @default(now())
  
  client    Client @relation("ClientGroups", fields: [clientId], references: [id], onDelete: Cascade)
  group     Client @relation("GroupMembers", fields: [groupId], references: [id], onDelete: Cascade)
  
  @@id([clientId, groupId])
  @@index([clientId])
  @@index([groupId])
}
```

**Note**: You'll need to distinguish between:
- **Group Parents**: Clients that act as groups (have `isGroup = true` or similar flag)
- **Regular Clients**: Clients that can belong to groups

**Or use a hybrid approach:**

```prisma
model Client {
  // ... existing fields ...
  
  // Option A: Single primary parent (hierarchical)
  parentGroupId String?
  parentGroup   Client? @relation("PrimaryParent", fields: [parentGroupId], references: [id])
  childCompanies Client[] @relation("PrimaryParent")
  
  // Option B: Multiple group memberships (many-to-many)
  groupMemberships ClientCompanyGroup[] @relation("ClientGroups")
  groupChildren    ClientCompanyGroup[] @relation("GroupMembers")
  
  @@index([parentGroupId])
}

model ClientCompanyGroup {
  clientId  String
  groupId   String
  role      String? @default("member")
  createdAt DateTime @default(now())
  
  client    Client @relation("ClientGroups", fields: [clientId], references: [id], onDelete: Cascade)
  group     Client @relation("GroupMembers", fields: [groupId], references: [id], onDelete: Cascade)
  
  @@id([clientId, groupId])
  @@index([clientId])
  @@index([groupId])
}
```

**Hybrid Benefits:**
- ✅ Primary parent for hierarchical structure (reporting, ownership)
- ✅ Multiple groups for flexible categorization
- ✅ Example: "Exxaro Coal" has primary parent "Exxaro Group", but also belongs to "Mining Consortium" and "African Enterprises"

### Comparison: Single Parent vs Multiple Parents

| Feature | Single Parent (Option 1) | Multiple Parents (Option 4) |
|---------|-------------------------|----------------------------|
| **Complexity** | Simple | More complex |
| **Use Case** | Clear hierarchical ownership | Multiple groupings/categories |
| **Schema** | One field (`parentGroupId`) | Junction table |
| **Queries** | Straightforward | Requires joins |
| **Flexibility** | One parent only | Unlimited parents |
| **UI Complexity** | Simple dropdown | Multi-select or tag system |

### Recommendation for Multiple Parents

If you need multiple parents, I recommend the **Hybrid Approach**:
- Keep a single `parentGroupId` for the **primary/legal parent** (ownership hierarchy)
- Add `ClientCompanyGroup` junction table for **additional groupings** (categorization)

This gives you:
1. Clear ownership structure (who owns whom)
2. Flexible categorization (industry groups, regional groups, etc.)
3. Best of both worlds

---

## Alternative: Simpler Tag-Based Approach

If you want a **quicker, lighter solution**, consider using the existing tags or adding a `companyGroup` string field:

```prisma
model Client {
  // ... existing fields ...
  companyGroup String?  // Simple string: "Exxaro Group", "Anglo American Group", etc.
  
  @@index([companyGroup])
}
```

**Pros:**
- ✅ Very simple - just one field
- ✅ No migrations for relationships
- ✅ Quick to implement

**Cons:**
- ❌ No referential integrity
- ❌ Can't have group-specific metadata
- ❌ Typo-prone (no validation)
- ❌ Limited hierarchy support
- ❌ Only one group per client (unless you use JSON array)

---

## My Recommendation

**Go with Option 1 (Self-Referential)** because:
1. It's the most flexible and scalable
2. Aligns with standard CRM practices
3. Supports future features (multi-level hierarchies, group analytics)
4. Clean data model with proper relationships
5. Works seamlessly with existing Client/Lead structure

Start simple, then add advanced features as needed. You can begin with just the `parentGroupId` field and basic UI, then enhance with aggregated views and group management later.

---

## Next Steps

1. **Review this recommendation** - Does this approach fit your needs?
2. **Decide on scope** - Full implementation or start with basic grouping?
3. **Plan the migration** - Create migration script if you have existing data to organize
4. **Design UI mockups** - How should groups appear in the interface?
5. **Implementation** - Start with schema changes, then API, then UI

Would you like me to proceed with implementing Option 1, or do you prefer a different approach?

