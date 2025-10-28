// Script to fix opportunity stages in the database
// Run this with: node fix-opportunity-stages.js

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixOpportunityStages() {
  try {
    console.log('🔄 Fixing opportunity stages...');
    
    // Update opportunities with "prospect" or "new" stages to "Awareness"
    const prospectUpdate = await prisma.opportunity.updateMany({
      where: {
        stage: {
          in: ['prospect', 'new', '']
        }
      },
      data: {
        stage: 'Awareness'
      }
    });
    console.log(`✅ Updated ${prospectUpdate.count} opportunities from "prospect"/"new" to "Awareness"`);
    
    // Update opportunities with null stages
    const nullUpdate = await prisma.opportunity.updateMany({
      where: {
        stage: null
      },
      data: {
        stage: 'Awareness'
      }
    });
    console.log(`✅ Updated ${nullUpdate.count} opportunities with null stage to "Awareness"`);
    
    // Update opportunities with invalid stages
    const invalidUpdate = await prisma.opportunity.updateMany({
      where: {
        stage: {
          notIn: ['Awareness', 'Interest', 'Desire', 'Action']
        }
      },
      data: {
        stage: 'Awareness'
      }
    });
    console.log(`✅ Updated ${invalidUpdate.count} opportunities with invalid stages to "Awareness"`);
    
    // Show current stage distribution
    const stageCounts = await prisma.opportunity.groupBy({
      by: ['stage'],
      _count: {
        id: true
      }
    });
    
    console.log('\n📊 Current opportunity stage distribution:');
    stageCounts.forEach(({ stage, _count }) => {
      console.log(`   ${stage}: ${_count.id} opportunities`);
    });
    
    console.log('\n✅ Opportunity stages fixed successfully!');
  } catch (error) {
    console.error('❌ Error fixing opportunity stages:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixOpportunityStages();

