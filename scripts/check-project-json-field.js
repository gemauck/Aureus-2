/**
 * Check if documentSections is saved in Project table's JSON field
 * Run: node scripts/check-project-json-field.js [projectId]
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProjectJSONField() {
  const projectId = process.argv[2] || 'cmhn2drtq001lqyu9bgfzzqx6';
  
  console.log('🔍 Checking Project Table JSON Field\n');
  console.log('='.repeat(60));
  console.log(`Project ID: ${projectId}\n`);
  
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        documentSections: true,
        weeklyFMSReviewSections: true
      }
    });
    
    if (!project) {
      console.log('❌ Project not found!\n');
      return;
    }
    
    console.log(`✅ Project found: "${project.name}"\n`);
    
    // Check documentSections JSON field
    console.log('📄 Document Sections (JSON field):');
    if (!project.documentSections) {
      console.log('   ❌ Field is null or empty');
    } else {
      const jsonStr = typeof project.documentSections === 'string' 
        ? project.documentSections 
        : JSON.stringify(project.documentSections);
      const jsonLength = jsonStr.length;
      
      console.log(`   ✅ Field has data (${jsonLength} characters)`);
      
      if (jsonLength > 10) {
        try {
          const parsed = typeof project.documentSections === 'string'
            ? JSON.parse(project.documentSections)
            : project.documentSections;
          
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            const years = Object.keys(parsed);
            console.log(`   📅 Years: ${years.length > 0 ? years.join(', ') : 'none'}`);
            
            let totalSections = 0;
            let totalDocuments = 0;
            years.forEach(year => {
              const yearSections = parsed[year] || [];
              totalSections += yearSections.length;
              yearSections.forEach(section => {
                totalDocuments += (section.documents || []).length;
              });
            });
            
            console.log(`   📊 Sections: ${totalSections}`);
            console.log(`   📄 Documents: ${totalDocuments}`);
            
            // Show preview with statuses and comments
            if (years.length > 0) {
              const firstYear = years[0];
              const firstYearSections = parsed[firstYear] || [];
              if (firstYearSections.length > 0) {
                console.log(`\n   Preview (${firstYear}):`);
                firstYearSections.slice(0, 3).forEach((section, idx) => {
                  console.log(`      ${idx + 1}. "${section.name}" (${(section.documents || []).length} documents)`);
                  
                  // Check documents for statuses and comments
                  const documents = section.documents || [];
                  documents.forEach((doc, docIdx) => {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    let hasStatus = false;
                    let hasComment = false;
                    
                    months.forEach((month, monthIdx) => {
                      const monthKey = month.toLowerCase();
                      if (doc.statuses && doc.statuses[monthKey]) {
                        hasStatus = true;
                      }
                      if (doc.comments && doc.comments[monthKey] && doc.comments[monthKey].length > 0) {
                        hasComment = true;
                      }
                    });
                    
                    if (hasStatus || hasComment) {
                      console.log(`         └─ Document "${doc.name}":`);
                      if (hasStatus) {
                        const statusMonths = [];
                        months.forEach((month, monthIdx) => {
                          const monthKey = month.toLowerCase();
                          if (doc.statuses && doc.statuses[monthKey]) {
                            statusMonths.push(`${month}=${doc.statuses[monthKey]}`);
                          }
                        });
                        console.log(`            Statuses: ${statusMonths.join(', ')}`);
                      }
                      if (hasComment) {
                        const commentCounts = [];
                        months.forEach((month, monthIdx) => {
                          const monthKey = month.toLowerCase();
                          if (doc.comments && doc.comments[monthKey] && doc.comments[monthKey].length > 0) {
                            commentCounts.push(`${month}=${doc.comments[monthKey].length}`);
                          }
                        });
                        console.log(`            Comments: ${commentCounts.join(', ')}`);
                      }
                    }
                  });
                });
              }
            }
          } else if (Array.isArray(parsed)) {
            console.log(`   📊 Sections (legacy array): ${parsed.length}`);
          }
        } catch (e) {
          console.log(`   ⚠️  Could not parse JSON: ${e.message}`);
          console.log(`   Preview: ${jsonStr.substring(0, 200)}...`);
        }
      } else {
        console.log(`   Content: "${jsonStr}"`);
      }
    }
    
    // Check weeklyFMSReviewSections JSON field
    console.log('\n📄 Weekly FMS Review Sections (JSON field):');
    if (!project.weeklyFMSReviewSections) {
      console.log('   ❌ Field is null or empty');
    } else {
      const jsonStr = typeof project.weeklyFMSReviewSections === 'string' 
        ? project.weeklyFMSReviewSections 
        : JSON.stringify(project.weeklyFMSReviewSections);
      const jsonLength = jsonStr.length;
      
      console.log(`   ✅ Field has data (${jsonLength} characters)`);
      
      if (jsonLength > 10) {
        try {
          const parsed = typeof project.weeklyFMSReviewSections === 'string'
            ? JSON.parse(project.weeklyFMSReviewSections)
            : project.weeklyFMSReviewSections;
          
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            const years = Object.keys(parsed);
            console.log(`   📅 Years: ${years.length > 0 ? years.join(', ') : 'none'}`);
          }
        } catch (e) {
          console.log(`   ⚠️  Could not parse JSON: ${e.message}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Check complete!\n');
    console.log('💡 Note: If JSON field has data, saves ARE working.');
    console.log('   The table might not exist yet (migration not run),');
    console.log('   but data is persisting in the JSON field.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('connection')) {
      console.error('\n⚠️  Database connection issue. Too many connections open.');
      console.error('   This is a temporary issue, not a data persistence problem.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkProjectJSONField();

