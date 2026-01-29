// Projects API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

/** Run Project table migration at most once per process (perf: avoid ALTER on every list GET). */
let projectListColumnsMigrated = false;

/**
 * Convert DocumentSection table data to JSON format (for backward compatibility)
 */
async function documentSectionsToJson(projectId, options = {}) {
  try {
    const includeComments = !options.skipComments;
    let sections = options.preloadedSections;

    if (!sections || !Array.isArray(sections)) {
      try {
        await prisma.$queryRaw`SELECT 1 FROM "DocumentSection" LIMIT 1`
      } catch (e) {
        return null
      }
      sections = await prisma.documentSection.findMany({
        where: { projectId: projectId },
        include: {
          documents: {
            include: {
              statuses: true,
              ...(includeComments ? { comments: true } : {})
            },
            orderBy: { order: 'asc' }
          }
        },
        orderBy: [{ year: 'desc' }, { order: 'asc' }]
      })
    }

    if (!sections.length) {
      return null // Return null to indicate no table data, use JSON fallback
    }

    // Group by year: { "2024": [...], "2025": [...] }
    const byYear = {}
    for (const section of sections) {
      if (!byYear[section.year]) {
        byYear[section.year] = []
      }

      const sectionData = {
        id: section.id,
        name: section.name,
        description: section.description || '',
        documents: section.documents.map(doc => {
          // Build collectionStatus object: { "2024-01": "collected", ... }
          const collectionStatus = {}
          for (const status of doc.statuses) {
            const key = `${status.year}-${String(status.month).padStart(2, '0')}`
            collectionStatus[key] = status.status
          }

          // Build comments object: { "2024-01": [...], ... }
          const comments = {}
          if (includeComments && doc.comments) {
            for (const comment of doc.comments) {
              const key = `${comment.year}-${String(comment.month).padStart(2, '0')}`
              if (!comments[key]) {
                comments[key] = []
              }
              let attachments = []
              if (comment.attachments) {
                try {
                  attachments = typeof comment.attachments === 'string'
                    ? JSON.parse(comment.attachments || '[]')
                    : (Array.isArray(comment.attachments) ? comment.attachments : [])
                } catch (_) {
                  attachments = []
                }
              }
              comments[key].push({
                id: comment.id,
                text: comment.text,
                author: comment.author,
                authorId: comment.authorId,
                authorName: comment.author,
                createdAt: comment.createdAt,
                date: comment.createdAt,
                attachments
              })
            }
          }

          return {
            id: doc.id,
            name: doc.name,
            description: doc.description || '',
            required: doc.required || false,
            collectionStatus,
            ...(includeComments ? { comments } : { comments: {} })
          }
        })
      }

      byYear[section.year].push(sectionData)
    }

    return byYear
  } catch (error) {
    console.error('Error converting documentSections to JSON:', error)
    return null
  }
}

// JSON conversion functions removed - all data now stored in tables
// Tables are the primary source of truth, no JSON synchronization needed

/**
 * Convert MonthlyFMSReviewSection table data to JSON format (for backward compatibility)
 */
async function monthlyFMSReviewSectionsToJson(projectId, options = {}) {
  try {
    const includeComments = !options.skipComments;
    let sections = options.preloadedSections;
    let jsonFieldData = options.preloadedJsonField ?? null;

    if (!sections || !Array.isArray(sections)) {
      try {
        await prisma.$queryRaw`SELECT 1 FROM "MonthlyFMSReviewSection" LIMIT 1`
      } catch (e) {
        return null
      }
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { monthlyFMSReviewSections: true }
      })
      if (project?.monthlyFMSReviewSections) {
        try {
          jsonFieldData = typeof project.monthlyFMSReviewSections === 'string'
            ? JSON.parse(project.monthlyFMSReviewSections)
            : project.monthlyFMSReviewSections
        } catch (e) {
          console.warn('Failed to parse monthlyFMSReviewSections JSON field:', e)
        }
      }
      sections = await prisma.monthlyFMSReviewSection.findMany({
        where: { projectId },
        include: {
          items: {
            include: {
              statuses: true,
              ...(includeComments ? { comments: true } : {})
            },
            orderBy: { order: 'asc' }
          }
        },
        orderBy: [{ year: 'desc' }, { order: 'asc' }]
      })
    }

    // If table is empty but JSON field has data, return JSON field data for recovery
    if (sections.length === 0) {
      if (jsonFieldData && typeof jsonFieldData === 'object' && Object.keys(jsonFieldData).length > 0) {
        console.log('📊 monthlyFMSReviewSectionsToJson: Table empty, returning JSON field data for recovery');
        return jsonFieldData;
      }
      return null // Return null to indicate no table data, use JSON fallback
    }

    // Group by year: { "2024": [...], "2025": [...] }
    const byYear = {}
    for (const section of sections) {
      if (!byYear[section.year]) {
        byYear[section.year] = []
      }

      const sectionData = {
        id: section.id,
        name: section.name,
        description: section.description || '',
        reviewer: section.reviewer || '',
        documents: section.items.map(item => {
          // Build collectionStatus object: { "2024-01": "completed", ... }
          const collectionStatus = {}
          for (const status of item.statuses) {
            const key = `${status.year}-${String(status.month).padStart(2, '0')}`
            collectionStatus[key] = status.status
          }

          // Build comments object: { "2024-01": [...], ... }
          const comments = {}
          if (includeComments && item.comments) {
            for (const comment of item.comments) {
              const key = `${comment.year}-${String(comment.month).padStart(2, '0')}`
              if (!comments[key]) {
                comments[key] = []
              }
              let attachments = []
              if (comment.attachments) {
                try {
                  attachments = typeof comment.attachments === 'string'
                    ? JSON.parse(comment.attachments || '[]')
                    : (Array.isArray(comment.attachments) ? comment.attachments : [])
                } catch (_) {
                  attachments = []
                }
              }
              comments[key].push({
                id: comment.id,
                text: comment.text,
                author: comment.author,
                authorId: comment.authorId,
                authorName: comment.author,
                date: comment.createdAt?.toISOString() || new Date(comment.createdAt).toISOString(),
                createdAt: comment.createdAt,
                attachments
              })
            }
          }

          return {
            id: item.id,
            name: item.name,
            description: item.description || '',
            required: item.required || false,
            collectionStatus,
            ...(includeComments ? { comments } : { comments: {} })
          }
        })
      }

      byYear[section.year].push(sectionData)
    }

    // Merge with JSON field data to recover any missing years/sections
    // This helps recover data that might have been lost during partial saves
    if (jsonFieldData && typeof jsonFieldData === 'object' && !Array.isArray(jsonFieldData)) {
      for (const [yearStr, jsonSections] of Object.entries(jsonFieldData)) {
        const year = parseInt(yearStr, 10);
        if (!isNaN(year) && year >= 1900 && year <= 3000) {
          // If table has no data for this year, use JSON field data
          if (!byYear[year] || byYear[year].length === 0) {
            console.log(`📊 monthlyFMSReviewSectionsToJson: Recovering year ${year} from JSON field`);
            byYear[year] = Array.isArray(jsonSections) ? jsonSections : [];
          } else {
            // Merge: prefer table data but fill in gaps from JSON field
            // This is a safety measure to recover any missing statuses/comments
            console.log(`📊 monthlyFMSReviewSectionsToJson: Merging year ${year} data from table and JSON field`);
          }
        }
      }
    }

    return byYear
  } catch (error) {
    console.error('Error converting monthlyFMSReviewSections to JSON:', error)
    return null
  }
}

/**
 * Convert WeeklyFMSReviewSection to JSON for frontend.
 * Uses the same logic as Monthly FMS / Document Collection: JSON field is source of truth.
 * When project.weeklyFMSReviewSections has data, return it as-is (preserves week keys and comments).
 */
async function weeklyFMSReviewSectionsToJson(projectId) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { weeklyFMSReviewSections: true }
    })
    if (!project?.weeklyFMSReviewSections) return null
    const raw = project.weeklyFMSReviewSections
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      return parsed
    }
    return null
  } catch (e) {
    console.warn('weeklyFMSReviewSectionsToJson:', e)
    return null
  }
}

/**
 * Save documentSections JSON to table structure
 */
