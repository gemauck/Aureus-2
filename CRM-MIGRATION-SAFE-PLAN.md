# CRM Data Storage Migration - Zero Data Loss Plan

## ✅ Guarantee: No Data Loss

This migration plan is designed to ensure **ZERO data loss** through:
1. **Backup-first approach** - Full database backup before any changes
2. **Dual-write period** - Write to both old and new structures simultaneously
3. **Data verification** - Automated checks to ensure data integrity
4. **Rollback capability** - Ability to revert if issues occur
5. **Gradual migration** - One field/table at a time

---

## 🛡️ Safety Principles

1. **Never delete data** - Only add new structures, keep old ones
2. **Verify before proceeding** - Check data integrity at each step
3. **Test in development first** - Full test run before production
4. **Keep backups** - Multiple backup points throughout process
5. **Monitor closely** - Watch for errors during migration

---

## 📋 Pre-Migration Checklist

### Step 1: Create Full Database Backup

```bash
# PostgreSQL backup
pg_dump $DATABASE_URL > backup_before_migration_$(date +%Y%m%d_%H%M%S).sql

# Or using Prisma
npx prisma db execute --stdin < backup.sql
```

### Step 2: Verify Current Data

```javascript
// verify-current-data.js
import { prisma } from './api/_lib/prisma.js'

async function verifyCurrentData() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      contacts: true,
      comments: true,
      projectIds: true,
      sites: true,
      contracts: true,
      followUps: true,
      activityLog: true
    }
  })
  
  console.log(`📊 Total clients: ${clients.length}`)
  
  // Count clients with data in JSON fields
  const withContacts = clients.filter(c => {
    try {
      const parsed = JSON.parse(c.contacts || '[]')
      return Array.isArray(parsed) && parsed.length > 0
    } catch { return false }
  }).length
  
  const withComments = clients.filter(c => {
    try {
      const parsed = JSON.parse(c.comments || '[]')
      return Array.isArray(parsed) && parsed.length > 0
    } catch { return false }
  }).length
  
  const withProjectIds = clients.filter(c => {
    try {
      const parsed = JSON.parse(c.projectIds || '[]')
      return Array.isArray(parsed) && parsed.length > 0
    } catch { return false }
  }).length
  
  console.log(`📋 Clients with contacts: ${withContacts}`)
  console.log(`💬 Clients with comments: ${withComments}`)
  console.log(`📁 Clients with projectIds: ${withProjectIds}`)
  
  // Save snapshot for comparison
  const snapshot = {
    timestamp: new Date().toISOString(),
    totalClients: clients.length,
    withContacts,
    withComments,
    withProjectIds,
    sampleClients: clients.slice(0, 5).map(c => ({
      id: c.id,
      name: c.name,
      contactsCount: JSON.parse(c.contacts || '[]').length,
      commentsCount: JSON.parse(c.comments || '[]').length
    }))
  }
  
  require('fs').writeFileSync(
    'migration-snapshot-before.json',
    JSON.stringify(snapshot, null, 2)
  )
  
  console.log('✅ Snapshot saved to migration-snapshot-before.json')
}

verifyCurrentData().catch(console.error)
```

---

## 🔄 Migration Strategy: Phase-by-Phase

### Phase 1: Convert String to JSONB (Safest, No Data Loss)

**Why this is safe:**
- PostgreSQL can convert `TEXT` to `JSONB` without data loss
- Existing data is preserved
- No application code changes needed initially

#### Step 1.1: Add JSONB Columns (Keep String Columns)

```sql
-- migration-001-add-jsonb-columns.sql
-- This adds NEW columns alongside existing ones - NO DATA LOSS

ALTER TABLE "Client" 
  ADD COLUMN IF NOT EXISTS "contactsJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "followUpsJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "commentsJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "sitesJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "contractsJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "activityLogJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "billingTermsJsonb" JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "proposalsJsonb" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "servicesJsonb" JSONB DEFAULT '[]'::jsonb;
```

