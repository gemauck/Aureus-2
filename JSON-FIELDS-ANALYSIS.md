# JSON Fields Analysis - Should They Be Normalized Tables?

## 📊 Summary

After comprehensive analysis, here are all JSON fields in the Client model and whether they should be normalized tables.

---

## ✅ Already Normalized

| Field | Status | Normalized Table | Notes |
|-------|--------|------------------|-------|
| **contacts** | ✅ Normalized | `ClientContact` | Fully migrated, no JSON writes |
| **comments** | ✅ Normalized | `ClientComment` | Fully migrated, no JSON writes |

---

## ❌ Should Be Normalized (Structured Data)

### 1. **sites** - **HIGH PRIORITY** ⚠️

**Current Structure** (from `api/sites.js`):
```javascript
{
  id: "site-123...",
  name: "Site Name",
  address: "123 Street",
  contactPerson: "John Doe",
  contactPhone: "011-123-4567",
  contactEmail: "john@example.com",
  notes: "Notes here"
}
```

**Why Normalize?**:
- ✅ Has dedicated API endpoint (`api/sites.js`) with full CRUD
- ✅ Structured data with multiple fields
- ✅ Currently using inefficient JSON array updates
- ✅ Would enable proper indexing, queries, relationships

**Recommendation**: Create `ClientSite` table

**Schema Suggestion**:
```prisma
model ClientSite {
  id            String   @id @default(cuid())
  clientId      String
  name          String
  address       String   @default("")
  contactPerson String?  @default("")
  contactPhone  String?  @default("")
  contactEmail  String?  @default("")
  notes         String   @default("")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@index([clientId])
  @@index([contactEmail])
}
```

**Priority**: **HIGH** - Already has dedicated API, actively used

---

### 2. **contracts** - **MEDIUM PRIORITY**

**Expected Structure** (needs verification):
```javascript
{
  id: "contract-123...",
  name: "Contract Name",
  type: "Service Agreement",
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  value: 100000,
  status: "Active",
  // ... other fields
}
```

**Why Normalize?**:
- ✅ Contracts are important business entities
- ✅ Would benefit from proper queries, indexing
- ✅ Enable relationships (invoices, renewals, etc.)

**Recommendation**: Create `ClientContract` table

**Priority**: **MEDIUM** - Business critical data, but needs structure verification

---

### 3. **proposals** - **MEDIUM PRIORITY**

**Expected Structure** (needs verification):
```javascript
{
  id: "proposal-123...",
  title: "Proposal Title",
  amount: 50000,
  status: "Pending",
  createdDate: "2024-01-01",
  expiryDate: "2024-02-01",
  // ... other fields
}
```

**Why Normalize?**:
- ✅ Proposals are important sales documents
- ✅ Would enable tracking, reporting, follow-ups
- ✅ Enable relationships (converted to contracts, projects)

**Recommendation**: Create `ClientProposal` table

**Priority**: **MEDIUM** - Important for sales tracking, but needs structure verification

---

### 4. **followUps** - **MEDIUM PRIORITY**

**Expected Structure** (needs verification):
```javascript
{
  id: "followup-123...",
  type: "Call",
  dueDate: "2024-01-15",
  assignedTo: "user-id",
  completed: false,
  notes: "Follow up notes",
  // ... other fields
}
```

**Why Normalize?**:
- ✅ Follow-ups are task-like entities
- ✅ Would enable proper scheduling, reminders
- ✅ Enable relationships (users, notifications)

**Recommendation**: Could use `Task` table with `clientId`, or create `ClientFollowUp` table

**Priority**: **MEDIUM** - Useful for workflow, but might overlap with Task system

---

### 5. **services** - **LOW PRIORITY**

**Expected Structure** (needs verification):
```javascript
{
  id: "service-123...",
  name: "Service Name",
  description: "...",
  price: 1000,
  // ... other fields
}
```

**Why Normalize?**:
- ⚠️ Might be a simple list (like tags)
- ⚠️ May not need full CRUD operations
- ✅ If structured, would benefit from normalization

**Recommendation**: Verify structure first. If simple list, keep as JSON. If structured, create `ClientService` table.

**Priority**: **LOW** - Needs structure verification

---

## ⚠️ Probably Should NOT Be Normalized

### 1. **activityLog** - **KEEP AS JSON**