async function saveDocumentSectionsToTable(projectId, jsonData) {
  if (!jsonData) {
    console.log('⚠️ saveDocumentSectionsToTable: No jsonData provided, skipping save');
    return;
  }

  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "DocumentSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, skip table save (JSON will still be saved)
      console.warn('⚠️ DocumentSection table does not exist, skipping table save')
      return
    }
    
    let sections = jsonData
    if (typeof jsonData === 'string') {
      try {
        sections = JSON.parse(jsonData)
      } catch (parseError) {
        console.error('❌ Error parsing documentSections JSON string:', parseError);
        throw new Error(`Invalid JSON in documentSections: ${parseError.message}`);
      }
    }

    console.log('💾 saveDocumentSectionsToTable: Starting save', {
      projectId,
      dataType: typeof sections,
      isArray: Array.isArray(sections),
      isObject: typeof sections === 'object' && !Array.isArray(sections),
      keys: typeof sections === 'object' && !Array.isArray(sections) ? Object.keys(sections) : 'N/A',
      arrayLength: Array.isArray(sections) ? sections.length : 'N/A'
    });

    // Delete existing sections for this project
    const deletedCount = await prisma.documentSection.deleteMany({
      where: { projectId }
    });
    console.log(`🗑️ Deleted ${deletedCount.count} existing document sections for project ${projectId}`);

    if (!sections || (typeof sections === 'object' && Object.keys(sections).length === 0)) {
      console.log('⚠️ saveDocumentSectionsToTable: Empty sections data, nothing to save');
      return;
    }

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      let totalSectionsCreated = 0;
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10)
        if (isNaN(year) || year < 1900 || year > 3000) {
          console.warn(`⚠️ Invalid year "${yearStr}", skipping`);
          continue;
        }
        if (!Array.isArray(yearSections)) {
          console.warn(`⚠️ Year ${yearStr} sections is not an array, skipping`);
          continue;
        }

        for (let i = 0; i < yearSections.length; i++) {
          const section = yearSections[i]
          if (!section || !section.name) {
            console.warn(`⚠️ Skipping section at index ${i} in year ${yearStr}: missing name`);
            continue;
          }

          try {
            await prisma.documentSection.create({
              data: {
                projectId,
                year,
                name: section.name || '',
                description: section.description || '',
                order: i,
                documents: {
                  create: (section.documents || []).map((doc, docIdx) => {
                    const statuses = []
                    if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                      for (const [key, status] of Object.entries(doc.collectionStatus)) {
                        const parts = key.split('-')
                        if (parts.length >= 2) {
                          const year = parseInt(parts[0], 10)
                          const month = parseInt(parts[1], 10)
                          if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                            statuses.push({
                              year,
                              month,
                              status: String(status || 'pending')
                            })
                          }
                        }
                      }
                    }

                    const comments = []
                    if (doc.comments && typeof doc.comments === 'object') {
                      for (const [key, commentArray] of Object.entries(doc.comments)) {
                        const parts = key.split('-')
                        if (parts.length >= 2) {
                          const year = parseInt(parts[0], 10)
                          const month = parseInt(parts[1], 10)
                          if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                            const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                            for (const comment of commentList) {
                              if (comment && (comment.text || comment)) {
                                const atts = Array.isArray(comment.attachments) ? comment.attachments : []
                                comments.push({
                                  year,
                                  month,
                                  text: comment.text || String(comment),
                                  author: comment.author || comment.authorName || '',
                                  authorId: comment.authorId || null,
                                  attachments: JSON.stringify(atts)
                                })
                              }
                            }
                          }
                        }
                      }
                    }

                    return {
                      name: doc.name || '',
                      description: doc.description || '',
                      required: doc.required || false,
                      order: docIdx,
                      statuses: { create: statuses },
                      comments: { create: comments }
                    }
                  })
                }
              }
            });
            totalSectionsCreated++;
          } catch (createError) {
            console.error(`❌ Error creating document section "${section.name}" for year ${year}:`, createError);
            throw createError; // Re-throw to be caught by outer catch
          }
        }
      }
      console.log(`✅ saveDocumentSectionsToTable: Successfully saved ${totalSectionsCreated} sections to table`);
    } else if (Array.isArray(sections)) {
      // Handle legacy array format - assign to current year
      const currentYear = new Date().getFullYear();
      console.log(`📅 Legacy array format detected, assigning to year ${currentYear}`);
      let totalSectionsCreated = 0;
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section || !section.name) {
          console.warn(`⚠️ Skipping section at index ${i}: missing name`);
          continue;
        }

        try {
          await prisma.documentSection.create({
            data: {
              projectId,
              year: currentYear,
              name: section.name || '',
              description: section.description || '',
              order: i,
              documents: {
                create: (section.documents || []).map((doc, docIdx) => {
                  const statuses = []
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          statuses.push({
                            year,
                            month,
                            status: String(status || 'pending')
                          })
                        }
                      }
                    }
                  }

                  const comments = []
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              const atts = Array.isArray(comment.attachments) ? comment.attachments : []
                              comments.push({
                                year,
                                month,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null,
                                attachments: JSON.stringify(atts)
                              })
                            }
                          }
                        }
                      }
                    }
                  }

                  return {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx,
                    statuses: { create: statuses },
                    comments: { create: comments }
                  }
                })
              }
            }
          });
          totalSectionsCreated++;
        } catch (createError) {
          console.error(`❌ Error creating document section "${section.name}":`, createError);
          throw createError;
        }
      }
      console.log(`✅ saveDocumentSectionsToTable: Successfully saved ${totalSectionsCreated} sections (legacy format) to table`);
    } else {
      console.error('❌ saveDocumentSectionsToTable: Invalid data format - expected object or array, got:', typeof sections);
      throw new Error(`Invalid sections data format: expected object or array, got ${typeof sections}`);
    }
  } catch (error) {
    console.error('❌ Error saving documentSections to table:', {
      error: error.message,
      stack: error.stack,
      projectId,
      jsonDataType: typeof jsonData
    });
    // Re-throw the error so the caller knows it failed
    throw error;
  }
}

/**
 * Save weeklyFMSReviewSections JSON to table structure.
 * NO-OP: Weekly FMS uses Project.weeklyFMSReviewSections JSON only. Table write disabled
 * to avoid P2022 (missing attachments column) and keep all callers succeeding.
 */