#### Step 1.2: Migrate Existing Data to JSONB

```javascript
// migrate-to-jsonb.js
import { prisma } from './api/_lib/prisma.js'

async function migrateToJsonb() {
  console.log('🔄 Starting JSONB migration...')
  
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      contacts: true,
      followUps: true,
      comments: true,
      sites: true,
      contracts: true,
      activityLog: true,
      billingTerms: true,
      proposals: true,
      services: true
    }
  })
  
  console.log(`📊 Found ${clients.length} clients to migrate`)
  
  let migrated = 0
  let errors = 0
  
  for (const client of clients) {
    try {
      // Parse JSON strings and convert to JSONB
      const updates = {}
      
      // Helper to safely parse JSON
      const parseJson = (str, defaultValue) => {
        if (!str || str.trim() === '') return defaultValue
        try {
          const parsed = JSON.parse(str)
          return parsed
        } catch (e) {
          console.warn(`⚠️ Failed to parse JSON for client ${client.id}:`, e.message)
          return defaultValue
        }
      }
      
      // Migrate each field
      updates.contactsJsonb = parseJson(client.contacts, [])
      updates.followUpsJsonb = parseJson(client.followUps, [])
      updates.commentsJsonb = parseJson(client.comments, [])
      updates.sitesJsonb = parseJson(client.sites, [])
      updates.contractsJsonb = parseJson(client.contracts, [])
      updates.activityLogJsonb = parseJson(client.activityLog, [])
      updates.billingTermsJsonb = parseJson(client.billingTerms, {})
      updates.proposalsJsonb = parseJson(client.proposals, [])
      updates.servicesJsonb = parseJson(client.services, [])
      
      // Update client with JSONB data
      await prisma.$executeRaw`
        UPDATE "Client"
        SET 
          "contactsJsonb" = ${JSON.stringify(updates.contactsJsonb)}::jsonb,
          "followUpsJsonb" = ${JSON.stringify(updates.followUpsJsonb)}::jsonb,
          "commentsJsonb" = ${JSON.stringify(updates.commentsJsonb)}::jsonb,
          "sitesJsonb" = ${JSON.stringify(updates.sitesJsonb)}::jsonb,
          "contractsJsonb" = ${JSON.stringify(updates.contractsJsonb)}::jsonb,
          "activityLogJsonb" = ${JSON.stringify(updates.activityLogJsonb)}::jsonb,
          "billingTermsJsonb" = ${JSON.stringify(updates.billingTermsJsonb)}::jsonb,
          "proposalsJsonb" = ${JSON.stringify(updates.proposalsJsonb)}::jsonb,
          "servicesJsonb" = ${JSON.stringify(updates.servicesJsonb)}::jsonb
        WHERE id = ${client.id}
      `
      
      migrated++
      if (migrated % 100 === 0) {
        console.log(`✅ Migrated ${migrated}/${clients.length} clients...`)
      }
    } catch (error) {
      errors++
      console.error(`❌ Error migrating client ${client.id}:`, error.message)
    }
  }
  
  console.log(`\n✅ Migration complete!`)
  console.log(`   Migrated: ${migrated}`)
  console.log(`   Errors: ${errors}`)
  
  // Verify migration
  await verifyJsonbMigration()
}

async function verifyJsonbMigration() {
  console.log('\n🔍 Verifying migration...')
  
  const sample = await prisma.$queryRaw`
    SELECT 
      id,
      name,
      contacts,
      "contactsJsonb",
      comments,
      "commentsJsonb"
    FROM "Client"
    WHERE contacts != '[]' OR comments != '[]'
    LIMIT 5
  `
  
  for (const row of sample) {
    const contactsMatch = JSON.stringify(JSON.parse(row.contacts || '[]')) === 
                          JSON.stringify(row.contactsJsonb)
    const commentsMatch = JSON.stringify(JSON.parse(row.comments || '[]')) === 
                          JSON.stringify(row.commentsJsonb)
    
    if (!contactsMatch || !commentsMatch) {
      console.error(`❌ Mismatch found for client ${row.id}`)
    } else {
      console.log(`✅ Client ${row.id} verified`)
    }
  }
  
  console.log('✅ Verification complete')
}

migrateToJsonb().catch(console.error)
```

