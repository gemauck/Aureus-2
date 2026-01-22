/**
 * Recover lost monthly FMS review data from JSON field
 * This script checks the JSON field and restores any missing data to the table
 * 
 * Usage: node scripts/recover-monthly-review-data.js [projectId]
 * If no projectId is provided, it will scan all projects
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function restoreDataToTable(projectId, jsonData) {
  let sections = jsonData;
  if (typeof jsonData === 'string') {
    try {
      sections = JSON.parse(jsonData);
    } catch (parseError) {
      throw new Error(`Invalid JSON: ${parseError.message}`);
    }
  }

  if (!sections || (typeof sections === 'object' && Object.keys(sections).length === 0)) {
    console.log('   ⚠️  Empty sections data, nothing to restore');
    return 0;
  }

  // Use transaction for safety
  return await prisma.$transaction(async (tx) => {
    // Determine which years are being restored
    const yearsToUpdate = new Set();
    
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      for (const yearStr of Object.keys(sections)) {
        const year = parseInt(yearStr, 10);
        if (!isNaN(year) && year >= 1900 && year <= 3000) {
          yearsToUpdate.add(year);
        }
      }
    } else if (Array.isArray(sections)) {
      const currentYear = new Date().getFullYear();
      yearsToUpdate.add(currentYear);
    }

    // Only delete sections for the years being restored
    if (yearsToUpdate.size > 0) {
      const deletedCount = await tx.monthlyFMSReviewSection.deleteMany({
        where: { 
          projectId,
          year: { in: Array.from(yearsToUpdate) }
        }
      });
      console.log(`   🗑️  Deleted ${deletedCount.count} existing sections for years: ${Array.from(yearsToUpdate).join(', ')}`);
    }

    let totalSectionsCreated = 0;

    // Handle year-based structure: { "2024": [...], "2025": [...] }
    if (typeof sections === 'object' && !Array.isArray(sections)) {
      for (const [yearStr, yearSections] of Object.entries(sections)) {
        const year = parseInt(yearStr, 10);
        if (isNaN(year) || year < 1900 || year > 3000) {
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
                    const statuses = [];
                    const statusMap = new Map();
                    if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                      for (const [key, status] of Object.entries(doc.collectionStatus)) {
                        const parts = key.split('-');
                        if (parts.length >= 2) {
                          const statusYear = parseInt(parts[0], 10);
                          const month = parseInt(parts[1], 10);
                          if (!isNaN(statusYear) && !isNaN(month) && month >= 1 && month <= 12) {
                            const statusKey = `${statusYear}-${month}`;
                            statusMap.set(statusKey, {
                              year: statusYear,
                              month,
                              status: String(status || 'pending')
                            });
                          }
                        }
                      }
                    }
                    statuses.push(...Array.from(statusMap.values()));

                    const comments = [];
                    if (doc.comments && typeof doc.comments === 'object') {
                      for (const [key, commentArray] of Object.entries(doc.comments)) {
                        const parts = key.split('-');
                        if (parts.length >= 2) {
                          const commentYear = parseInt(parts[0], 10);
                          const month = parseInt(parts[1], 10);
                          if (!isNaN(commentYear) && !isNaN(month) && month >= 1 && month <= 12) {
                            const commentList = Array.isArray(commentArray) ? commentArray : [commentArray];
                            for (const comment of commentList) {
                              if (comment && (comment.text || comment)) {
                                comments.push({
                                  year: commentYear,
                                  month,
                                  text: comment.text || String(comment),
                                  author: comment.author || comment.authorName || '',
                                  authorId: comment.authorId || null
                                });
                              }
                            }
                          }
                        }
                      }
                    }

                    const itemData = {
                      name: doc.name || '',
                      description: doc.description || '',
                      required: doc.required || false,
                      order: docIdx
                    };
                    
                    if (statuses.length > 0) {
                      itemData.statuses = { create: statuses };
                    }
                    
                    if (comments.length > 0) {
                      itemData.comments = { create: comments };
                    }
                    
                    return itemData;
                  })
                }
              }
            });
            totalSectionsCreated++;
          } catch (createError) {
            console.error(`   ❌ Error creating section "${section.name}": ${createError.message}`);
            throw createError;
          }
        }
      }
    } else if (Array.isArray(sections)) {
      // Legacy array format
      const currentYear = new Date().getFullYear();
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section || !section.name) {
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
                  const statuses = [];
                  const statusMap = new Map();
                  if (doc.collectionStatus && typeof doc.collectionStatus === 'object') {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      const parts = key.split('-');
                      if (parts.length >= 2) {
                        const statusYear = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10);
                        if (!isNaN(statusYear) && !isNaN(month) && month >= 1 && month <= 12) {
                          const statusKey = `${statusYear}-${month}`;
                          statusMap.set(statusKey, {
                            year: statusYear,
                            month,
                            status: String(status || 'pending')
                          });
                        }
                      }
                    }
                  }
                  statuses.push(...Array.from(statusMap.values()));

                  const comments = [];
                  if (doc.comments && typeof doc.comments === 'object') {
                    for (const [key, commentArray] of Object.entries(doc.comments)) {
                      const parts = key.split('-');
                      if (parts.length >= 2) {
                        const commentYear = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10);
                        if (!isNaN(commentYear) && !isNaN(month) && month >= 1 && month <= 12) {
                          const commentList = Array.isArray(commentArray) ? commentArray : [commentArray];
                          for (const comment of commentList) {
                            if (comment && (comment.text || comment)) {
                              comments.push({
                                year: commentYear,
                                month,
                                text: comment.text || String(comment),
                                author: comment.author || comment.authorName || '',
                                authorId: comment.authorId || null
                              });
                            }
                          }
                        }
                      }
                    }
                  }

                  const itemData = {
                    name: doc.name || '',
                    description: doc.description || '',
                    required: doc.required || false,
                    order: docIdx
                  };
                  
                  if (statuses.length > 0) {
                    itemData.statuses = { create: statuses };
                  }
                  
                  if (comments.length > 0) {
                    itemData.comments = { create: comments };
                  }
                  
                  return itemData;
                })
              }
            }
          });
          totalSectionsCreated++;
        } catch (createError) {
          console.error(`   ❌ Error creating section "${section.name}": ${createError.message}`);
          throw createError;
        }
      }
    }

    return totalSectionsCreated;
  });
}

async function recoverMonthlyReviewData(projectId = null) {
  console.log('🔍 Monthly FMS Review Data Recovery Tool\n');
  console.log('='.repeat(80));
  
  try {
    // Check if table exists
    try {
      await prisma.$queryRaw`SELECT 1 FROM "MonthlyFMSReviewSection" LIMIT 1`;
    } catch (e) {
      console.log('⚠️  MonthlyFMSReviewSection table does not exist yet.');
      console.log('   The data may still be in the JSON field and will be accessible once the table is created.\n');
      return;
    }

    // Get projects to check
    let projects;
    if (projectId) {
      const project = await prisma.project.findUnique({ 
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          monthlyFMSReviewSections: true
        }
      });
      projects = project ? [project] : [];
    } else {
      // Get all projects and filter for those with monthlyFMSReviewSections
      const allProjects = await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          monthlyFMSReviewSections: true
        }
      });
      projects = allProjects.filter(p => p.monthlyFMSReviewSections !== null && p.monthlyFMSReviewSections !== '{}' && p.monthlyFMSReviewSections !== '');
    }

    if (!projects || projects.length === 0 || projects.every(p => !p)) {
      console.log('❌ No projects found with monthlyFMSReviewSections data\n');
      return;
    }

    const validProjects = projects.filter(p => p !== null);
    console.log(`📊 Found ${validProjects.length} project(s) to check\n`);

    let totalRecovered = 0;
    let totalProjectsChecked = 0;

    for (const project of validProjects) {
      totalProjectsChecked++;
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📁 Project: ${project.name || 'Unnamed'} (${project.id})`);
      console.log(`${'─'.repeat(80)}\n`);

      // Check JSON field
      if (!project.monthlyFMSReviewSections) {
        console.log('   ⚠️  No JSON field data found');
        continue;
      }

      // Parse JSON field
      let jsonData = null;
      try {
        jsonData = typeof project.monthlyFMSReviewSections === 'string'
          ? JSON.parse(project.monthlyFMSReviewSections)
          : project.monthlyFMSReviewSections;
      } catch (e) {
        console.log(`   ❌ Failed to parse JSON field: ${e.message}`);
        continue;
      }

      if (!jsonData || (typeof jsonData === 'object' && Object.keys(jsonData).length === 0)) {
        console.log('   ⚠️  JSON field is empty');
        continue;
      }

      // Analyze JSON data
      console.log('   📊 Analyzing JSON field data...');
      
      const years = typeof jsonData === 'object' && !Array.isArray(jsonData)
        ? Object.keys(jsonData)
        : ['current'];
      
      console.log(`   📅 Years found: ${years.join(', ')}`);

      // Check for January data specifically
      let hasJanuaryData = false;
      let januaryStatuses = [];

      if (typeof jsonData === 'object' && !Array.isArray(jsonData)) {
        for (const [yearStr, yearSections] of Object.entries(jsonData)) {
          if (!Array.isArray(yearSections)) continue;
          
          for (const section of yearSections) {
            if (!section.documents) continue;
            
            for (const doc of section.documents) {
              if (doc.collectionStatus) {
                // Check for January statuses (format: "2024-01", "2025-01", etc.)
                for (const [key, status] of Object.entries(doc.collectionStatus)) {
                  const parts = key.split('-');
                  if (parts.length >= 2) {
                    const month = parseInt(parts[1], 10);
                    if (month === 1) { // January
                      hasJanuaryData = true;
                      januaryStatuses.push({
                        year: parts[0],
                        month: '01',
                        status: status,
                        document: doc.name,
                        section: section.name
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (hasJanuaryData) {
        console.log(`   ✅ Found January data! (${januaryStatuses.length} status entries)`);
        januaryStatuses.slice(0, 10).forEach(({ year, status, document, section }) => {
          console.log(`      - ${year}-01: "${document}" in "${section}" = ${status}`);
        });
        if (januaryStatuses.length > 10) {
          console.log(`      ... and ${januaryStatuses.length - 10} more`);
        }
      } else {
        console.log('   ⚠️  No January data found in JSON field');
      }

      // Check what's in the table
      console.log('\n   📊 Checking table data...');
      try {
        const tableSections = await prisma.monthlyFMSReviewSection.findMany({
          where: { projectId: project.id },
          include: {
            items: {
              include: {
                statuses: {
                  where: { month: 1 } // January
                }
              }
            }
          }
        });

        const tableYears = [...new Set(tableSections.map(s => s.year))];
        const tableJanuaryCount = tableSections.reduce((sum, section) => {
          return sum + section.items.reduce((itemSum, item) => {
            return itemSum + item.statuses.filter(s => s.month === 1).length;
          }, 0);
        }, 0);

        console.log(`   📅 Table years: ${tableYears.length > 0 ? tableYears.join(', ') : 'none'}`);
        console.log(`   📊 January statuses in table: ${tableJanuaryCount}`);

        // Determine if recovery is needed
        if (hasJanuaryData && tableJanuaryCount === 0) {
          console.log('\n   🔄 RECOVERY NEEDED: January data exists in JSON but not in table!');
          console.log('   💾 Restoring data to table...\n');

          try {
            const restoredCount = await restoreDataToTable(project.id, project.monthlyFMSReviewSections);
            console.log(`   ✅ Successfully restored ${restoredCount} sections to table!`);
            totalRecovered++;
          } catch (recoveryError) {
            console.error(`   ❌ Recovery failed: ${recoveryError.message}`);
            if (recoveryError.stack) {
              console.error(`   Stack: ${recoveryError.stack.split('\n').slice(0, 3).join('\n')}`);
            }
          }
        } else if (hasJanuaryData && tableJanuaryCount > 0) {
          console.log('\n   ✅ Data already in table - no recovery needed');
        } else if (!hasJanuaryData) {
          console.log('\n   ⚠️  No January data found in JSON field - cannot recover');
        } else {
          // Table has some data, but might be incomplete - offer to restore anyway
          console.log('\n   ⚠️  Table has some data, but JSON field may have more complete data');
          console.log('   💡 To force restore from JSON field, run with --force flag');
        }
      } catch (tableError) {
        console.log(`   ⚠️  Could not check table: ${tableError.message}`);
        
        // If table check fails but JSON has data, try to save anyway
        if (hasJanuaryData) {
          console.log('   💾 Attempting to save to table anyway...');
          try {
            const restoredCount = await restoreDataToTable(project.id, project.monthlyFMSReviewSections);
            console.log(`   ✅ Successfully restored ${restoredCount} sections to table!`);
            totalRecovered++;
          } catch (saveError) {
            console.error(`   ❌ Save failed: ${saveError.message}`);
          }
        }
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`\n📊 Recovery Summary:`);
    console.log(`   Projects checked: ${totalProjectsChecked}`);
    console.log(`   Projects recovered: ${totalRecovered}`);
    console.log(`\n✅ Recovery process complete!\n`);

  } catch (error) {
    console.error('\n❌ Error during recovery:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Get project ID from command line or scan all
const projectId = process.argv[2] || null;
recoverMonthlyReviewData(projectId);