async function saveWeeklyFMSReviewSectionsToTable(projectId, jsonData) {
  return;
  if (!jsonData) {
    console.log('⚠️ saveWeeklyFMSReviewSectionsToTable: No jsonData provided, skipping save');
    return;
  }

  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "WeeklyFMSReviewSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, skip table save (JSON will still be saved)
      console.warn('⚠️ WeeklyFMSReviewSection table does not exist, skipping table save')
      return
    }
    
    let sections = jsonData
    if (typeof jsonData === 'string') {
      try {
        sections = JSON.parse(jsonData)
      } catch (parseError) {
        console.error('❌ Error parsing weeklyFMSReviewSections JSON string:', parseError);
        throw new Error(`Invalid JSON in weeklyFMSReviewSections: ${parseError.message}`);
      }
    }

    console.log('💾 saveWeeklyFMSReviewSectionsToTable: Starting save', {
      projectId,
      dataType: typeof sections,
      isArray: Array.isArray(sections),
      isObject: typeof sections === 'object' && !Array.isArray(sections),
      keys: typeof sections === 'object' && !Array.isArray(sections) ? Object.keys(sections) : 'N/A',
      arrayLength: Array.isArray(sections) ? sections.length : 'N/A'
    });

    // Check if we have data to save BEFORE deleting
    if (!sections || (typeof sections === 'object' && Object.keys(sections).length === 0)) {
      console.log('⚠️ saveWeeklyFMSReviewSectionsToTable: Empty sections data, nothing to save');
      // Still delete existing sections if we're clearing the data
      const deletedCount = await prisma.weeklyFMSReviewSection.deleteMany({
        where: { projectId }
      });
      console.log(`🗑️ Deleted ${deletedCount.count} existing weekly FMS review sections for project ${projectId} (clearing empty data)`);
      return;
    }

    // Validate we have actual sections to create before deleting
    let hasValidSections = false;
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      // Year-based structure
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        if (Array.isArray(yearSections) && yearSections.length > 0) {
          hasValidSections = true;
          break;
        }
      }
    } else if (Array.isArray(sections) && sections.length > 0) {
      hasValidSections = true;
    }

    if (!hasValidSections) {
      console.log('⚠️ saveWeeklyFMSReviewSectionsToTable: No valid sections to save');
      // Still delete existing sections if we're clearing the data
      const deletedCount = await prisma.weeklyFMSReviewSection.deleteMany({
        where: { projectId }
      });
      console.log(`🗑️ Deleted ${deletedCount.count} existing weekly FMS review sections for project ${projectId} (no valid sections)`);
      return;
    }

    // Delete existing sections for this project (only if we have valid data to replace them)
    const deletedCount = await prisma.weeklyFMSReviewSection.deleteMany({
      where: { projectId }
    });
    console.log(`🗑️ Deleted ${deletedCount.count} existing weekly FMS review sections for project ${projectId}`);

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      let totalSectionsCreated = 0;
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10)
        if (isNaN(year) || year < 1900 || year > 3000) {
          console.warn(`⚠️ Invalid year "${yearStr}", skipping`);
          continue;
        }
        if (!Array.isArray(yearSections)) {
          console.warn(`⚠️ Year ${yearStr} sections is not an array, skipping`);
          continue;
        }

        for (let i = 0; i < yearSections.length; i++) {
          const section = yearSections[i]
          if (!section || !section.name) {
            console.warn(`⚠️ Skipping section at index ${i} in year ${yearStr}: missing name`);
            continue;
          }

          // Only create section if it has documents or if we want to preserve empty sections
          const documents = section.documents || [];
          const hasDocuments = Array.isArray(documents) && documents.length > 0;

          try {
            // Build the create data
            const sectionData = {
              projectId,
              year,
              name: section.name || '',
              description: section.description || '',
              reviewer: section.reviewer || '',
              order: i
            };

            // Only add items if we have documents
            if (hasDocuments) {
              sectionData.items = {
                create: documents.map((doc, docIdx) => {
                  const statuses = []
                  const statusMap = new Map() // Deduplicate by year-month to prevent unique constraint violations
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      // Parse "2024-01" format (monthly, no week)
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const statusKey = `${year}-${month}`
                          // Deduplicate: if same year-month exists, use the latest status value
                          statusMap.set(statusKey, {
                            year,
                            month,
                            status: String(status || 'pending')
                          })
                        }
                      }
                    }
                  }
                  // Convert map values to array (automatically deduplicated)
                  statuses.push(...Array.from(statusMap.values()))

                  const comments = []
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              const atts = Array.isArray(comment.attachments) ? comment.attachments : []
                              comments.push({
                                year,
                                month,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null,
                                attachments: JSON.stringify(atts)
                              })
                            }
                          }
                        }
                      }
                    }
                  }

                  // Build item data, only include statuses/comments if they have data
                  const itemData = {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx
                  }
                  
                  // Only add statuses if array is not empty
                  if (statuses.length > 0) {
                    itemData.statuses = { create: statuses }
                  }
                  
                  // Only add comments if array is not empty
                  if (comments.length > 0) {
                    itemData.comments = { create: comments }
                  }
                  
                  return itemData
                })
              }
            }
            // Create the section (with or without items)
            await prisma.weeklyFMSReviewSection.create({
              data: sectionData
            });
            totalSectionsCreated++;
          } catch (createError) {
            console.error(`❌ Error creating weekly FMS review section "${section.name}" for year ${year}:`, {
              error: createError.message,
              stack: createError.stack,
              code: createError.code,
              meta: createError.meta,
              sectionName: section.name,
              year: year,
              projectId: projectId
            });
            // Re-throw with more context
            throw new Error(`Failed to create weekly FMS review section "${section.name}" for year ${year}: ${createError.message}${createError.code ? ` (Code: ${createError.code})` : ''}`);
          }
        }
      }
      console.log(`✅ saveWeeklyFMSReviewSectionsToTable: Successfully saved ${totalSectionsCreated} sections to table`);
    } else if (Array.isArray(sections)) {
      // Handle legacy array format - assign to current year
      const currentYear = new Date().getFullYear();
      console.log(`📅 Legacy array format detected, assigning to year ${currentYear}`);
      let totalSectionsCreated = 0;
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section || !section.name) {
          console.warn(`⚠️ Skipping section at index ${i}: missing name`);
          continue;
        }

        try {
          await prisma.weeklyFMSReviewSection.create({
            data: {
              projectId,
              year: currentYear,
              name: section.name || '',
              description: section.description || '',
              reviewer: section.reviewer || '',
              order: i,
              items: {
                create: (section.documents || []).map((doc, docIdx) => {
                  const statuses = []
                  const statusMap = new Map() // Deduplicate by year-month to prevent unique constraint violations
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      // Parse "2024-01" format (monthly, no week)
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const statusKey = `${year}-${month}`
                          // Deduplicate: if same year-month exists, use the latest status value
                          statusMap.set(statusKey, {
                            year,
                            month,
                            status: String(status || 'pending')
                          })
                        }
                      }
                    }
                  }
                  // Convert map values to array (automatically deduplicated)
                  statuses.push(...Array.from(statusMap.values()))

                  const comments = []
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              const atts = Array.isArray(comment.attachments) ? comment.attachments : []
                              comments.push({
                                year,
                                month,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null,
                                attachments: JSON.stringify(atts)
                              })
                            }
                          }
                        }
                      }
                    }
                  }

                  // Build item data, only include statuses/comments if they have data
                  const itemData = {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx
                  }
                  
                  // Only add statuses if array is not empty
                  if (statuses.length > 0) {
                    itemData.statuses = { create: statuses }
                  }
                  
                  // Only add comments if array is not empty
                  if (comments.length > 0) {
                    itemData.comments = { create: comments }
                  }
                  
                  return itemData
                })
              }
            }
          });
          totalSectionsCreated++;
        } catch (createError) {
          console.error(`❌ Error creating weekly FMS review section "${section.name}":`, {
            error: createError.message,
            stack: createError.stack,
            code: createError.code,
            meta: createError.meta,
            sectionName: section.name,
            projectId: projectId
          });
          // Re-throw with more context
          throw new Error(`Failed to create weekly FMS review section "${section.name}": ${createError.message}${createError.code ? ` (Code: ${createError.code})` : ''}`);
        }
      }
      console.log(`✅ saveWeeklyFMSReviewSectionsToTable: Successfully saved ${totalSectionsCreated} sections (legacy format) to table`);
    } else {
      console.error('❌ saveWeeklyFMSReviewSectionsToTable: Invalid data format - expected object or array, got:', typeof sections);
      throw new Error(`Invalid sections data format: expected object or array, got ${typeof sections}`);
    }
  } catch (error) {
    console.warn('⚠️ Weekly FMS table save skipped (JSON is source of truth):', {
      error: error.message,
      code: error.code,
      projectId,
      jsonDataType: typeof jsonData
    });
    // Do NOT re-throw. Weekly FMS uses Project.weeklyFMSReviewSections JSON only.
    // Table save is best-effort; missing columns (e.g. attachments) must not cause 500.
    return;
  }
}

/**
 * Save monthlyFMSReviewSections JSON to table structure
 */