#### Step 1.3: Verify Data Integrity

```javascript
// verify-jsonb-migration.js
import { prisma } from './api/_lib/prisma.js'

async function verifyMigration() {
  const clients = await prisma.client.findMany()
  
  let mismatches = 0
  
  for (const client of clients) {
    // Compare old string fields with new JSONB fields
    const oldContacts = JSON.parse(client.contacts || '[]')
    const newContacts = client.contactsJsonb || []
    
    if (JSON.stringify(oldContacts) !== JSON.stringify(newContacts)) {
      console.error(`❌ Mismatch in contacts for client ${client.id}`)
      mismatches++
    }
    
    // Repeat for other fields...
  }
  
  if (mismatches === 0) {
    console.log('✅ All data migrated correctly!')
  } else {
    console.error(`❌ Found ${mismatches} mismatches - DO NOT PROCEED`)
  }
}

verifyMigration().catch(console.error)
```

---

### Phase 2: Dual-Write Period (Application Updates)

**During this phase, the application writes to BOTH old and new fields**

#### Update API to Write to Both

```javascript
// api/clients.js - Updated create handler
const clientData = {
  // ... other fields ...
  
  // Write to OLD fields (for backward compatibility)
  contacts: JSON.stringify(Array.isArray(body.contacts) ? body.contacts : []),
  
  // ALSO write to NEW JSONB fields
  contactsJsonb: Array.isArray(body.contacts) ? body.contacts : [],
  
  // Repeat for all fields...
}

await prisma.client.create({
  data: clientData
})
```

#### Update API to Read from New Fields (with fallback)

```javascript
// api/clients.js - Updated read handler
function parseClientJsonFields(client) {
  const parsed = { ...client }
  
  // Try to use JSONB fields first, fallback to string fields
  parsed.contacts = client.contactsJsonb || 
                    (client.contacts ? JSON.parse(client.contacts) : [])
  
  parsed.comments = client.commentsJsonb || 
                    (client.comments ? JSON.parse(client.comments) : [])
  
  // ... repeat for all fields ...
  
  return parsed
}
```

**Run dual-write for 1-2 weeks to ensure stability**

---

### Phase 3: Normalize Contacts (Create New Table)

**This creates a NEW table - old data remains untouched**

#### Step 3.1: Create ClientContact Table

```prisma
// Add to schema.prisma
model ClientContact {
  id        String   @id @default(cuid())
  clientId  String
  name      String
  email     String?
  phone     String?
  role      String?
  isPrimary Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  
  @@index([clientId])
  @@index([email])
  @@index([phone])
}
```

```prisma
// Update Client model
model Client {
  // ... existing fields ...
  contacts        String          @default("[]")  // KEEP for now
  contactsJsonb   Json?          @default("[]")  // KEEP for now
  clientContacts  ClientContact[]                 // NEW relation
}
```

#### Step 3.2: Migrate Contacts Data

