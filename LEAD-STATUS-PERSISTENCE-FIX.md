# Lead Status Persistence Fix - Complete Guide

## Understanding the Architecture

**IMPORTANT:** This system uses a **single `Client` table** for both clients and leads. They are differentiated by the `type` field:
- `type = 'client'` → Regular clients
- `type = 'lead'` → Leads/prospects

This is a common and efficient database design pattern.

## The Problem

When changing a lead's status or stage:
1. ✅ Changes were being saved to the database
2. ✅ Database has the correct schema with `stage` field
3. ❌ On refresh, changes would disappear
4. ❌ Leads under different tabs would lose all data

## Root Causes Identified

### 1. **Missing Stage in Create Operation**
The `stage` field was in the schema and update operations, but **not included** when creating new leads via API.

### 2. **Race Condition on Save**
- LeadDetailModal auto-saves changes
- Parent component (Clients.jsx) refetches from database
- LiveDataSync also refetches periodically
- These operations could overwrite each other

### 3. **Stale State After Refresh**
- Local state updates immediately
- Database update happens async
- Hard refresh before DB commit = data loss

## Changes Made

### 1. **API Layer** (`api/leads.js`)

**Added stage to create:**
```javascript
const leadData = {
  name: String(body.name).trim(),
  type: 'lead',
  industry: String(body.industry || 'Other').trim(),
  status: String(body.status || 'Potential').trim(),
  stage: String(body.stage || 'Awareness').trim(),  // ← ADDED THIS
  revenue: (() => { ... })(),
  ...
}
```

**Enhanced update logging:**
```javascript
console.log('🔍 Update data contains status:', updateData.status)
console.log('🔍 Update data contains stage:', updateData.stage)
// ... perform update
console.log('✅ Updated lead status:', lead.status)
console.log('✅ Updated lead stage:', lead.stage)
```

**Fixed WHERE clause:**
```javascript
// BEFORE: This was wrong (can't filter by 'type' in WHERE for update)
const lead = await prisma.client.update({ 
  where: { id, type: 'lead' }, 
  data: updateData 
})

// AFTER: Correct - just use id
const lead = await prisma.client.update({ 
  where: { id }, 
  data: updateData 
})
```

### 2. **Frontend** (`Clients.jsx`)

**Explicit field preservation:**
```javascript
const handleSaveLead = async (leadFormData) => {
  if (selectedLead) {
    // Explicitly preserve critical fields
    const updatedLead = { 
      ...selectedLead, 
      ...leadFormData,
      // CRITICAL: Ensure these don't get lost
      status: leadFormData.status,
      stage: leadFormData.stage
    };
    
    // Update local state immediately
    const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
    setLeads(updatedLeads);
    setSelectedLead(updatedLead);
    
    // Save to database
    await window.api.updateLead(updatedLead.id, updatedLead);
    
    // Refresh from database after save completes
    setTimeout(() => {
      loadLeads();
    }, 500);
  }
}
```

### 3. **Database Verification Scripts**

Created three helper scripts:

**`verify-schema.sql`** - SQL-based verification:
```bash
sqlite3 prisma/dev.db < verify-schema.sql
```

**`verify-db.js`** - Node.js verification (recommended):
```bash
node verify-db.js
```

**`ensure-stage-field.sql`** - Fix NULL/empty stages:
```bash
sqlite3 prisma/dev.db < ensure-stage-field.sql
```

## Testing Procedure

### Step 1: Verify Database Schema

Run the verification script:
```bash
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular
node verify-db.js
```

Expected output:
```
=== DATABASE VERIFICATION ===

📋 Client Table Schema:
✅ STAGE field exists
   Type: TEXT
   Default: 'Awareness'

📊 Data Counts:
   Clients: X
   Leads: Y
   Leads without stage: 0

✅ Verification complete!
```

If you see "Leads without stage: N" where N > 0:
```bash
sqlite3 prisma/dev.db < ensure-stage-field.sql
```

### Step 2: Test Status Changes

1. Start the application
2. Navigate to Clients → Leads tab
3. Open a lead in detail view
4. Change status: Potential → Active
5. Open browser DevTools Console
6. Look for these logs:
```
=== SAVE LEAD DEBUG ===
Lead status from form: Active
🔄 Updated lead object: {status: "Active", ...}
🌐 Calling API to update lead: ...
✅ Lead updated in database
```
7. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
8. ✅ Verify status is still "Active"

### Step 3: Test Stage Changes

1. Open a lead in detail view
2. Change stage: Awareness → Interest
3. Check console for similar logs
4. Hard refresh
5. ✅ Verify stage is still "Interest"

