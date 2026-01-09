import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('🔍 Searching for Barberton project and checking for data recovery options...\n');
    
    // Find Barberton project
    const project = await prisma.project.findFirst({
      where: { name: { contains: 'Barberton', mode: 'insensitive' } },
      select: { 
        id: true, 
        name: true, 
        weeklyFMSReviewSections: true,
        documentSections: true,
        updatedAt: true
      }
    });
    
    if (!project) {
      console.log('❌ Project not found');
      await prisma.$disconnect();
      return;
    }
    
    console.log('Project ID:', project.id);
    console.log('Project Name:', project.name);
    console.log('Last Updated:', project.updatedAt);
    console.log('\n--- Checking weeklyFMSReviewSections ---');
    
    let weeklyData = {};
    if (project.weeklyFMSReviewSections) {
      if (typeof project.weeklyFMSReviewSections === 'string') {
        try {
          weeklyData = JSON.parse(project.weeklyFMSReviewSections);
        } catch (e) {
          console.log('Parse error:', e.message);
        }
      } else {
        weeklyData = project.weeklyFMSReviewSections;
      }
    }
    const weeklyYears = Object.keys(weeklyData || {});
    console.log('Years:', weeklyYears);
    
    console.log('\n--- Checking documentSections (fallback) ---');
    let docData = {};
    if (project.documentSections) {
      if (typeof project.documentSections === 'string') {
        try {
          docData = JSON.parse(project.documentSections);
        } catch (e) {
          console.log('Parse error:', e.message);
        }
      } else {
        docData = project.documentSections;
      }
    }
    const docYears = Object.keys(docData || {});
    console.log('Years:', docYears);
    
    // Check for 2026 in both
    const has2026Weekly = weeklyData['2026'] && Array.isArray(weeklyData['2026']) && weeklyData['2026'].length > 0;
    const has2026Doc = docData['2026'] && Array.isArray(docData['2026']) && docData['2026'].length > 0;
    
    if (has2026Weekly) {
      console.log(`\n✅ Found 2026 data in weeklyFMSReviewSections: ${weeklyData['2026'].length} sections`);
    } else if (has2026Doc) {
      console.log(`\n✅ Found 2026 data in documentSections: ${docData['2026'].length} sections`);
      console.log('⚠️ Data is in wrong field - needs to be moved to weeklyFMSReviewSections');
    } else {
      console.log('\n❌ No 2026 data found in either field');
      
      // Check all years for any data
      if (weeklyYears.length > 0) {
        console.log('\nYears with data in weeklyFMSReviewSections:');
        weeklyYears.forEach(year => {
          const sections = weeklyData[year];
          if (Array.isArray(sections)) {
            console.log(`  ${year}: ${sections.length} sections`);
          }
        });
      }
      
      if (docYears.length > 0) {
        console.log('\nYears with data in documentSections:');
        docYears.forEach(year => {
          const sections = docData[year];
          if (Array.isArray(sections)) {
            console.log(`  ${year}: ${sections.length} sections`);
          }
        });
      }
    }
    
    // Check for any other projects with weekly FMS review data that might have similar structure
    console.log('\n--- Checking other projects for reference structure ---');
    const allProjects = await prisma.project.findMany({
      where: {
        hasWeeklyFMSReviewProcess: true,
        NOT: { id: project.id }
      },
      select: {
        id: true,
        name: true,
        weeklyFMSReviewSections: true
      },
      take: 5
    });
    
    console.log(`Found ${allProjects.length} other projects with weekly FMS review process`);
    allProjects.forEach(p => {
      if (p.weeklyFMSReviewSections) {
        try {
          const data = typeof p.weeklyFMSReviewSections === 'string' 
            ? JSON.parse(p.weeklyFMSReviewSections) 
            : p.weeklyFMSReviewSections;
          const years = Object.keys(data || {});
          if (years.length > 0) {
            console.log(`  ${p.name}: ${years.length} year(s) - ${years.join(', ')}`);
          }
        } catch (e) {
          // Skip
        }
      }
    });
    
    console.log('\n--- Recovery Instructions ---');
    console.log('1. Check browser localStorage:');
    console.log(`   localStorage.getItem('weeklyFMSReviewSnapshot_${project.id}')`);
    console.log('\n2. If data found in localStorage, restore with:');
    console.log(`   window.DatabaseAPI.updateProject('${project.id}', { weeklyFMSReviewSections: '<snapshot_data>' })`);
    console.log('\n3. If data found in documentSections, move it with:');
    console.log(`   window.DatabaseAPI.updateProject('${project.id}', { weeklyFMSReviewSections: project.documentSections })`);
    
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await prisma.$disconnect();
  }
})();

