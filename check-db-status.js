import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStatus() {
  try {
    const projectId = 'cmhn2drtq001lqyu9bgfzzqx6';
    
    // Get the project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documentSectionsTable: {
          include: {
            documents: {
              include: {
                statuses: {
                  where: {
                    year: 2026,
                    month: 1
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (!project) {
      console.log('❌ Project not found');
      return;
    }
    
    console.log(`\n📋 Project: ${project.name}`);
    console.log(`📁 Sections: ${project.documentSectionsTable.length}`);
    
    // Find "Mining Right" document
    for (const section of project.documentSectionsTable) {
      for (const doc of section.documents) {
        if (doc.name.toLowerCase().includes('mining right')) {
          console.log(`\n📄 Document: ${doc.name}`);
          console.log(`   Section: ${section.name}`);
          console.log(`   Document ID: ${doc.id}`);
          
          // Check status for January 2026
          const status = doc.statuses.find(s => s.year === 2026 && s.month === 1);
          if (status) {
            console.log(`   ✅ Status found: ${status.status}`);
            console.log(`   📅 Updated: ${status.updatedAt}`);
          } else {
            console.log(`   ❌ No status found for January 2026`);
          }
          
          // Get all statuses for this document
          const allStatuses = await prisma.documentItemStatus.findMany({
            where: { itemId: doc.id }
          });
          
          console.log(`\n   All statuses for this document:`);
          allStatuses.forEach(s => {
            console.log(`   - ${s.year}-${String(s.month).padStart(2, '0')}: ${s.status}`);
          });
        }
      }
    }
    
    // Also check the JSON field
    console.log(`\n📦 documentSections JSON field (first 1000 chars):`);
    if (project.documentSections) {
      try {
        const jsonData = JSON.parse(project.documentSections);
        const jsonStr = JSON.stringify(jsonData, null, 2);
        console.log(jsonStr.substring(0, 1000));
        
        // Check for "Mining Right" in JSON
        const jsonStrFull = JSON.stringify(jsonData);
        if (jsonStrFull.toLowerCase().includes('mining right')) {
          console.log(`\n✅ Found "Mining Right" in JSON`);
          // Try to find the status
          const miningRightMatch = jsonStrFull.match(/"2026-01"[^}]*"collected"/i);
          if (miningRightMatch) {
            console.log(`✅ Found "collected" status for 2026-01`);
          } else {
            console.log(`❌ Did not find "collected" status for 2026-01 in JSON`);
          }
        }
      } catch (e) {
        console.log('Error parsing JSON:', e.message);
      }
    } else {
      console.log('No documentSections JSON field');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();