### Step 4: Test Pipeline View

1. Go to Pipeline view
2. Drag a lead from "Awareness" to "Interest" column
3. Check console logs
4. Hard refresh
5. ✅ Verify lead is still in "Interest" column

### Step 5: Test Multiple Tabs

1. Open a lead in "Potential" status
2. Add some contacts
3. Switch to "Calendar" tab
4. Hard refresh
5. ✅ Verify all contacts are still there
6. ✅ Verify lead is still in "Potential" status

## Server-Side Verification

If you're running the server locally, check terminal logs:

```bash
npm run dev
```

Look for:
```
🔍 Updating lead with data: {...}
🔍 Update data contains status: Active
🔍 Update data contains stage: Interest
✅ Lead updated successfully: clxxxxxx
✅ Updated lead status: Active
✅ Updated lead stage: Interest
```

## Database Schema Reference

### Client Table (holds both clients and leads)

```sql
CREATE TABLE "Client" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,              -- 'client' or 'lead'
    "industry" TEXT DEFAULT 'Other',
    "status" TEXT DEFAULT 'active',    -- For leads: 'Potential', 'Active', 'Disinterested'
    "stage" TEXT DEFAULT 'Awareness',  -- AIDIA stage for leads
    "revenue" REAL DEFAULT 0,
    "value" REAL DEFAULT 0,
    "probability" INTEGER DEFAULT 0,
    "lastContact" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT DEFAULT '',
    "website" TEXT DEFAULT '',
    "notes" TEXT DEFAULT '',
    "contacts" TEXT DEFAULT '[]',      -- JSON array
    "followUps" TEXT DEFAULT '[]',     -- JSON array
    "projectIds" TEXT DEFAULT '[]',    -- JSON array
    "comments" TEXT DEFAULT '[]',      -- JSON array
    "sites" TEXT DEFAULT '[]',         -- JSON array
    "contracts" TEXT DEFAULT '[]',     -- JSON array
    "activityLog" TEXT DEFAULT '[]',   -- JSON array
    "billingTerms" TEXT DEFAULT '{}',  -- JSON object
    "ownerId" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
);
```

### Status Values (for leads)
- **Potential** - New lead, initial contact
- **Active** - Currently engaging
- **Disinterested** - Not interested, archived

### Stage Values (AIDIA Framework)
- **Awareness** - Lead knows about company
- **Interest** - Lead shows engagement
- **Desire** - Lead wants solution  
- **Action** - Ready to purchase
- **Closed Won** - Successfully converted
- **Closed Lost** - Opportunity lost

## Common Issues & Solutions

### Issue: "Leads without stage: N"
**Solution:**
```bash
sqlite3 prisma/dev.db < ensure-stage-field.sql
```

### Issue: Status changes but then reverts
**Cause:** Race condition between saves  
**Solution:** Changes already implemented - refresh from DB after save

### Issue: Database schema outdated
**Solution:**
```bash
npx prisma migrate dev
```

### Issue: "Cannot find module better-sqlite3"
**Solution:**
```bash
npm install better-sqlite3
```

## Files Modified

1. **`api/leads.js`**
   - Added `stage` to create operation
   - Enhanced logging throughout
   - Fixed WHERE clause in update

2. **`src/components/clients/Clients.jsx`**
   - Explicit field preservation in `handleSaveLead`
   - Added database refresh after save
   - Enhanced logging

## New Files Created

1. **`verify-schema.sql`** - SQL verification
2. **`verify-db.js`** - Node.js verification (recommended)
3. **`ensure-stage-field.sql`** - Fix NULL stages
4. **`check-lead-status.sh`** - Bash quick check
5. **`LEAD-STATUS-PERSISTENCE-FIX.md`** - This file

## Success Criteria

✅ Status changes persist after hard refresh  
✅ Stage changes persist after hard refresh  
✅ Pipeline drag-and-drop persists  
✅ All lead data persists across tab switches  
✅ No console errors  
✅ Database contains correct values  
✅ Comprehensive logging shows successful saves  

## Rollback

If issues occur:
```bash
git checkout HEAD -- api/leads.js
git checkout HEAD -- src/components/clients/Clients.jsx
```

## Next Steps

1. Run `node verify-db.js` to check current state
2. Test status/stage changes
3. Verify persistence with hard refresh
4. Check console and server logs
5. Report any issues with log output

---

**Key Insight:** The system correctly uses a single `Client` table with a `type` discriminator. This is efficient and follows database normalization principles. The issue was not the schema design, but the handling of async updates and state management.
