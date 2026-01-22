/**
 * Migration Script: Convert JSON checklists to table-based structure
 * 
 * This script migrates:
 * - documentSections (JSON) -> DocumentSection, DocumentItem, DocumentItemStatus, DocumentItemComment
 * - weeklyFMSReviewSections (JSON) -> WeeklyFMSReviewSection, WeeklyFMSReviewItem, WeeklyFMSReviewItemStatus, WeeklyFMSReviewItemComment
 * 
 * Usage: node scripts/migrate-checklists-to-tables.js [--dry-run] [--project-id=ID]
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const projectIdArg = args.find(arg => arg.startsWith('--project-id='));
const projectIdFilter = projectIdArg ? projectIdArg.split('=')[1] : null;

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be saved\n');
}

/**
 * Parse year-month key (e.g., "2024-01" or "2024-1")
 */
function parseYearMonth(key) {
  const parts = String(key).split('-');
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  return null;
}

/**
 * Parse year-month-week key (e.g., "2024-01-W1" or "2024-1-W1")
 */
function parseYearMonthWeek(key) {
  const parts = String(key).split('-');
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const weekMatch = parts[2]?.match(/W?(\d+)/);
    if (weekMatch) {
      const week = parseInt(weekMatch[1], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(week) && month >= 1 && month <= 12 && week >= 1 && week <= 5) {
        return { year, month, week };
      }
    }
  }
  return null;
}

/**
 * Migrate document sections from JSON to tables
 */
async function migrateDocumentSections(project, stats) {
  if (!project.documentSections || project.documentSections === '[]' || project.documentSections.trim() === '') {
    return;
  }

  try {
    let sections = project.documentSections;
    
    // Parse JSON
    if (typeof sections === 'string') {
      sections = JSON.parse(sections);
    }

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10);
        if (isNaN(year) || year < 1900 || year > 3000) {
          console.warn(`⚠️  Invalid year in documentSections for project ${project.id}: ${yearStr}`);
          continue;
        }

        if (!Array.isArray(yearSections)) {
          continue;
        }

        for (let i = 0; i < yearSections.length; i++) {
          const section = yearSections[i];
          if (!section || !section.name) {
            continue;
          }

          if (isDryRun) {
            stats.documentSections.created++;
            stats.documentItems.created += (section.documents || []).length;
            continue;
          }

          // Create section
          const dbSection = await prisma.documentSection.create({
            data: {
              projectId: project.id,
              year: year,
              name: section.name || '',
              description: section.description || '',
              order: i,
              documents: {
                create: (section.documents || []).map((doc, docIdx) => {
                  // Parse statuses from collectionStatus object
                  const statuses = [];
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      const parsed = parseYearMonth(key);
                      if (parsed) {
                        statuses.push({
                          year: parsed.year,
                          month: parsed.month,
                          status: String(status || 'pending')
                        });
                      }
                    }
                  }

                  // Parse comments from comments object
                  const comments = [];
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parsed = parseYearMonth(key);
                      if (parsed) {
                        const commentList = Array.isArray(commentArray) ? commentArray : [commentArray];
                        for (const comment of commentList) {
                          if (comment && (comment.text || comment)) {
                            comments.push({
                              year: parsed.year,
                              month: parsed.month,
                              text: comment.text || String(comment),
                              author: comment.author || comment.authorName || '',
                              authorId: comment.authorId || null
                            });
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
                    statuses: {
                      create: statuses
                    },
                    comments: {
                      create: comments
                    }
                  };
                })
              }
            }
          });

          stats.documentSections.created++;
          stats.documentItems.created += (section.documents || []).length;
        }
      }
    } else if (Array.isArray(sections)) {
      // Legacy flat array - assign to current year
      const currentYear = new Date().getFullYear();
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section || !section.name) {
          continue;
        }

        if (isDryRun) {
          stats.documentSections.created++;
          stats.documentItems.created += (section.documents || []).length;
          continue;
        }

        const dbSection = await prisma.documentSection.create({
          data: {
            projectId: project.id,
            year: currentYear,
            name: section.name || '',
            description: section.description || '',
            order: i,
            documents: {
              create: (section.documents || []).map((doc, docIdx) => {
                const statuses = [];
                if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                  for (const [key, status] of Object.entries(doc.collectionStatus)) {
                    const parsed = parseYearMonth(key);
                    if (parsed) {
                      statuses.push({
                        year: parsed.year,
                        month: parsed.month,
                        status: String(status || 'pending')
                      });
                    }
                  }
                }

                const comments = [];
                if (doc.comments && typeof doc.comments === 'object') {
                  for (const [key, commentArray] of Object.entries(doc.comments)) {
                    const parsed = parseYearMonth(key);
                    if (parsed) {
                      const commentList = Array.isArray(commentArray) ? commentArray : [commentArray];
                      for (const comment of commentList) {
                        if (comment && (comment.text || comment)) {
                          comments.push({
                            year: parsed.year,
                            month: parsed.month,
                            text: comment.text || String(comment),
                            author: comment.author || comment.authorName || '',
                            authorId: comment.authorId || null
                          });
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
                };
              })
            }
          }
        });

        stats.documentSections.created++;
        stats.documentItems.created += (section.documents || []).length;
      }
    }
  } catch (error) {
    console.error(`❌ Error migrating documentSections for project ${project.id}:`, error.message);
    stats.errors++;
  }
}

