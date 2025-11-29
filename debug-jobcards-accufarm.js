// Debug script to check job cards for AccuFarm
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debugJobCards() {
    try {
        console.log('🔍 Searching for job cards related to AccuFarm...\n');
        
        // 1. Find AccuFarm client
        const accuFarmClients = await prisma.client.findMany({
            where: {
                name: {
                    contains: 'AccuFarm',
                    mode: 'insensitive'
                }
            }
        });
        
        console.log('📋 Found clients matching "AccuFarm":', accuFarmClients.length);
        accuFarmClients.forEach(client => {
            console.log(`  - ID: ${client.id}`);
            console.log(`    Name: "${client.name}"`);
            console.log(`    Type: ${client.type || 'null'}\n`);
        });
        
        // 2. Find all job cards
        const allJobCards = await prisma.jobCard.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' }
        });
        
        console.log(`📋 Total job cards in database: ${allJobCards.length}\n`);
        
        // 3. Search for job cards by client name containing AccuFarm
        const accuFarmJobCards = allJobCards.filter(jc => {
            const clientName = (jc.clientName || '').toLowerCase();
            return clientName.includes('accufarm');
        });
        
        console.log(`📋 Job cards with "AccuFarm" in clientName: ${accuFarmJobCards.length}`);
        accuFarmJobCards.forEach(jc => {
            console.log(`  - Job Card: ${jc.jobCardNumber}`);
            console.log(`    Client ID: ${jc.clientId || '(null)'}`);
            console.log(`    Client Name: "${jc.clientName || '(empty)'}"`);
            console.log(`    Status: ${jc.status}\n`);
        });
        
        // 4. If we found AccuFarm clients, check job cards by clientId
        if (accuFarmClients.length > 0) {
            const clientIds = accuFarmClients.map(c => c.id);
            const jobCardsByClientId = allJobCards.filter(jc => 
                jc.clientId && clientIds.includes(jc.clientId)
            );
            
            console.log(`📋 Job cards matching clientId: ${jobCardsByClientId.length}`);
            jobCardsByClientId.forEach(jc => {
                console.log(`  - Job Card: ${jc.jobCardNumber}`);
                console.log(`    Client ID: ${jc.clientId}`);
                console.log(`    Client Name: "${jc.clientName || '(empty)'}"\n`);
            });
        }
        
        // 5. Show all unique client names in job cards
        const uniqueClientNames = [...new Set(allJobCards.map(jc => jc.clientName).filter(Boolean))];
        console.log(`📋 Unique client names in job cards (first 20):`);
        uniqueClientNames.slice(0, 20).forEach(name => {
            console.log(`  - "${name}"`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugJobCards();