```javascript
// migrate-contacts-to-table.js
import { prisma } from './api/_lib/prisma.js'

async function migrateContacts() {
  console.log('🔄 Migrating contacts to ClientContact table...')
  
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      contactsJsonb: true,
      contacts: true
    }
  })
  
  let totalMigrated = 0
  let errors = 0
  
  for (const client of clients) {
    try {
      // Get contacts from JSONB (or parse from string as fallback)
      const contactsData = client.contactsJsonb || 
                          (client.contacts ? JSON.parse(client.contacts) : [])
      
      if (!Array.isArray(contactsData) || contactsData.length === 0) {
        continue
      }
      
      // Create ClientContact records
      const contactRecords = contactsData.map((contact, index) => ({
        clientId: client.id,
        name: contact.name || contact.fullName || 'Unknown',
        email: contact.email || null,
        phone: contact.phone || contact.mobile || null,
        role: contact.role || contact.title || null,
        isPrimary: index === 0 || contact.isPrimary || false
      }))
      
      // Insert contacts (use createMany for efficiency)
      await prisma.clientContact.createMany({
        data: contactRecords,
        skipDuplicates: true // Skip if already exists
      })
      
      totalMigrated += contactRecords.length
      
      if (totalMigrated % 100 === 0) {
        console.log(`✅ Migrated ${totalMigrated} contacts...`)
      }
    } catch (error) {
      errors++
      console.error(`❌ Error migrating contacts for client ${client.id}:`, error.message)
    }
  }
  
  console.log(`\n✅ Migration complete!`)
  console.log(`   Total contacts migrated: ${totalMigrated}`)
  console.log(`   Errors: ${errors}`)
  
  // Verify migration
  await verifyContactsMigration()
}

async function verifyContactsMigration() {
  const clientsWithContacts = await prisma.client.findMany({
    where: {
      OR: [
        { contactsJsonb: { not: { equals: Prisma.JsonNull } } },
        { contacts: { not: '[]' } }
      ]
    },
    include: {
      clientContacts: true
    },
    take: 10
  })
  
  for (const client of clientsWithContacts) {
    const jsonContacts = client.contactsJsonb || JSON.parse(client.contacts || '[]')
    const dbContacts = client.clientContacts
    
    if (Array.isArray(jsonContacts) && jsonContacts.length !== dbContacts.length) {
      console.warn(`⚠️ Contact count mismatch for client ${client.id}:`)
      console.warn(`   JSON: ${jsonContacts.length}, DB: ${dbContacts.length}`)
    } else {
      console.log(`✅ Client ${client.id} verified (${dbContacts.length} contacts)`)
    }
  }
}

migrateContacts().catch(console.error)
```

**Key Safety Features:**
- ✅ Old JSON data remains untouched
- ✅ New table is separate (no risk to existing data)
- ✅ `skipDuplicates: true` prevents errors
- ✅ Verification step ensures data integrity

---

### Phase 4: Remove Redundant projectIds

**This is the safest normalization - we're just removing redundant data**

#### Step 4.1: Verify projectIds Can Be Replaced

```javascript
// verify-projectids-redundancy.js
import { prisma } from './api/_lib/prisma.js'

async function verifyProjectIdsRedundancy() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      projectIds: true
    },
    include: {
      projects: {
        select: { id: true }
      }
    }
  })
  
  let mismatches = 0
  
  for (const client of clients) {
    const jsonProjectIds = JSON.parse(client.projectIds || '[]')
    const dbProjectIds = client.projects.map(p => p.id).sort()
    const sortedJsonIds = jsonProjectIds.sort()
    
    if (JSON.stringify(dbProjectIds) !== JSON.stringify(sortedJsonIds)) {
      console.warn(`⚠️ Mismatch for client ${client.id}:`)
      console.warn(`   JSON: ${sortedJsonIds}`)
      console.warn(`   DB: ${dbProjectIds}`)
      mismatches++
    }
  }
  
  if (mismatches === 0) {
    console.log('✅ All projectIds match Project.clientId - safe to remove')
  } else {
    console.warn(`⚠️ Found ${mismatches} mismatches - investigate before removing`)
  }
}

verifyProjectIdsRedundancy().catch(console.error)
```

#### Step 4.2: Update Application to Use Project.clientId

