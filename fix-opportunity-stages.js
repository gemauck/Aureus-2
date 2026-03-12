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
        aidaStatus: {
          in: ['prospect', 'new', '']
        }
      },
      data: {
        aidaStatus: 'Awareness'
      }
    });
    console.log(`✅ Updated ${prospectUpdate.count} opportunities from "prospect"/"new" to "Awareness"`);
    
    // Update opportunities with null stages
    const nullUpdate = await prisma.opportunity.updateMany({
      where: {
        aidaStatus: null
      },
      data: {
        aidaStatus: 'Awareness'
      }
    });
    console.log(`✅ Updated ${nullUpdate.count} opportunities with null aidaStatus to "Awareness"`);
    
    // Update opportunities with invalid stages
    const invalidUpdate = await prisma.opportunity.updateMany({
      where: {
        aidaStatus: {
          notIn: ['Awareness', 'Interest', 'Desire', 'Action']
        }
      },
      data: {
        aidaStatus: 'Awareness'
      }
    });
    console.log(`✅ Updated ${invalidUpdate.count} opportunities with invalid aidaStatus to "Awareness"`);
    
    // Show current stage distribution
    const stageCounts = await prisma.opportunity.groupBy({
      by: ['aidaStatus'],
      _count: {
        id: true
      }
    });
    
    console.log('\n📊 Current opportunity aidaStatus distribution:');
    stageCounts.forEach(({ aidaStatus, _count }) => {
      console.log(`   ${aidaStatus}: ${_count.id} opportunities`);
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

