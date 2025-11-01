import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
    try {
        console.log('🔍 Verifying JobCard table...');
        const count = await prisma.jobCard.count();
        console.log('✅ JobCard table is accessible');
        console.log(`📊 Current job cards in database: ${count}`);
        
        // Test creating a job card
        console.log('\n🧪 Testing job card creation...');
        const testJobCard = await prisma.jobCard.create({
            data: {
                jobCardNumber: 'JC0001',
                agentName: 'Test Agent',
                clientName: 'Test Client',
                status: 'draft',
                otherTechnicians: '[]',
                photos: '[]'
            }
        });
        console.log('✅ Test job card created:', testJobCard.jobCardNumber);
        
        // Clean up test data
        await prisma.jobCard.delete({ where: { id: testJobCard.id } });
        console.log('🧹 Test job card cleaned up');
        
        console.log('\n🎉 JobCard system is fully operational!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verify();