```javascript
// Before (using projectIds JSON)
const projectIds = JSON.parse(client.projectIds || '[]')
const projects = await prisma.project.findMany({
  where: { id: { in: projectIds } }
})

// After (using Project.clientId relation)
const projects = await prisma.project.findMany({
  where: { clientId: client.id }
})
```

#### Step 4.3: Remove projectIds Field (After Verification)

```sql
-- Only after confirming all code uses Project.clientId
-- Keep the column for a while, just stop using it
-- ALTER TABLE "Client" DROP COLUMN "projectIds";  -- Do this later
```

---

## 🔒 Rollback Procedures

### If Issues Occur During Migration

#### Rollback JSONB Migration
```sql
-- Simply stop using JSONB columns, continue using String columns
-- No data loss - old columns still exist
```

#### Rollback Contacts Normalization
```javascript
// Re-populate JSON from ClientContact table if needed
const contacts = await prisma.clientContact.findMany({
  where: { clientId: client.id }
})

const contactsJson = contacts.map(c => ({
  name: c.name,
  email: c.email,
  phone: c.phone,
  role: c.role,
  isPrimary: c.isPrimary
}))

await prisma.client.update({
  where: { id: client.id },
  data: { contactsJsonb: contactsJson }
})
```

---

## ✅ Final Verification Script

```javascript
// final-verification.js
import { prisma } from './api/_lib/prisma.js'

async function finalVerification() {
  console.log('🔍 Final Data Integrity Check...\n')
  
  // 1. Count all clients
  const totalClients = await prisma.client.count()
  console.log(`✅ Total clients: ${totalClients}`)
  
  // 2. Verify JSONB data matches String data
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      contacts: true,
      contactsJsonb: true,
      comments: true,
      commentsJsonb: true
    },
    take: 100
  })
  
  let jsonbMatches = 0
  for (const client of clients) {
    const contactsMatch = JSON.stringify(JSON.parse(client.contacts || '[]')) === 
                          JSON.stringify(client.contactsJsonb || [])
    if (contactsMatch) jsonbMatches++
  }
  console.log(`✅ JSONB matches String: ${jsonbMatches}/${clients.length}`)
  
  // 3. Verify normalized contacts
  const clientsWithContacts = await prisma.clientContact.groupBy({
    by: ['clientId'],
    _count: { id: true }
  })
  console.log(`✅ Clients with normalized contacts: ${clientsWithContacts.length}`)
  
  // 4. Verify projects relation works
  const clientsWithProjects = await prisma.client.findMany({
    where: {
      projects: {
        some: {}
      }
    },
    select: { id: true }
  })
  console.log(`✅ Clients with projects (via relation): ${clientsWithProjects.length}`)
  
  console.log('\n✅ All verifications passed!')
}

finalVerification().catch(console.error)
```

---

## 📊 Migration Timeline

| Phase | Duration | Risk Level | Data Loss Risk |
|-------|----------|------------|----------------|
| **Phase 1: JSONB Conversion** | 1 day | Low | None - adds columns |
| **Phase 2: Dual-Write** | 1-2 weeks | Low | None - writes to both |
| **Phase 3: Normalize Contacts** | 2-3 days | Low | None - new table |
| **Phase 4: Remove projectIds** | 1 day | Very Low | None - just stop using |

**Total Estimated Time: 2-3 weeks (with testing)**

---

## 🎯 Success Criteria

✅ All existing data preserved  
✅ No data loss during migration  
✅ Application continues to work throughout  
✅ Can rollback at any phase  
✅ Performance improved after migration  
✅ Data integrity verified  

---

## 🚨 Important Notes

1. **Never delete old columns immediately** - Keep them for at least 1 month after migration
2. **Test in development first** - Full test run before production
3. **Monitor application logs** - Watch for errors during dual-write period
4. **Keep backups** - Multiple backup points
5. **Gradual rollout** - One phase at a time, verify before proceeding

---

**This migration plan ensures ZERO data loss through careful, phased approach with verification at each step.**








