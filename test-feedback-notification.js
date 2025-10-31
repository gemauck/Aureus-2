// Test feedback notification system
import dotenv from 'dotenv';
dotenv.config();
import { prisma } from './api/_lib/prisma.js';
import { sendNotificationEmail } from './api/_lib/email.js';

async function testFeedbackNotification() {
    console.log('🔍 Testing Feedback Notification System\n');
    console.log('='.repeat(60));
    
    try {
        // Check admin users
        console.log('\n👥 Checking Admin Users...');
        const admins = await prisma.user.findMany({
            where: {
                role: 'admin',
                status: 'active'
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true
            }
        });
        
        console.log(`   Found ${admins.length} admin user(s):`);
        
        if (admins.length === 0) {
            console.log('   ❌ NO ADMIN USERS FOUND!');
            console.log('\n🔧 Solution:');
            console.log('   You need at least one user with:');
            console.log('   - role: "admin"');
            console.log('   - status: "active"');
            console.log('   - email: valid email address');
            return;
        }
        
        admins.forEach((admin, index) => {
            console.log(`\n   Admin ${index + 1}:`);
            console.log(`      Name: ${admin.name || 'N/A'}`);
            console.log(`      Email: ${admin.email || '❌ NO EMAIL!'}`);
            console.log(`      Role: ${admin.role}`);
            console.log(`      Status: ${admin.status}`);
            
            if (!admin.email) {
                console.log('      ⚠️  WARNING: This admin has no email address!');
            }
        });
        
        // Test sending notification to each admin
        console.log('\n📧 Testing Email Notifications...');
        console.log('='.repeat(60));
        
        const adminsWithEmail = admins.filter(a => a.email);
        
        if (adminsWithEmail.length === 0) {
            console.log('\n❌ No admin users have email addresses!');
            console.log('\n🔧 Solution:');
            console.log('   Update admin users in the database to have email addresses.');
            return;
        }
        
        console.log(`\n📧 Sending test notification to ${adminsWithEmail.length} admin(s)...\n`);
        
        let successCount = 0;
        let failureCount = 0;
        
        for (const admin of adminsWithEmail) {
            try {
                console.log(`📧 Sending to ${admin.email}...`);
                
                const testHtmlContent = `
                    <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <p style="color: #333; margin-bottom: 10px;"><strong>Submitted by:</strong> Test User</p>
                        <p style="color: #333; margin-bottom: 10px;"><strong>Section:</strong> Testing</p>
                        <p style="color: #333; margin-bottom: 10px;"><strong>Page:</strong> /test</p>
                        <p style="color: #333; margin-bottom: 10px;"><strong>Severity:</strong> 🔴 High</p>
                        <p style="color: #333; margin-bottom: 10px;"><strong>Type:</strong> feedback</p>
                        
                        <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px;">
                            <p style="color: #555; margin: 0; white-space: pre-wrap;">This is a test feedback notification. If you receive this, the feedback email system is working!</p>
                        </div>
                    </div>
                `;
                
                const result = await sendNotificationEmail(
                    admin.email,
                    'Test Feedback Notification - Feedback System Test',
                    testHtmlContent
                );
                
                console.log(`   ✅ Success! Message ID: ${result.messageId}`);
                successCount++;
                
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
                failureCount++;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log(`📊 Test Results:`);
        console.log(`   ✅ Successfully sent: ${successCount}`);
        console.log(`   ❌ Failed: ${failureCount}`);
        console.log(`   Total admins: ${adminsWithEmail.length}`);
        
        if (successCount > 0) {
            console.log('\n✅ Feedback notification system is working!');
            console.log('   Check the admin email inboxes for the test notification.');
        }
        
        if (failureCount > 0) {
            console.log('\n⚠️  Some emails failed to send. Check the errors above.');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
}

testFeedbackNotification()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

