// Test script to check if feedback items exist in database
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testFeedbackDisplay() {
    console.log('🔍 Testing Feedback Display\n');
    console.log('='.repeat(60));
    
    try {
        // Check if feedback table exists and has data
        console.log('\n📊 Checking feedback in database...\n');
        
        const feedbackCount = await prisma.feedback.count();
        console.log(`Total feedback items in database: ${feedbackCount}`);
        
        if (feedbackCount === 0) {
            console.log('\n⚠️  No feedback items found in database!');
            console.log('   This could mean:');
            console.log('   1. No feedback has been submitted yet');
            console.log('   2. Feedback submissions are failing');
            console.log('   3. Database connection issue');
            return;
        }
        
        console.log('\n📋 Recent feedback items:\n');
        const recentFeedback = await prisma.feedback.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                userId: true,
                message: true,
                type: true,
                severity: true,
                section: true,
                pageUrl: true,
                createdAt: true
            }
        });
        
        recentFeedback.forEach((item, index) => {
            console.log(`${index + 1}. ${item.type} - ${item.severity}`);
            console.log(`   Message: ${item.message.substring(0, 50)}...`);
            console.log(`   Section: ${item.section || 'N/A'}`);
            console.log(`   Page: ${item.pageUrl || 'N/A'}`);
            console.log(`   Created: ${item.createdAt}`);
            console.log('');
        });
        
        // Test API endpoint response format
        console.log('🧪 Testing API endpoint format...');
        console.log('   API should return: { data: [...] }');
        console.log('   Frontend expects: response.data or response');
        console.log('');
        
        console.log('✅ If feedback exists but UI shows 0, check:');
        console.log('   1. Frontend is accessing response.data correctly');
        console.log('   2. API endpoint /api/feedback is working');
        console.log('   3. User has admin role to view feedback');
        console.log('   4. Browser console for errors');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.message.includes('protocol')) {
            console.error('   Database connection issue - check DATABASE_URL');
        }
    } finally {
        await prisma.$disconnect();
    }
}

testFeedbackDisplay();

