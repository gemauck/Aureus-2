// Check if job cards exist in the database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJobCards() {
  try {
    console.log('🔍 Checking job cards in database...');
    
    // Count total job cards
    const totalCount = await prisma.jobCard.count();
    console.log(`📊 Total job cards in database: ${totalCount}`);
    
    if (totalCount > 0) {
      // Get all job cards
      const allJobCards = await prisma.jobCard.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          jobCardNumber: true,
          clientId: true,
          clientName: true,
          status: true,
          createdAt: true
        }
      });
      
      console.log('\n📋 Sample job cards:');
      allJobCards.forEach(jc => {
        console.log(`  - ${jc.jobCardNumber}: clientId=${jc.clientId || 'null'}, clientName="${jc.clientName}", status=${jc.status}`);
      });
      
      // Check for AccuFarm specifically
      const accuFarmCards = await prisma.jobCard.findMany({
        where: {
          OR: [
            { clientName: { contains: 'AccuFarm', mode: 'insensitive' } },
            { clientId: 'cmhdajkcd0001m8zlk72lb2bt' }
          ]
        },
        select: {
          jobCardNumber: true,
          clientId: true,
          clientName: true,
          status: true
        }
      });
      
      console.log(`\n🎯 AccuFarm job cards: ${accuFarmCards.length}`);
      accuFarmCards.forEach(jc => {
        console.log(`  - ${jc.jobCardNumber}: clientId=${jc.clientId || 'null'}, clientName="${jc.clientName}"`);
      });
    } else {
      console.log('⚠️ No job cards found in database');
    }
    
  } catch (error) {
    console.error('❌ Error checking job cards:', error);
    if (error.code === 'P2021') {
      console.error('   Table does not exist - migration may be needed');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkJobCards();

