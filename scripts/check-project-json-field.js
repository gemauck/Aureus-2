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
            
            // Show preview
            if (years.length > 0) {
              const firstYear = years[0];
              const firstYearSections = parsed[firstYear] || [];
              if (firstYearSections.length > 0) {
                console.log(`\n   Preview (${firstYear}):`);
                firstYearSections.slice(0, 3).forEach((section, idx) => {
                  console.log(`      ${idx + 1}. "${section.name}" (${(section.documents || []).length} documents)`);
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

