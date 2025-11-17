// Simple test script to verify progress tracker persistence
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPersistence() {
  try {
    console.log('🧪 Testing Progress Tracker Persistence...\n');

    // Get first project
    const projects = await prisma.project.findMany({
      take: 1
    });

    if (projects.length === 0) {
      console.log('❌ No projects found. Please create a project first.');
      return;
    }

    const project = projects[0];
    console.log(`✅ Found project: ${project.name} (ID: ${project.id})\n`);

    // Test data
    const testData = {
      'November-2025': {
        compliance: 'https://test-compliance-link.com',
        data: 'https://test-data-link.com',
        comments: 'Test comment - ' + new Date().toISOString()
      }
    };

    console.log('📝 Test data to save:');
    console.log(JSON.stringify(testData, null, 2));
    console.log('');

    // Save to database
    console.log('💾 Saving to database...');
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        monthlyProgress: JSON.stringify(testData)
      }
    });

    console.log('✅ Saved successfully!\n');

    // Read back from database
    console.log('📖 Reading back from database...');
    const readBack = await prisma.project.findUnique({
      where: { id: project.id },
      select: { monthlyProgress: true }
    });

    let parsedData = {};
    if (readBack.monthlyProgress) {
      try {
        parsedData = typeof readBack.monthlyProgress === 'string' 
          ? JSON.parse(readBack.monthlyProgress)
          : readBack.monthlyProgress;
      } catch (e) {
        console.error('❌ Failed to parse:', e);
      }
    }

    console.log('📋 Data read back:');
    console.log(JSON.stringify(parsedData, null, 2));
    console.log('');

    // Verify
    const savedComments = parsedData['November-2025']?.comments;
    const expectedComments = testData['November-2025'].comments;

    if (savedComments === expectedComments) {
      console.log('✅ PERSISTENCE TEST PASSED!');
      console.log(`   Expected: "${expectedComments}"`);
      console.log(`   Got: "${savedComments}"`);
    } else {
      console.log('❌ PERSISTENCE TEST FAILED!');
      console.log(`   Expected: "${expectedComments}"`);
      console.log(`   Got: "${savedComments}"`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPersistence();




