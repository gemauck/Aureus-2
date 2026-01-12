/**
 * Check for statuses and comments in documentSections
 * Run: node scripts/check-statuses-comments.js [projectId]
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStatusesAndComments() {
  const projectId = process.argv[2] || 'cmhn2drtq001lqyu9bgfzzqx6';
  
  console.log('🔍 Checking Statuses and Comments in Document Sections\n');
  console.log('='.repeat(60));
  console.log(`Project ID: ${projectId}\n`);
  
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        documentSections: true
      }
    });
    
    if (!project) {
      console.log('❌ Project not found!\n');
      return;
    }
    
    console.log(`✅ Project: "${project.name}"\n`);
    
    if (!project.documentSections) {
      console.log('❌ No documentSections data found\n');
      return;
    }
    
    const parsed = typeof project.documentSections === 'string'
      ? JSON.parse(project.documentSections)
      : project.documentSections;
    
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.log('⚠️  Unexpected data format\n');
      return;
    }
    
    const years = Object.keys(parsed);
    console.log(`📅 Years found: ${years.join(', ')}\n`);
    
    let totalStatuses = 0;
    let totalComments = 0;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    years.forEach(year => {
      const sections = parsed[year] || [];
      console.log(`\n📂 Year ${year}: ${sections.length} section(s)`);
      
      sections.forEach((section, sectionIdx) => {
        console.log(`\n   Section ${sectionIdx + 1}: "${section.name}"`);
        const documents = section.documents || [];
        console.log(`   Documents: ${documents.length}`);
        
        documents.forEach((doc, docIdx) => {
          let docStatuses = 0;
          let docComments = 0;
          const statusDetails = [];
          const commentDetails = [];
          
          months.forEach((month, monthIdx) => {
            const monthName = month.charAt(0).toUpperCase() + month.slice(1);
            
            // Check status
            if (doc.statuses && doc.statuses[month]) {
              docStatuses++;
              totalStatuses++;
              statusDetails.push(`${monthName}=${doc.statuses[month]}`);
            }
            
            // Check comments
            if (doc.comments && doc.comments[month] && Array.isArray(doc.comments[month])) {
              const commentCount = doc.comments[month].length;
              if (commentCount > 0) {
                docComments += commentCount;
                totalComments += commentCount;
                commentDetails.push(`${monthName}=${commentCount} comment(s)`);
              }
            }
          });
          
          if (docStatuses > 0 || docComments > 0) {
            console.log(`\n      📄 Document "${doc.name}":`);
            if (docStatuses > 0) {
              console.log(`         ✅ Statuses: ${docStatuses} month(s) - ${statusDetails.join(', ')}`);
            }
            if (docComments > 0) {
              console.log(`         💬 Comments: ${docComments} total - ${commentDetails.join(', ')}`);
            }
          }
        });
      });
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   Total Status Changes: ${totalStatuses}`);
    console.log(`   Total Comments: ${totalComments}`);
    
    if (totalStatuses === 0 && totalComments === 0) {
      console.log('\n⚠️  No statuses or comments found in the data.');
      console.log('   This could mean:');
      console.log('   1. No documents have been added yet');
      console.log('   2. No statuses/comments have been set yet');
      console.log('   3. The data structure is different than expected');
    } else {
      console.log('\n✅ Statuses and comments ARE being saved to the database!');
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('connection')) {
      console.error('\n⚠️  Database connection issue.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkStatusesAndComments();