async function saveMonthlyFMSReviewSectionsToTable(projectId, jsonData) {
  if (!jsonData) {
    console.log('⚠️ saveMonthlyFMSReviewSectionsToTable: No jsonData provided, skipping save');
    return;
  }

  try {
    // Check if table exists (for environments that haven't migrated yet)
    try {
      await prisma.$queryRaw`SELECT 1 FROM "MonthlyFMSReviewSection" LIMIT 1`
    } catch (e) {
      // Table doesn't exist yet, skip table save (JSON will still be saved)
      console.warn('⚠️ MonthlyFMSReviewSection table does not exist, skipping table save')
      return
    }
    
    let sections = jsonData
    if (typeof jsonData === 'string') {
      try {
        sections = JSON.parse(jsonData)
      } catch (parseError) {
        console.error('❌ Error parsing monthlyFMSReviewSections JSON string:', parseError);
        throw new Error(`Invalid JSON in monthlyFMSReviewSections: ${parseError.message}`);
      }
    }

    console.log('💾 saveMonthlyFMSReviewSectionsToTable: Starting save', {
      projectId,
      dataType: typeof sections,
      isArray: Array.isArray(sections),
      isObject: typeof sections === 'object' && !Array.isArray(sections),
      keys: typeof sections === 'object' && !Array.isArray(sections) ? Object.keys(sections) : 'N/A',
      arrayLength: Array.isArray(sections) ? sections.length : 'N/A'
    });

    // CRITICAL FIX: Use transaction to ensure atomicity and prevent data loss
    // Only delete sections for years that are being updated, not all sections
    return await prisma.$transaction(async (tx) => {
      // Determine which years are being updated
      const yearsToUpdate = new Set();
      
      if (typeof sections === 'object' && !Array.isArray(sections)) {
        // Year-based structure: { "2024": [...], "2025": [...] }
        for (const yearStr of Object.keys(sections)) {
          const year = parseInt(yearStr, 10);
          if (!isNaN(year) && year >= 1900 && year <= 3000) {
            yearsToUpdate.add(year);
          }
        }
      } else if (Array.isArray(sections)) {
        // Legacy array format - assign to current year
        const currentYear = new Date().getFullYear();
        yearsToUpdate.add(currentYear);
      }

      // Only delete sections for the years being updated (not all sections!)
      // This prevents data loss when saving partial updates
      if (yearsToUpdate.size > 0) {
        const deletedCount = await tx.monthlyFMSReviewSection.deleteMany({
          where: { 
            projectId,
            year: { in: Array.from(yearsToUpdate) }
          }
        });
        console.log(`🗑️ Deleted ${deletedCount.count} existing monthly FMS review sections for project ${projectId}, years: ${Array.from(yearsToUpdate).join(', ')}`);
      } else {
        console.log('⚠️ No valid years found in sections data, skipping delete');
      }

      if (!sections || (typeof sections === 'object' && Object.keys(sections).length === 0)) {
        console.log('⚠️ saveMonthlyFMSReviewSectionsToTable: Empty sections data, nothing to save');
        return;
      }

      // Handle year-based structure: { "2024": [...], "2025": [...] }
      if (typeof sections === 'object' && !Array.isArray(sections)) {
        let totalSectionsCreated = 0;
        for (const [yearStr, yearSections] of Object.entries(sections)) {
          const year = parseInt(yearStr, 10)
          if (isNaN(year) || year < 1900 || year > 3000) {
            console.warn(`⚠️ Invalid year "${yearStr}", skipping`);
            continue;
          }
          if (!Array.isArray(yearSections)) {
            console.warn(`⚠️ Year ${yearStr} sections is not an array, skipping`);
            continue;
          }

          for (let i = 0; i < yearSections.length; i++) {
            const section = yearSections[i]
            if (!section || !section.name) {
              console.warn(`⚠️ Skipping section at index ${i} in year ${yearStr}: missing name`);
              continue;
            }

            try {
              await tx.monthlyFMSReviewSection.create({
              data: {
                projectId,
                year,
                name: section.name || '',
                description: section.description || '',
                reviewer: section.reviewer || '',
                order: i,
                items: {
                  create: (section.documents || []).map((doc, docIdx) => {
                    const statuses = []
                    const statusMap = new Map() // Deduplicate by year-month to prevent unique constraint violations
                    if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                      for (const [key, status] of Object.entries(doc.collectionStatus)) {
                        // Parse "2024-01" format (monthly, no week)
                        const parts = key.split('-')
                        if (parts.length >= 2) {
                          const year = parseInt(parts[0], 10)
                          const month = parseInt(parts[1], 10)
                          if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                            const statusKey = `${year}-${month}`
                            // Deduplicate: if same year-month exists, use the latest status value
                            statusMap.set(statusKey, {
                              year,
                              month,
                              status: String(status || 'pending')
                            })
                          }
                        }
                      }
                    }
                    // Convert map values to array (automatically deduplicated)
                    statuses.push(...Array.from(statusMap.values()))

                    const comments = []
                    if (doc.comments && typeof doc.comments === 'object') {
                      for (const [key, commentArray] of Object.entries(doc.comments)) {
                        const parts = key.split('-')
                        if (parts.length >= 2) {
                          const year = parseInt(parts[0], 10)
                          const month = parseInt(parts[1], 10)
                          if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                            const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                            for (const comment of commentList) {
                              if (comment && (comment.text || comment)) {
                                const atts = Array.isArray(comment.attachments) ? comment.attachments : []
                                comments.push({
                                  year,
                                  month,
                                  text: comment.text || String(comment),
                                  author: comment.author || comment.authorName || '',
                                  authorId: comment.authorId || null,
                                  attachments: JSON.stringify(atts)
                                })
                              }
                            }
                          }
                        }
                      }
                    }

                    // Build item data, only include statuses/comments if they have data
                    const itemData = {
                      name: doc.name || '',
                      description: doc.description || '',
                      required: doc.required || false,
                      order: docIdx
                    }
                    
                    // Only add statuses if array is not empty
                    if (statuses.length > 0) {
                      itemData.statuses = { create: statuses }
                    }
                    
                    // Only add comments if array is not empty
                    if (comments.length > 0) {
                      itemData.comments = { create: comments }
                    }
                    
                    return itemData
                  })
                }
              }
            });
              totalSectionsCreated++;
            } catch (createError) {
              console.error(`❌ Error creating monthly FMS review section "${section.name}" for year ${year}:`, createError);
              throw createError;
            }
          }
        }
        console.log(`✅ saveMonthlyFMSReviewSectionsToTable: Successfully saved ${totalSectionsCreated} sections to table`);
        return totalSectionsCreated;
      } else if (Array.isArray(sections)) {
        // Handle legacy array format - assign to current year
        const currentYear = new Date().getFullYear();
        console.log(`📅 Legacy array format detected, assigning to year ${currentYear}`);
        let totalSectionsCreated = 0;
        
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          if (!section || !section.name) {
            console.warn(`⚠️ Skipping section at index ${i}: missing name`);
            continue;
          }

          try {
            await tx.monthlyFMSReviewSection.create({
            data: {
              projectId,
              year: currentYear,
              name: section.name || '',
              description: section.description || '',
              reviewer: section.reviewer || '',
              order: i,
              items: {
                create: (section.documents || []).map((doc, docIdx) => {
                  const statuses = []
                  const statusMap = new Map() // Deduplicate by year-month to prevent unique constraint violations
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      // Parse "2024-01" format (monthly, no week)
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const statusKey = `${year}-${month}`
                          // Deduplicate: if same year-month exists, use the latest status value
                          statusMap.set(statusKey, {
                            year,
                            month,
                            status: String(status || 'pending')
                          })
                        }
                      }
                    }
                  }
                  // Convert map values to array (automatically deduplicated)
                  statuses.push(...Array.from(statusMap.values()))

                  const comments = []
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parts = key.split('-')
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10)
                        const month = parseInt(parts[1], 10)
                        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray]
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              const atts = Array.isArray(comment.attachments) ? comment.attachments : []
                              comments.push({
                                year,
                                month,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null,
                                attachments: JSON.stringify(atts)
                              })
                            }
                          }
                        }
                      }
                    }
                  }

                  // Build item data, only include statuses/comments if they have data
                  const itemData = {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx
                  }
                  
                  // Only add statuses if array is not empty
                  if (statuses.length > 0) {
                    itemData.statuses = { create: statuses }
                  }
                  
                  // Only add comments if array is not empty
                  if (comments.length > 0) {
                    itemData.comments = { create: comments }
                  }
                  
                  return itemData
                })
              }
            }
          });
            totalSectionsCreated++;
          } catch (createError) {
            console.error(`❌ Error creating monthly FMS review section "${section.name}":`, createError);
            throw createError;
          }
        }
        console.log(`✅ saveMonthlyFMSReviewSectionsToTable: Successfully saved ${totalSectionsCreated} sections (legacy format) to table`);
        return totalSectionsCreated;
      } else {
        console.error('❌ saveMonthlyFMSReviewSectionsToTable: Invalid data format - expected object or array, got:', typeof sections);
        throw new Error(`Invalid sections data format: expected object or array, got ${typeof sections}`);
      }
    });
  } catch (error) {
    console.error('❌ Error saving monthlyFMSReviewSections to table:', {
      error: error.message,
      stack: error.stack,
      projectId,
      jsonDataType: typeof jsonData
    });
    // Re-throw the error so the caller knows it failed
    throw error;
  }
}

