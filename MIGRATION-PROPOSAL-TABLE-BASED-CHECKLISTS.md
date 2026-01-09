# Migration Proposal: Table-Based Structure for Checklists

## Current State
Both `documentSections` and `weeklyFMSReviewSections` are stored as JSON strings in TEXT fields:
- `documentSections String @default("[]")`
- `weeklyFMSReviewSections String @default("[]")`

## Proposed Schema

### 1. Document Collection Sections

```prisma
model DocumentSection {
  id          String   @id @default(cuid())
  projectId   String
  year        Int      // Year this section belongs to (e.g., 2024, 2025)
  name        String
  description String   @default("")
  order       Int      @default(0) // For sorting sections
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  project     Project  @relation("DocumentSections", fields: [projectId], references: [id], onDelete: Cascade)
  documents   DocumentItem[]
  
  @@index([projectId])
  @@index([projectId, year])
  @@index([order])
}

model DocumentItem {
  id          String   @id @default(cuid())
  sectionId   String
  name        String
  description String   @default("")
  required    Boolean  @default(false)
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  section     DocumentSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  statuses    DocumentItemStatus[]
  comments    DocumentItemComment[]
  
  @@index([sectionId])
  @@index([order])
}

model DocumentItemStatus {
  id          String   @id @default(cuid())
  itemId      String
  year        Int      // Year (e.g., 2024)
  month       Int      // Month (1-12)
  status      String   @default("pending") // pending, collected, not_applicable, etc.
  updatedBy   String?  // User ID
  updatedAt   DateTime @default(now())
  
  item        DocumentItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  @@unique([itemId, year, month])
  @@index([itemId])
  @@index([year, month])
}

model DocumentItemComment {
  id          String   @id @default(cuid())
  itemId      String
  year        Int
  month       Int
  text        String
  authorId    String?
  author      String   // Denormalized author name
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  item        DocumentItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  authorUser  User?        @relation("DocumentCommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  
  @@index([itemId])
  @@index([itemId, year, month])
  @@index([createdAt])
}
```

### 2. Weekly FMS Review Sections

```prisma
model WeeklyFMSReviewSection {
  id          String   @id @default(cuid())
  projectId   String
  year        Int      // Year (e.g., 2024)
  name        String
  description String   @default("")
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  project     Project  @relation("WeeklyFMSReviewSections", fields: [projectId], references: [id], onDelete: Cascade)
  items       WeeklyFMSReviewItem[]
  
  @@index([projectId])
  @@index([projectId, year])
  @@index([order])
}

model WeeklyFMSReviewItem {
  id          String   @id @default(cuid())
  sectionId   String
  name        String
  description String   @default("")
  required    Boolean  @default(false)
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  section     WeeklyFMSReviewSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  statuses    WeeklyFMSReviewItemStatus[]
  comments    WeeklyFMSReviewItemComment[]
  
  @@index([sectionId])
  @@index([order])
}

model WeeklyFMSReviewItemStatus {
  id          String   @id @default(cuid())
  itemId      String
  year        Int      // Year (e.g., 2024)
  month       Int      // Month (1-12)
  week        Int      // Week number (1-5)
  status      String   @default("pending") // pending, completed, not_applicable, etc.
  updatedBy   String?  // User ID
  updatedAt   DateTime @default(now())
  
  item        WeeklyFMSReviewItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  @@unique([itemId, year, month, week])
  @@index([itemId])
  @@index([year, month, week])
}

model WeeklyFMSReviewItemComment {
  id          String   @id @default(cuid())
  itemId      String
  year        Int
  month       Int
  week        Int
  text        String
  authorId    String?
  author      String   // Denormalized author name
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  item        WeeklyFMSReviewItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  authorUser  User?               @relation("WeeklyFMSCommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  
  @@index([itemId])
  @@index([itemId, year, month, week])
  @@index([createdAt])
}
```

### 3. Update Project Model

```prisma
model Project {
  // ... existing fields ...
  
  // Remove these JSON fields:
  // documentSections             String      @default("[]")
  // weeklyFMSReviewSections      String      @default("[]")
  
  // Add relations:
  documentSections        DocumentSection[]           @relation("DocumentSections")
  weeklyFMSReviewSections  WeeklyFMSReviewSection[]    @relation("WeeklyFMSReviewSections")
  
  // Keep these flags:
  hasDocumentCollectionProcess Boolean @default(false)
  hasWeeklyFMSReviewProcess    Boolean @default(false)
}
```

## Benefits

1. **Queryability**: Query specific items, statuses, or comments without parsing JSON
2. **Performance**: Indexes on year, month, week, projectId for fast queries
3. **Data Integrity**: Foreign keys ensure referential integrity
4. **Scalability**: Better performance as data grows
5. **Reporting**: Easy to generate reports on completion rates, trends, etc.
6. **Relationships**: Proper relations to Users, Projects, etc.

## Migration Strategy

### Phase 1: Add New Tables (Non-Breaking)
1. Create new tables alongside existing JSON fields
2. Keep both systems running in parallel
3. Write to both during transition period

### Phase 2: Data Migration
1. Create migration script to convert JSON → tables
2. Validate migrated data
3. Run in batches for large datasets

### Phase 3: Update Application Code
1. Update API endpoints to use new tables
2. Update frontend components
3. Add backward compatibility layer if needed

### Phase 4: Remove JSON Fields
1. After validation period, remove JSON fields from schema
2. Remove migration/backward compatibility code

## Example Migration Script

```javascript
// Migrate documentSections from JSON to tables
async function migrateDocumentSections() {
  const projects = await prisma.project.findMany({
    where: {
      documentSections: { not: '[]' }
    }
  });
  
  for (const project of projects) {
    try {
      const sections = JSON.parse(project.documentSections || '[]');
      
      // Handle year-based structure: { "2024": [...], "2025": [...] }
      if (typeof sections === 'object' && !Array.isArray(sections)) {
        for (const [yearStr, yearSections] of Object.entries(sections)) {
          const year = parseInt(yearStr, 10);
          if (isNaN(year)) continue;
          
          for (let i = 0; i < yearSections.length; i++) {
            const section = yearSections[i];
            const dbSection = await prisma.documentSection.create({
              data: {
                projectId: project.id,
                year: year,
                name: section.name || '',
                description: section.description || '',
                order: i,
                documents: {
                  create: (section.documents || []).map((doc, docIdx) => ({
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx,
                    statuses: {
                      create: Object.entries(doc.collectionStatus || {}).map(([key, status]) => {
                        const [year, month] = key.split('-').map(Number);
                        return {
                          year,
                          month,
                          status: status || 'pending'
                        };
                      })
                    },
                    comments: {
                      create: Object.entries(doc.comments || {}).flatMap(([key, commentArray]) => {
                        const [year, month] = key.split('-').map(Number);
                        return (Array.isArray(commentArray) ? commentArray : []).map(comment => ({
                          year,
                          month,
                          text: comment.text || comment || '',
                          author: comment.author || comment.authorName || '',
                          authorId: comment.authorId || null
                        }));
                      })
                    }
                  }))
                }
              }
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to migrate project ${project.id}:`, error);
    }
  }
}
```

## Considerations

1. **Backward Compatibility**: Keep reading from JSON during transition
2. **Performance**: Batch operations for large datasets
3. **Data Validation**: Validate migrated data matches original
4. **Rollback Plan**: Keep JSON fields until migration is verified
5. **Testing**: Test with sample data before full migration