**Why Keep JSON**:
- ✅ Log data (append-only, historical)
- ✅ Not queried individually
- ✅ High volume, low query frequency
- ✅ Structure may vary per log entry

**Recommendation**: **Keep as JSON** - This is appropriate for log data

---

### 2. **billingTerms** - **KEEP AS JSON (Object)**

**Current Structure**:
```javascript
{
  paymentTerms: "Net 30",
  billingFrequency: "Monthly",
  currency: "ZAR",
  retainerAmount: 0,
  taxExempt: false,
  notes: ""
}
```

**Why Keep JSON**:
- ✅ Single object per client (not array)
- ✅ Simple key-value structure
- ✅ No relationships needed
- ✅ JSONB is appropriate for this

**Recommendation**: **Keep as JSON** - Single object doesn't need normalization

---

### 3. **projectIds** - **DEPRECATED** (Use Project.clientId)

**Status**: Already using `Project.clientId` relation - JSON field is deprecated

**Recommendation**: **Remove eventually** - Already using proper relation

---

## 📋 Action Items by Priority

### Priority 1: Sites (HIGH) ⚠️

**Current Issue**: `api/sites.js` is writing directly to JSON field

**Steps**:
1. Create `ClientSite` table in Prisma schema
2. Create migration
3. Migrate existing sites from JSON to table
4. Update `api/sites.js` to use normalized table
5. Remove JSON writes from `api/sites.js`

**Files to Update**:
- `prisma/schema.prisma` - Add ClientSite model
- `api/sites.js` - Update to use ClientSite table
- `api/clients.js` - Remove sites JSON writes (if any)
- `api/clients/[id].js` - Remove sites JSON writes (if any)

---

### Priority 2: Contracts (MEDIUM)

**Steps**:
1. Verify structure by examining frontend usage
2. Create `ClientContract` table in Prisma schema
3. Create migration
4. Migrate existing contracts
5. Update API endpoints
6. Remove JSON writes

---

### Priority 3: Proposals (MEDIUM)

**Steps**:
1. Verify structure by examining frontend usage
2. Create `ClientProposal` table in Prisma schema
3. Create migration
4. Migrate existing proposals
5. Update API endpoints
6. Remove JSON writes

---

### Priority 4: FollowUps (MEDIUM)

**Steps**:
1. Verify structure and check if Task table can be used instead
2. If separate, create `ClientFollowUp` table
3. Or integrate with existing Task system
4. Migrate and update endpoints

---

### Priority 5: Services (LOW)

**Steps**:
1. Verify structure (might be simple list)
2. If structured, create `ClientService` table
3. If simple list, consider keeping as JSON

---

## 🔍 Verification Needed

To properly assess these fields, we need to check:

1. **Frontend Usage**:
   ```bash
   # Check how these fields are used in frontend
   grep -r "sites\.map\|contracts\.map\|proposals\.map" src/
   grep -r "site\.\|contract\.\|proposal\." src/
   ```

2. **Data Structure**:
   - What fields do sites/contracts/proposals actually have?
   - Are they arrays or single objects?
   - Do they have relationships to other entities?

3. **API Usage**:
   - Are there dedicated API endpoints?
   - How often are they updated?
   - Do they need individual CRUD operations?

---

## 📊 Current Status Summary

| Field | Should Normalize? | Priority | Status |
|-------|------------------|----------|--------|
| contacts | ✅ Yes | DONE | ✅ Normalized |
| comments | ✅ Yes | DONE | ✅ Normalized |
| **sites** | ✅ **Yes** | **HIGH** | ❌ **Needs migration** |
| contracts | ✅ Yes | MEDIUM | ❌ JSON only |
| proposals | ✅ Yes | MEDIUM | ❌ JSON only |
| followUps | ⚠️ Maybe | MEDIUM | ❌ JSON only |
| services | ⚠️ Maybe | LOW | ❌ JSON only |
| activityLog | ❌ No | - | ✅ Keep JSON |
| billingTerms | ❌ No | - | ✅ Keep JSON |
| projectIds | ❌ Deprecated | - | ⚠️ Use relation |

---

## 🎯 Immediate Recommendation

**Start with Sites** - It has:
- ✅ Dedicated API endpoint
- ✅ Clear structure
- ✅ Active usage
- ✅ Would benefit most from normalization

The `api/sites.js` file is currently doing full CRUD operations on JSON arrays, which is inefficient and error-prone. Normalizing this would be a clear win.