async function handler(req, res) {
  try {
    
    // Add debugging for the specific issue
    
    // Parse the URL path - strip /api/ prefix if present
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = req.params?.id || pathSegments[pathSegments.length - 1]

    // List Projects (GET /api/projects)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      try {
        // One-time migration: add missing columns once per process (not on every request)
        if (!projectListColumnsMigrated) {
          try {
            await prisma.$executeRaw`
              ALTER TABLE "Project" 
              ADD COLUMN IF NOT EXISTS "monthlyFMSReviewSections" TEXT DEFAULT '[]',
              ADD COLUMN IF NOT EXISTS "hasMonthlyFMSReviewProcess" BOOLEAN DEFAULT false,
              ADD COLUMN IF NOT EXISTS "hasTimeProcess" BOOLEAN DEFAULT false;
            `;
            projectListColumnsMigrated = true;
          } catch (migrationError) {
            if (!migrationError.message?.includes('already exists') && !migrationError.message?.includes('duplicate column')) {
              console.log('⚠️ Migration note (non-critical):', migrationError.message?.substring(0, 100));
            }
          }
        }

        const userRole = req.user?.role?.toLowerCase();
        
        // Parse pagination parameters
        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 100, 500); // Default 100, max 500
        const skip = (page - 1) * limit;
        const includeCount = req.query?.includeCount === 'true';
        const includeTaskCount = req.query?.includeTaskCount !== 'false'; // Default true, can be disabled for speed
        
        // Build where clause
        let whereClause = {};
        
        // For guest users, filter by accessibleProjectIds
        if (userRole === 'guest') {
          try {
            // Parse accessibleProjectIds from user
            let accessibleProjectIds = [];
            if (req.user?.accessibleProjectIds) {
              if (typeof req.user.accessibleProjectIds === 'string') {
                accessibleProjectIds = JSON.parse(req.user.accessibleProjectIds);
              } else if (Array.isArray(req.user.accessibleProjectIds)) {
                accessibleProjectIds = req.user.accessibleProjectIds;
              }
            }
            
            // If no accessible projects specified, return empty array
            if (!accessibleProjectIds || accessibleProjectIds.length === 0) {
              return ok(res, { projects: [], total: 0, page, limit });
            }
            
            // Filter by accessible project IDs
            whereClause = {
              id: {
                in: accessibleProjectIds
              }
            };
            
          } catch (parseError) {
            console.error('❌ Error parsing accessibleProjectIds:', parseError);
            return ok(res, { projects: [], total: 0, page, limit });
          }
        }
        
        // Get total count if requested (only for first page to avoid performance hit)
        let total = null;
        if (includeCount && page === 1) {
          try {
            total = await prisma.project.count({ where: whereClause });
          } catch (countError) {
            console.warn('⚠️ Could not get project count:', countError.message);
          }
        }
        
        // Optimize: Only select fields needed for the list view
        // Wrap in try-catch to handle missing columns gracefully
        let projects;
        try {
          projects = await prisma.project.findMany({ 
            where: whereClause,
            select: {
              id: true,
              name: true,
              clientName: true,
              status: true,
              type: true,
              startDate: true,
              dueDate: true,
              assignedTo: true,
              description: true,
              createdAt: true,
              updatedAt: true,
              monthlyProgress: true,
              // NOTE: tasksList JSON field removed from select - tasks are now only in Task table
              hasDocumentCollectionProcess: true, // Include to show Document Collection tab in list
              hasWeeklyFMSReviewProcess: true, // Include to show Weekly FMS Review tab in list
              hasTimeProcess: true, // Include so Time tab persists after refresh when opening from list
              hasMonthlyFMSReviewProcess: true, // Include so Monthly FMS tab persists after refresh when opening from list
              ...(includeTaskCount ? {
                _count: {
                  select: {
                    tasks: true // Count tasks from Task table (source of truth)
                  }
                }
              } : {})
              // Exclude all JSON fields - data is now in separate tables:
              // - tasksList → Task table
              // - taskLists → ProjectTaskList table
              // - customFieldDefinitions → ProjectCustomFieldDefinition table
              // - documents → ProjectDocument table
              // - comments → ProjectComment table
              // - activityLog → ProjectActivityLog table
              // - team → ProjectTeamMember table
            },
            orderBy: { name: 'asc' },
            take: limit,
            skip: skip
          });
        } catch (queryError) {
          // If query fails due to missing column, retry without problematic fields
          if (queryError.message?.includes('does not exist') || queryError.message?.includes('Unknown column')) {
            console.log('⚠️ Retrying project query without optional columns (may not exist yet)');
            projects = await prisma.project.findMany({ 
              where: whereClause,
              select: {
                id: true,
                name: true,
                clientName: true,
                status: true,
                type: true,
                startDate: true,
                dueDate: true,
                assignedTo: true,
                description: true,
                createdAt: true,
                updatedAt: true,
                monthlyProgress: true,
                hasDocumentCollectionProcess: true,
                hasWeeklyFMSReviewProcess: true,
                hasTimeProcess: true,
                hasMonthlyFMSReviewProcess: true,
                ...(includeTaskCount ? {
                  _count: {
                    select: {
                      tasks: true
                    }
                  }
                } : {})
              },
              orderBy: { name: 'asc' },
              take: limit,
              skip: skip
            });
          } else {
            throw queryError; // Re-throw if it's a different error
          }
        }
        
        // Calculate tasksCount from Task table only (no JSON fallback)
        const projectsWithTaskCount = projects.map(project => {
          // Tasks are now only stored in Task table - use the count from relation
          const tasksCount = includeTaskCount ? (project._count?.tasks || 0) : 0;
          
          const result = { ...project };
          if (includeTaskCount) {
            result.tasksCount = tasksCount;
          }
          // Remove _count from response to reduce payload size
          delete result._count;
          
          return result;
        })
        
        // Return paginated response
        const response = { projects: projectsWithTaskCount };
        if (total !== null) {
          response.total = total;
          response.page = page;
          response.limit = limit;
          response.totalPages = Math.ceil(total / limit);
        }
        
        return ok(res, response)
      } catch (dbError) {
        console.error('❌ Database error listing projects:', {
          message: dbError.message,
          code: dbError.code,
          name: dbError.name,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 500)
        })
        
        // Check if it's a connection error using utility
        if (isConnectionError(dbError)) {
          console.error('🔌 Database connection issue detected - server may be unreachable')
          // Pass the error message to serverError which will format it as DATABASE_CONNECTION_ERROR
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }

        // If the projects table or columns are missing in the database, fall back
        // to returning an empty list instead of a hard 500 so the UI can still load.
        const errorMessage = dbError.message || ''
        const isMissingTableOrColumn =
          dbError.code === 'P2021' || // table does not exist
          dbError.code === 'P2022' || // column does not exist
          /relation "project"/i.test(errorMessage) ||
          /no such table: .*project/i.test(errorMessage) ||
          /column .* does not exist/i.test(errorMessage)

        if (isMissingTableOrColumn) {
          console.warn('⚠️ Projects API: Project table/columns missing in database. Returning empty list fallback.')
          return ok(res, { projects: [] })
        }
        
        return serverError(res, 'Failed to list projects', dbError.message)
      }
    }

    // Create Project (POST /api/projects)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'projects') {
      let body = req.body

      // If body is a string, parse it
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('❌ Failed to parse string body for project creation:', parseError)
          body = {}
        }
      }

      // Only try parseJsonBody if req.body is completely undefined
      // If req.body exists (even if empty), Express has already parsed it
      if (body === undefined) {
        body = await parseJsonBody(req)
      }

      // Ensure body is an object
      body = body || {}

      // Enhanced logging for debugging
      if (!body.name) {
        console.error('❌ No name provided in request body')
        console.error('❌ Full request details:', {
          method: req.method,
          url: req.url,
          headers: req.headers,
          bodyKeys: Object.keys(body),
          bodyType: typeof body,
          bodyValue: body,
          reqBodyExists: req.body !== undefined,
          reqBodyType: typeof req.body,
          reqBodyKeys: req.body ? Object.keys(req.body) : []
        })
        return badRequest(res, 'name required')
      }

      // Validate project type - only allow General, Monthly Review, or Audit
      const allowedTypes = ['General', 'Monthly Review', 'Audit'];
      if (body.type && !allowedTypes.includes(body.type)) {
        return badRequest(res, `Invalid project type. Allowed types are: ${allowedTypes.join(', ')}`)
      }

      // Find or create client by name if clientName is provided
      let clientId = null;
      if (body.clientName) {
        try {
          let client = await prisma.client.findFirst({ 
            where: { name: body.clientName } 
          });
          
          // If client doesn't exist, create it
          if (!client) {
            // dev-admin (TEST_DEV_AUTH) is not in User table; use null for ownerId
            const ownerId = req.user?.sub === 'dev-admin' ? null : (req.user?.sub || null)
            client = await prisma.client.create({
              data: {
                name: body.clientName,
                type: 'client',
                industry: 'Other',
                status: 'active',
                ownerId
              }
            });
          }
          
          clientId = client.id;
        } catch (error) {
          console.error('Error finding/creating client:', error);
        }
      }

      // dev-admin (TEST_DEV_AUTH) is not in User table; use null for ownerId
      const projectOwnerId = req.user?.sub === 'dev-admin' ? null : (req.user?.sub || null)
      // Parse dates safely
      const normalizedStartDate = typeof body.startDate === 'string' ? body.startDate.trim() : ''
      let startDate = new Date();
      if (normalizedStartDate) {
        const parsedStartDate = new Date(normalizedStartDate);
        if (!isNaN(parsedStartDate.getTime())) {
          startDate = parsedStartDate;
        }
      }

      let dueDate = null;
      const normalizedDueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : ''
      if (normalizedDueDate) {
        const parsedDueDate = new Date(normalizedDueDate);
        if (!isNaN(parsedDueDate.getTime())) {
          dueDate = parsedDueDate;
        }
      } else if (body.dueDate === null || body.dueDate === '') {
        dueDate = null;
      }

      const projectData = {
        name: body.name,
        description: body.description || '',
        clientName: body.clientName || body.client || '',
        clientId: clientId || body.clientId || null,
        status: body.status || 'Planning',
        startDate: startDate,
        dueDate: dueDate,
        budget: parseFloat(body.budget) || 0,
        priority: body.priority || 'Medium',
        // JSON fields completely removed - data now stored ONLY in separate tables:
        // - tasksList → Task table (via /api/tasks)
        // - taskLists → ProjectTaskList table (via /api/project-task-lists)
        // - customFieldDefinitions → ProjectCustomFieldDefinition table (via /api/project-custom-fields)
        // - team → ProjectTeamMember table (via /api/project-team-members)
        // - documents → ProjectDocument table (via /api/project-documents)
        // - comments → ProjectComment table (via /api/project-comments)
        // - activityLog → ProjectActivityLog table (via /api/project-activity-logs)
        // These fields are no longer stored in Project table - use dedicated APIs instead
        tasksList: '[]', // Legacy - deprecated, use Task table (only field that exists in schema)
        // NOTE: taskLists, customFieldDefinitions, team, documents, comments, activityLog
        // are NOT in the Project schema - do not include them here
        type: body.type || 'Monthly Review',
        assignedTo: body.assignedTo || '',
        notes: body.notes || '',
        ownerId: projectOwnerId,
        // New projects: only Tasks tab by default; other modules added via + Module
        hasTimeProcess: false,
        hasDocumentCollectionProcess: false,
        documentSections: typeof body.documentSections === 'string' ? body.documentSections : JSON.stringify(Array.isArray(body.documentSections) ? body.documentSections : []),
        weeklyFMSReviewSections: typeof body.weeklyFMSReviewSections === 'string' ? body.weeklyFMSReviewSections : JSON.stringify(
          body.weeklyFMSReviewSections && typeof body.weeklyFMSReviewSections === 'object'
            ? body.weeklyFMSReviewSections
            : {}
        ),
        hasWeeklyFMSReviewProcess: body.hasWeeklyFMSReviewProcess !== undefined 
          ? (typeof body.hasWeeklyFMSReviewProcess === 'boolean' 
            ? body.hasWeeklyFMSReviewProcess 
            : Boolean(body.hasWeeklyFMSReviewProcess === true || body.hasWeeklyFMSReviewProcess === 'true' || body.hasWeeklyFMSReviewProcess === 1))
          : false,
        monthlyFMSReviewSections: typeof body.monthlyFMSReviewSections === 'string' 
          ? body.monthlyFMSReviewSections 
          : JSON.stringify(body.monthlyFMSReviewSections && typeof body.monthlyFMSReviewSections === 'object'
            ? body.monthlyFMSReviewSections
            : {}),
        hasMonthlyFMSReviewProcess: body.hasMonthlyFMSReviewProcess !== undefined 
          ? (typeof body.hasMonthlyFMSReviewProcess === 'boolean' 
            ? body.hasMonthlyFMSReviewProcess 
            : Boolean(body.hasMonthlyFMSReviewProcess === true || body.hasMonthlyFMSReviewProcess === 'true' || body.hasMonthlyFMSReviewProcess === 1))
          : false,
        monthlyProgress: typeof body.monthlyProgress === 'string'
          ? body.monthlyProgress
          : JSON.stringify(
              body.monthlyProgress && typeof body.monthlyProgress === 'object' && !Array.isArray(body.monthlyProgress)
                ? body.monthlyProgress
                : {}
            )
      }

      
      try {
        const project = await prisma.project.create({
          data: projectData
        })

        // Save to tables if documentSections or weeklyFMSReviewSections are provided
        if (body.documentSections !== undefined && body.documentSections !== null) {
          await saveDocumentSectionsToTable(project.id, body.documentSections)
        }
        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          await saveWeeklyFMSReviewSectionsToTable(project.id, body.weeklyFMSReviewSections)
        }

        // Convert table data to JSON format that frontend expects
        let documentSectionsJson = null;
        let weeklyFMSReviewSectionsJson = null;
        
        try {
          documentSectionsJson = await documentSectionsToJson(project.id);
          // If no table data, use empty object
          if (!documentSectionsJson) {
            documentSectionsJson = {};
          }
        } catch (e) {
          console.warn('⚠️ Failed to convert documentSections from table:', e.message);
          documentSectionsJson = {};
        }
        
        try {
          weeklyFMSReviewSectionsJson = await weeklyFMSReviewSectionsToJson(project.id);
          // If no table data, use empty object
          if (!weeklyFMSReviewSectionsJson) {
            weeklyFMSReviewSectionsJson = {};
          }
        } catch (e) {
          console.warn('⚠️ Failed to convert weeklyFMSReviewSections from table:', e.message);
          weeklyFMSReviewSectionsJson = {};
        }

        // Transform to match expected frontend format
        const transformedProject = {
          ...project,
          documentSections: documentSectionsJson,
          weeklyFMSReviewSections: weeklyFMSReviewSectionsJson,
          monthlyFMSReviewSections: project.monthlyFMSReviewSections || '[]'
        };

        return created(res, { project: transformedProject })
      } catch (dbError) {
        console.error('❌ Database error creating project:', dbError)
        console.error('❌ Error details:', {
          message: dbError.message,
          code: dbError.code,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 500),
          projectDataKeys: Object.keys(projectData),
          projectData: JSON.stringify(projectData, null, 2).substring(0, 1000)
        })
        
        // Check if it's a connection error using utility
        if (isConnectionError(dbError)) {
          console.error('🔌 Database connection issue detected - server may be unreachable')
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        return serverError(res, 'Failed to create project', dbError.message)
      }
    }

    // Get, Update, Delete Single Project (GET, PUT, DELETE /api/projects/[id])
    // NOTE: This handler may be redundant if api/projects/[id].js is used instead
    // But kept for backward compatibility with pathSegments routing
    if (pathSegments.length === 2 && pathSegments[0] === 'projects' && id) {
      if (req.method === 'GET') {
        // Redirect to projects/[id].js handler - this GET should not be reached if routing is correct
        // But if it is reached, return basic project data (tables should be loaded by projects/[id].js)
        try {
          const project = await prisma.project.findUnique({ where: { id } })
          if (!project) return notFound(res)
          return ok(res, { project })
        } catch (dbError) {
          console.error('❌ Database error getting project:', dbError)
          return serverError(res, 'Failed to get project', dbError.message)
        }
      }
      if (req.method === 'PUT') {
        let body = req.body

        if (typeof body === 'string') {
          try {
            body = JSON.parse(body)
          } catch (parseError) {
            console.error('❌ Failed to parse string body for project update:', parseError)
            body = {}
          }
        }

        if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
          body = await parseJsonBody(req)
        }

        body = body || {}

        
        // Find or create client by name if clientName is provided
        let clientId = null;
        if (body.clientName) {
          try {
            let client = await prisma.client.findFirst({ 
              where: { name: body.clientName } 
            });
            
            // If client doesn't exist, create it
            if (!client) {
              client = await prisma.client.create({
                data: {
                  name: body.clientName,
                  type: 'client',
                  industry: 'Other',
                  status: 'active',
                  ownerId: req.user?.sub === 'dev-admin' ? null : (req.user?.sub || null)
                }
              });
            }
            
            clientId = client.id;
          } catch (error) {
            console.error('Error finding/creating client:', error);
          }
        }
        
        const normalizedStartDate = typeof body.startDate === 'string' ? body.startDate.trim() : ''
        const normalizedDueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : ''

        // JSON fields completely removed - data now stored ONLY in separate tables:
        // - tasksList → Task table (via /api/tasks)
        // - taskLists → ProjectTaskList table (via /api/project-task-lists)
        // - customFieldDefinitions → ProjectCustomFieldDefinition table (via /api/project-custom-fields)
        // - team → ProjectTeamMember table (via /api/project-team-members)
        // - documents → ProjectDocument table (via /api/project-documents)
        // - comments → ProjectComment table (via /api/project-comments)
        // - activityLog → ProjectActivityLog table (via /api/project-activity-logs)
        // No merge logic needed - tables handle concurrent updates properly
        
        const updateData = {
          name: body.name,
          description: body.description,
          clientName: body.clientName || body.client,
          clientId: clientId || body.clientId,
          status: body.status,
          startDate: normalizedStartDate ? new Date(normalizedStartDate) : undefined,
          dueDate: normalizedDueDate ? new Date(normalizedDueDate) : undefined,
          budget: body.budget,
          priority: body.priority,
          type: body.type,
          assignedTo: body.assignedTo,
          notes: body.notes,
          // Always process hasDocumentCollectionProcess if provided, even if false
          // This ensures we can explicitly set it to false if needed
          hasDocumentCollectionProcess: body.hasDocumentCollectionProcess !== undefined 
            ? Boolean(body.hasDocumentCollectionProcess === true || body.hasDocumentCollectionProcess === 'true' || body.hasDocumentCollectionProcess === 1) 
            : undefined
        }
        
        // Handle documentSections separately if provided - ensure it's properly saved
        if (body.documentSections !== undefined && body.documentSections !== null) {
          try {
            if (typeof body.documentSections === 'string') {
              // Already a string, validate it's valid JSON
              const trimmed = body.documentSections.trim();
              if (trimmed === '') {
                // Empty string means empty array
                updateData.documentSections = JSON.stringify([]);
              } else {
                try {
                  // Validate it's valid JSON
                  const parsed = JSON.parse(trimmed);
                  // If it parsed successfully, use it as-is (it's already a stringified JSON)
                  updateData.documentSections = trimmed;
                } catch (parseError) {
                  console.error('❌ Invalid documentSections JSON string:', parseError);
                  // If string is invalid JSON, stringify it (might be double-encoded or corrupted)
                  updateData.documentSections = JSON.stringify(body.documentSections);
                }
              }
            } else if (Array.isArray(body.documentSections)) {
              // It's an array, stringify it
              updateData.documentSections = JSON.stringify(body.documentSections);
            } else if (typeof body.documentSections === 'object') {
              // It's an object, stringify it
              updateData.documentSections = JSON.stringify(body.documentSections);
            } else {
              // It's something else (number, boolean, etc.), stringify it
              updateData.documentSections = JSON.stringify(body.documentSections);
            }
          } catch (error) {
            console.error('❌ Error processing documentSections:', error);
            // Don't fail the entire update, but log the error
          }
        } else {
        }

        // Handle weeklyFMSReviewSections separately if provided - ensure it's properly saved
        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          try {
            if (typeof body.weeklyFMSReviewSections === 'string') {
              // Already a string, validate it's valid JSON
              const trimmed = body.weeklyFMSReviewSections.trim();
              if (trimmed === '') {
                // Empty string means empty object/array
                updateData.weeklyFMSReviewSections = JSON.stringify({});
              } else {
                try {
                  // Validate it's valid JSON
                  const parsed = JSON.parse(trimmed);
                  // If it parsed successfully, use it as-is (it's already a stringified JSON)
                  updateData.weeklyFMSReviewSections = trimmed;
                } catch (parseError) {
                  console.error('❌ Invalid weeklyFMSReviewSections JSON string:', parseError);
                  // If string is invalid JSON, stringify it (might be double-encoded or corrupted)
                  updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
                }
              }
            } else if (Array.isArray(body.weeklyFMSReviewSections)) {
              // It's an array, stringify it
              updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
            } else if (typeof body.weeklyFMSReviewSections === 'object') {
              // It's an object, stringify it
              updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
            } else {
              // It's something else (number, boolean, etc.), stringify it
              updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
            }
          } catch (error) {
            console.error('❌ Error processing weeklyFMSReviewSections:', error);
            // Don't fail the entire update, but log the error
          }
        }

        // Handle hasTimeProcess separately if provided
        if (body.hasTimeProcess !== undefined && body.hasTimeProcess !== null) {
          updateData.hasTimeProcess = typeof body.hasTimeProcess === 'boolean'
            ? body.hasTimeProcess
            : Boolean(body.hasTimeProcess === true || body.hasTimeProcess === 'true' || body.hasTimeProcess === 1);
        }

        // Handle hasWeeklyFMSReviewProcess separately if provided
        if (body.hasWeeklyFMSReviewProcess !== undefined && body.hasWeeklyFMSReviewProcess !== null) {
          updateData.hasWeeklyFMSReviewProcess = typeof body.hasWeeklyFMSReviewProcess === 'boolean'
            ? body.hasWeeklyFMSReviewProcess
            : Boolean(body.hasWeeklyFMSReviewProcess === true || body.hasWeeklyFMSReviewProcess === 'true' || body.hasWeeklyFMSReviewProcess === 1);
        }

        // Handle monthlyFMSReviewSections separately if provided - ensure it's properly saved
        if (body.monthlyFMSReviewSections !== undefined && body.monthlyFMSReviewSections !== null) {
          try {
            if (typeof body.monthlyFMSReviewSections === 'string') {
              // Already a string, validate it's valid JSON
              const trimmed = body.monthlyFMSReviewSections.trim();
              if (trimmed === '') {
                // Empty string means empty object/array
                updateData.monthlyFMSReviewSections = JSON.stringify({});
              } else {
                try {
                  // Validate it's valid JSON
                  const parsed = JSON.parse(trimmed);
                  // If it parsed successfully, use it as-is (it's already a stringified JSON)
                  updateData.monthlyFMSReviewSections = trimmed;
                } catch (parseError) {
                  console.error('❌ Invalid monthlyFMSReviewSections JSON string:', parseError);
                  // If string is invalid JSON, stringify it (might be double-encoded or corrupted)
                  updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
                }
              }
            } else if (Array.isArray(body.monthlyFMSReviewSections)) {
              // It's an array, stringify it
              updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
            } else if (typeof body.monthlyFMSReviewSections === 'object') {
              // It's an object, stringify it
              updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
            } else {
              // It's something else (number, boolean, etc.), stringify it
              updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
            }
          } catch (error) {
            console.error('❌ Error processing monthlyFMSReviewSections:', error);
            // Don't fail the entire update, but log the error
          }
        }

        // Handle hasMonthlyFMSReviewProcess separately if provided
        if (body.hasMonthlyFMSReviewProcess !== undefined && body.hasMonthlyFMSReviewProcess !== null) {
          updateData.hasMonthlyFMSReviewProcess = typeof body.hasMonthlyFMSReviewProcess === 'boolean'
            ? body.hasMonthlyFMSReviewProcess
            : Boolean(body.hasMonthlyFMSReviewProcess === true || body.hasMonthlyFMSReviewProcess === 'true' || body.hasMonthlyFMSReviewProcess === 1);
        }

        // Handle monthlyProgress separately if provided - with validation for safety
        if (body.monthlyProgress !== undefined && body.monthlyProgress !== null) {
          try {
            let monthlyProgressString = body.monthlyProgress;

            // If it's already a string, validate it's valid JSON
            if (typeof monthlyProgressString === 'string') {
              // Validate JSON structure
              const parsed = JSON.parse(monthlyProgressString);

              // Ensure it's an object (not array, null, or primitive)
              if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
                throw new Error('monthlyProgress must be an object');
              }

              // Validate structure - each key should be a month-year format
              // and values should be objects with valid fields
              for (const key in parsed) {
                if (typeof parsed[key] !== 'object' || Array.isArray(parsed[key]) || parsed[key] === null) {
                  console.warn(`⚠️ Invalid month data structure for key: ${key}`);
                  // Don't fail, but log warning
                } else {
                  // Check for valid field names (compliance, data, comments)
                  const validFields = ['compliance', 'data', 'comments'];
                  for (const field in parsed[key]) {
                    if (validFields.includes(field) && typeof parsed[key][field] !== 'string') {
                      // Convert non-string values to strings for safety
                      parsed[key][field] = String(parsed[key][field] || '');
                    }
                  }
                }
              }

              // Re-stringify the validated/cleaned data
              monthlyProgressString = JSON.stringify(parsed);
            } else {
              // If it's an object, validate and stringify
              if (typeof monthlyProgressString !== 'object' || Array.isArray(monthlyProgressString)) {
                throw new Error('monthlyProgress must be an object');
              }
              monthlyProgressString = JSON.stringify(monthlyProgressString);
            }

            updateData.monthlyProgress = monthlyProgressString;
          } catch (error) {
            console.error('❌ Invalid monthlyProgress data in projects.js PUT handler:', error);
            return serverError(
              res,
              'Invalid monthlyProgress format. Must be valid JSON object.',
              error.message
            );
          }
        }
        
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        try {
          // Verify hasDocumentCollectionProcess is in updateData before updating
          if ('hasDocumentCollectionProcess' in updateData) {
          } else {
            console.warn('⚠️ hasDocumentCollectionProcess NOT in updateData - will not be updated');
          }
          
          // Save to tables if documentSections or weeklyFMSReviewSections are being updated
          if (body.documentSections !== undefined && body.documentSections !== null) {
            await saveDocumentSectionsToTable(id, body.documentSections)
          }
          // Weekly FMS: source of truth is Project.weeklyFMSReviewSections JSON only. Skip table save
          // to avoid P2022 (e.g. missing attachments column) and keep PUT always succeeding.
          if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
            // saveWeeklyFMSReviewSectionsToTable intentionally not called – JSON-only persistence.
          }
          
          const project = await prisma.project.update({ 
            where: { id }, 
            data: updateData 
          })
          
          console.log('✅ API: Project update completed', {
            projectId: id,
            hasWeeklyFMSInUpdateData: updateData.weeklyFMSReviewSections !== undefined,
            weeklyFMSLength: typeof updateData.weeklyFMSReviewSections === 'string' 
              ? updateData.weeklyFMSReviewSections.length 
              : 'N/A'
          });
          
          return ok(res, { project })
        } catch (dbError) {
          console.error('❌ Database error updating project:', dbError)
          return serverError(res, 'Failed to update project', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          // Check if project exists first
          const projectExists = await prisma.project.findUnique({ where: { id } })
          if (!projectExists) {
            console.error('❌ Project not found:', id)
            return notFound(res, 'Project not found')
          }
          
          // Ensure referential integrity by removing dependents first, then the project
          // Order matters: delete deepest nested records first to avoid foreign key constraint violations
          await prisma.$transaction(async (tx) => {
            // 1. Delete nested items and their children first (deepest level)
            // Get all section IDs for this project
            const documentSectionIds = (await tx.documentSection.findMany({ 
              where: { projectId: id }, 
              select: { id: true } 
            })).map(s => s.id);
            
            const weeklySectionIds = (await tx.weeklyFMSReviewSection.findMany({ 
              where: { projectId: id }, 
              select: { id: true } 
            })).map(s => s.id);
            
            const monthlySectionIds = (await tx.monthlyFMSReviewSection.findMany({ 
              where: { projectId: id }, 
              select: { id: true } 
            })).map(s => s.id);
            
            // Delete DocumentItem children (statuses and comments) for all sections at once
            if (documentSectionIds.length > 0) {
              const documentItemIds = (await tx.documentItem.findMany({ 
                where: { sectionId: { in: documentSectionIds } }, 
                select: { id: true } 
              })).map(i => i.id);
              
              if (documentItemIds.length > 0) {
                await tx.documentItemStatus.deleteMany({ where: { itemId: { in: documentItemIds } } });
                await tx.documentItemComment.deleteMany({ where: { itemId: { in: documentItemIds } } });
              }
              await tx.documentItem.deleteMany({ where: { sectionId: { in: documentSectionIds } } });
            }
            
            // Delete WeeklyFMSReviewItem children
            if (weeklySectionIds.length > 0) {
              const weeklyItemIds = (await tx.weeklyFMSReviewItem.findMany({ 
                where: { sectionId: { in: weeklySectionIds } }, 
                select: { id: true } 
              })).map(i => i.id);
              
              if (weeklyItemIds.length > 0) {
                await tx.weeklyFMSReviewItemStatus.deleteMany({ where: { itemId: { in: weeklyItemIds } } });
                await tx.weeklyFMSReviewItemComment.deleteMany({ where: { itemId: { in: weeklyItemIds } } });
              }
              await tx.weeklyFMSReviewItem.deleteMany({ where: { sectionId: { in: weeklySectionIds } } });
            }
            
            // Delete MonthlyFMSReviewItem children
            if (monthlySectionIds.length > 0) {
              const monthlyItemIds = (await tx.monthlyFMSReviewItem.findMany({ 
                where: { sectionId: { in: monthlySectionIds } }, 
                select: { id: true } 
              })).map(i => i.id);
              
              if (monthlyItemIds.length > 0) {
                await tx.monthlyFMSReviewItemStatus.deleteMany({ where: { itemId: { in: monthlyItemIds } } });
                await tx.monthlyFMSReviewItemComment.deleteMany({ where: { itemId: { in: monthlyItemIds } } });
              }
              await tx.monthlyFMSReviewItem.deleteMany({ where: { sectionId: { in: monthlySectionIds } } });
            }
            
            // 2. Delete sections (after their items are deleted)
            await tx.documentSection.deleteMany({ where: { projectId: id } });
            await tx.weeklyFMSReviewSection.deleteMany({ where: { projectId: id } });
            await tx.monthlyFMSReviewSection.deleteMany({ where: { projectId: id } });
            
            // 3. Delete tasks (handle self-referential hierarchy first)
            await tx.task.updateMany({ 
              where: { projectId: id },
              data: { parentTaskId: null }
            });
            await tx.task.deleteMany({ where: { projectId: id } });
            
            // 4. Delete task comments
            await tx.taskComment.deleteMany({ where: { projectId: id } });
            
            // 5. Delete other related records
            await tx.invoice.deleteMany({ where: { projectId: id } });
            await tx.timeEntry.deleteMany({ where: { projectId: id } });
            await tx.ticket.deleteMany({ where: { projectId: id } });
            await tx.userTask.deleteMany({ where: { projectId: id } });
            
            // 6. Finally delete the project itself
            await tx.project.delete({ where: { id } })
          })
          return ok(res, { deleted: true, message: 'Project deleted successfully' })
        } catch (dbError) {
          console.error('❌ Database error deleting project (with cascade):', dbError)
          console.error('❌ Error details:', {
            message: dbError.message,
            code: dbError.code,
            meta: dbError.meta,
            stack: dbError.stack
          })
          return serverError(res, 'Failed to delete project', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or project action')
  } catch (e) {
    return serverError(res, 'Project handler failed', e.message)
  }
}

export { saveDocumentSectionsToTable, saveWeeklyFMSReviewSectionsToTable, saveMonthlyFMSReviewSectionsToTable, documentSectionsToJson, weeklyFMSReviewSectionsToJson, monthlyFMSReviewSectionsToJson }
export default withHttp(withLogging(authRequired(handler)))
