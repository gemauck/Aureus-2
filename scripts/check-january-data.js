/**
 * Check for January data across all years (2024, 2025, 2026)
 * Usage: node scripts/check-january-data.js
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkJanuaryData() {
  console.log('🔍 Checking for January Checklist Data\n');
  console.log('='.repeat(80));
  
  try {
    // Check table data for January statuses across all years
    const januaryStatuses = await prisma.monthlyFMSReviewItemStatus.findMany({
      where: {
        month: 1 // January
      },
      include: {
        item: {
          include: {
            section: {
              include: {
                project: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { year: 'desc' },
        { item: { section: { project: { name: 'asc' } } } }
      ]
    });

    console.log(`\n📊 Found ${januaryStatuses.length} January status entries in table\n`);

    if (januaryStatuses.length === 0) {
      console.log('❌ No January data found in table!\n');
      console.log('🔍 Checking JSON fields for recovery...\n');
      
      // Check all projects with monthlyFMSReviewSections
      const projects = await prisma.project.findMany({
        where: {
          monthlyFMSReviewSections: { not: null }
        },
        select: {
          id: true,
          name: true,
          monthlyFMSReviewSections: true
        }
      });

      let foundInJson = false;
      for (const project of projects) {
        if (!project.monthlyFMSReviewSections) continue;
        
        try {
          const jsonData = typeof project.monthlyFMSReviewSections === 'string'
            ? JSON.parse(project.monthlyFMSReviewSections)
            : project.monthlyFMSReviewSections;

          if (typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            for (const [yearStr, yearSections] of Object.entries(jsonData)) {
              if (!Array.isArray(yearSections)) continue;
              
              for (const section of yearSections) {
                if (!section.documents) continue;
                
                for (const doc of section.documents) {
                  if (doc.collectionStatus) {
                    for (const [key, status] of Object.entries(doc.collectionStatus)) {
                      const parts = key.split('-');
                      if (parts.length >= 2 && parseInt(parts[1], 10) === 1) {
                        if (!foundInJson) {
                          console.log('✅ Found January data in JSON fields:\n');
                          foundInJson = true;
                        }
                        console.log(`   📁 ${project.name} (${project.id})`);
                        console.log(`      Year: ${parts[0]}, Status: ${status}`);
                        console.log(`      Document: "${doc.name}" in "${section.name}"\n`);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // Skip parsing errors
        }
      }

      if (!foundInJson) {
        console.log('❌ No January data found in JSON fields either.\n');
        console.log('💡 The data may have been lost. Check browser localStorage or database backups.\n');
      }
    } else {
      // Group by project and year
      const byProject = {};
      for (const status of januaryStatuses) {
        const projectId = status.item.section.project.id;
        const projectName = status.item.section.project.name;
        const year = status.year;
        
        if (!byProject[projectId]) {
          byProject[projectId] = {
            name: projectName,
            years: {}
          };
        }
        
        if (!byProject[projectId].years[year]) {
          byProject[projectId].years[year] = [];
        }
        
        byProject[projectId].years[year].push({
          status: status.status,
          document: status.item.name,
          section: status.item.section.name
        });
      }

      console.log('📊 January Data by Project:\n');
      for (const [projectId, data] of Object.entries(byProject)) {
        console.log(`📁 ${data.name} (${projectId})`);
        for (const [year, statuses] of Object.entries(data.years)) {
          console.log(`   📅 ${year}: ${statuses.length} January status(es)`);
          statuses.slice(0, 5).forEach(({ status, document, section }) => {
            console.log(`      - "${document}" in "${section}": ${status}`);
          });
          if (statuses.length > 5) {
            console.log(`      ... and ${statuses.length - 5} more`);
          }
        }
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('\n✅ Check complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkJanuaryData();