/**
 * Migrate weekly FMS review sections from JSON to tables
 */
async function migrateWeeklyFMSReviewSections(project, stats) {
  if (!project.weeklyFMSReviewSections || project.weeklyFMSReviewSections === '[]' || project.weeklyFMSReviewSections.trim() === '') {
    return;
  }

  try {
    let sections = project.weeklyFMSReviewSections;
    
    // Parse JSON
    if (typeof sections === 'string') {
      sections = JSON.parse(sections);
    }

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10);
        if (isNaN(year) || year < 1900 || year > 3000) {
          console.warn(`⚠️  Invalid year in weeklyFMSReviewSections for project ${project.id}: ${yearStr}`);
          continue;
        }

        if (!Array.isArray(yearSections)) {
          continue;
        }

        for (let i = 0; i < yearSections.length; i++) {
          const section = yearSections[i];
          if (!section || !section.name) {
            continue;
          }

          if (isDryRun) {
            stats.weeklyFMSReviewSections.created++;
            stats.weeklyFMSReviewItems.created += (section.documents || []).length;
            continue;
          }

          // Create section
          const dbSection = await prisma.weeklyFMSReviewSection.create({
            data: {
              projectId: project.id,
              year: year,
              name: section.name || '',
              description: section.description || '',
              order: i,
              items: {
                create: (section.documents || []).map((doc, docIdx) => {
                  // Parse statuses from collectionStatus object (year-month-week format)
                  const statuses = [];
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      const parsed = parseYearMonthWeek(key);
                      if (parsed) {
                        statuses.push({
                          year: parsed.year,
                          month: parsed.month,
                          week: parsed.week,
                          status: String(status || 'pending')
                        });
                      }
                    }
                  }

                  // Parse comments from comments object
                  const comments = [];
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parsed = parseYearMonthWeek(key);
                      if (parsed) {
                        const commentList = Array.isArray(commentArray) ? commentArray : [commentArray];
                        for (const comment of commentList) {
                          if (comment && (comment.text || comment)) {
                            comments.push({
                              year: parsed.year,
                              month: parsed.month,
                              week: parsed.week,
                              text: comment.text || String(comment),
                              author: comment.author || comment.authorName || '',
                              authorId: comment.authorId || null
                            });
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
                    statuses: {
                      create: statuses
                    },
                    comments: {
                      create: comments
                    }
                  };
                })
              }
            }
          });

          stats.weeklyFMSReviewSections.created++;
          stats.weeklyFMSReviewItems.created += (section.documents || []).length;
        }
      }
    } else if (Array.isArray(sections)) {
      // Legacy flat array - assign to current year
      const currentYear = new Date().getFullYear();
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section || !section.name) {
          continue;
        }

        if (isDryRun) {
          stats.weeklyFMSReviewSections.created++;
          stats.weeklyFMSReviewItems.created += (section.documents || []).length;
          continue;
        }

        const dbSection = await prisma.weeklyFMSReviewSection.create({
          data: {
            projectId: project.id,
            year: currentYear,
            name: section.name || '',
            description: section.description || '',
            order: i,
            items: {
              create: (section.documents || []).map((doc, docIdx) => {
                const statuses = [];
                if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                  for (const [key, status] of Object.entries(doc.collectionStatus)) {
                    const parsed = parseYearMonthWeek(key);
                    if (parsed) {
                      statuses.push({
                        year: parsed.year,
                        month: parsed.month,
                        week: parsed.week,
                        status: String(status || 'pending')
                      });
                    }
                  }
                }

                const comments = [];
                if (doc.comments && typeof doc.comments === 'object') {
                  for (const [key, commentArray] of Object.entries(doc.comments)) {
                    const parsed = parseYearMonthWeek(key);
                    if (parsed) {
                      const commentList = Array.isArray(commentArray) ? commentArray : [commentArray];
                      for (const comment of commentList) {
                        if (comment && (comment.text || comment)) {
                          comments.push({
                            year: parsed.year,
                            month: parsed.month,
                            week: parsed.week,
                            text: comment.text || String(comment),
                            author: comment.author || comment.authorName || '',
                            authorId: comment.authorId || null
                          });
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
                };
              })
            }
          }
        });

        stats.weeklyFMSReviewSections.created++;
        stats.weeklyFMSReviewItems.created += (section.documents || []).length;
      }
    }
  } catch (error) {
    console.error(`❌ Error migrating weeklyFMSReviewSections for project ${project.id}:`, error.message);
    stats.errors++;
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Starting checklist migration to table-based structure\n');

  const stats = {
    projects: { processed: 0, skipped: 0 },
    documentSections: { created: 0 },
    documentItems: { created: 0 },
    weeklyFMSReviewSections: { created: 0 },
    weeklyFMSReviewItems: { created: 0 },
    errors: 0
  };

  try {
    // Find projects with checklist data
    const whereClause = {
      OR: [
        { documentSections: { not: '[]' } },
        { weeklyFMSReviewSections: { not: '[]' } }
      ]
    };

    if (projectIdFilter) {
      whereClause.id = projectIdFilter;
    }

    const projects = await prisma.project.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        documentSections: true,
        weeklyFMSReviewSections: true
      }
    });

    console.log(`📊 Found ${projects.length} project(s) with checklist data\n`);

    for (const project of projects) {
      console.log(`📝 Processing project: ${project.name} (${project.id})`);

      // Check if already migrated
      const existingDocSections = await prisma.documentSection.count({
        where: { projectId: project.id }
      });
      const existingFMSections = await prisma.weeklyFMSReviewSection.count({
        where: { projectId: project.id }
      });

      if (existingDocSections > 0 || existingFMSections > 0) {
        console.log(`   ⏭️  Already has table data, skipping...`);
        stats.projects.skipped++;
        continue;
      }

      stats.projects.processed++;

      // Migrate document sections
      if (project.documentSections && project.documentSections !== '[]') {
        await migrateDocumentSections(project, stats);
      }

      // Migrate weekly FMS review sections
      if (project.weeklyFMSReviewSections && project.weeklyFMSReviewSections !== '[]') {
        await migrateWeeklyFMSReviewSections(project, stats);
      }
    }

    console.log('\n✅ Migration complete!\n');
    console.log('📊 Statistics:');
    console.log(`   Projects processed: ${stats.projects.processed}`);
    console.log(`   Projects skipped: ${stats.projects.skipped}`);
    console.log(`   Document sections created: ${stats.documentSections.created}`);
    console.log(`   Document items created: ${stats.documentItems.created}`);
    console.log(`   Weekly FMS review sections created: ${stats.weeklyFMSReviewSections.created}`);
    console.log(`   Weekly FMS review items created: ${stats.weeklyFMSReviewItems.created}`);
    console.log(`   Errors: ${stats.errors}`);

    if (isDryRun) {
      console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();














