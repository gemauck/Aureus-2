// Test script for email notifications
// This script tests the email notification system and provides diagnostic information
import { prisma } from './_lib/prisma.js';
import { sendNotificationEmail } from './_lib/email.js';

async function testEmailNotifications() {
    console.log('🧪 Testing Email Notification System\n');
    console.log('='.repeat(60));
    
    try {
        // 1. Check Email Configuration
        console.log('\n1️⃣ Checking Email Configuration...');
        console.log('-'.repeat(60));
        
        // Check for SendGrid API key first (preferred for production)
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Otherwise, check for SMTP credentials
        const user = process.env.SMTP_USER || process.env.GMAIL_USER;
        const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
        
        if (!sendGridKey && (!user || !pass)) {
            console.error('❌ Email configuration check failed');
            console.error('   Please check your .env file for email settings');
            console.error('   Either set SENDGRID_API_KEY or SMTP_USER/SMTP_PASS');
            return;
        }
        
        console.log('✅ Email configuration check passed');
        
        // Check environment variables
        const hasSendGrid = !!process.env.SENDGRID_API_KEY;
        const hasSMTP = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
        const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const hasSMTPURL = !!process.env.SMTP_URL;
        const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'not-set';
        
        console.log('📧 Email Configuration:');
        console.log(`   - SendGrid API Key: ${hasSendGrid ? '✅ Set' : '❌ Not set'}`);
        console.log(`   - SMTP Credentials: ${hasSMTP ? '✅ Set' : '❌ Not set'}`);
        console.log(`   - Gmail Credentials: ${hasGmail ? '✅ Set' : '❌ Not set'}`);
        console.log(`   - SMTP URL: ${hasSMTPURL ? '✅ Set' : '❌ Not set'}`);
        console.log(`   - Email From: ${emailFrom}`);
        
        if (!hasSendGrid && !hasSMTP && !hasGmail && !hasSMTPURL) {
            console.error('❌ No email configuration found!');
            console.error('   Please set one of the following in your .env file:');
            console.error('   - SENDGRID_API_KEY (recommended)');
            console.error('   - SMTP_USER and SMTP_PASS');
            console.error('   - GMAIL_USER and GMAIL_APP_PASSWORD');
            console.error('   - SMTP_URL');
            return;
        }
        
        // 2. Check Users and Notification Settings
        console.log('\n2️⃣ Checking Users and Notification Settings...');
        console.log('-'.repeat(60));
        
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true
            },
            take: 10 // Limit to first 10 users for testing
        });
        
        console.log(`📊 Found ${users.length} users (showing first 10)`);
        
        if (users.length === 0) {
            console.error('❌ No users found in database');
            return;
        }
        
        // Check notification settings for each user
        const usersWithSettings = [];
        const usersWithoutSettings = [];
        const usersWithoutEmail = [];
        
        for (const user of users) {
            if (!user.email) {
                usersWithoutEmail.push(user);
                continue;
            }
            
            // Fetch notification settings for this user
            const settings = await prisma.notificationSetting.findUnique({
                where: { userId: user.id }
            });
            
            if (settings) {
                usersWithSettings.push({
                    ...user,
                    settings: settings
                });
            } else {
                usersWithoutSettings.push(user);
            }
        }
        
        console.log(`\n📋 Users Summary:`);
        console.log(`   - Users with notification settings: ${usersWithSettings.length}`);
        console.log(`   - Users without notification settings: ${usersWithoutSettings.length}`);
        console.log(`   - Users without email addresses: ${usersWithoutEmail.length}`);
        
        // Display users with their settings
        if (usersWithSettings.length > 0) {
            console.log(`\n👥 Users with notification settings:`);
            usersWithSettings.forEach(user => {
                const settings = user.settings;
                console.log(`   - ${user.name || user.email} (${user.email})`);
                console.log(`     • Email Tasks: ${settings.emailTasks ? '✅' : '❌'}`);
                console.log(`     • Email Mentions: ${settings.emailMentions ? '✅' : '❌'}`);
                console.log(`     • Email Comments: ${settings.emailComments ? '✅' : '❌'}`);
                console.log(`     • In-App Tasks: ${settings.inAppTasks ? '✅' : '❌'}`);
            });
        }
        
        if (usersWithoutSettings.length > 0) {
            console.log(`\n⚠️ Users without notification settings:`);
            usersWithoutSettings.forEach(user => {
                console.log(`   - ${user.name || user.email} (${user.email})`);
            });
        }
        
        if (usersWithoutEmail.length > 0) {
            console.log(`\n⚠️ Users without email addresses:`);
            usersWithoutEmail.forEach(user => {
                console.log(`   - ${user.name || user.id}`);
            });
        }
        
        // 3. Test Email Sending
        console.log('\n3️⃣ Testing Email Sending...');
        console.log('-'.repeat(60));
        
        // Find a user with email and notification settings enabled
        const testUser = usersWithSettings.find(u => 
            u.email && 
            u.settings.emailTasks && 
            u.settings.emailMentions
        ) || usersWithSettings.find(u => u.email);
        
        if (!testUser) {
            console.error('❌ No suitable user found for testing');
            console.error('   Need a user with:');
            console.error('   - Email address');
            console.error('   - Notification settings');
            if (usersWithoutSettings.length > 0) {
                console.error('\n   Run the update script to create notification settings:');
                console.error('   node api/update-notification-settings.js');
            }
            return;
        }
        
        console.log(`📧 Test user: ${testUser.name || testUser.email} (${testUser.email})`);
        console.log(`   • Email Tasks: ${testUser.settings.emailTasks ? '✅' : '❌'}`);
        console.log(`   • Email Mentions: ${testUser.settings.emailMentions ? '✅' : '❌'}`);
        
        // Test 1: Send a test notification email
        console.log('\n📤 Test 1: Sending test notification email...');
        try {
            const testSubject = 'Test Notification Email';
            const testMessage = `
                <p>This is a test email to verify your email notification system is working correctly.</p>
                <p>If you received this email, your email notifications are configured properly!</p>
                <p><strong>Test Details:</strong></p>
                <ul>
                    <li>Type: Test Notification</li>
                    <li>Timestamp: ${new Date().toISOString()}</li>
                    <li>User: ${testUser.name || testUser.email}</li>
                </ul>
            `;
            
            const result = await sendNotificationEmail(
                testUser.email,
                testSubject,
                testMessage,
                {
                    isProjectRelated: false
                }
            );
            
            console.log('✅ Test email sent successfully!');
            console.log(`   Message ID: ${result.messageId || 'unknown'}`);
            console.log(`   Success: ${result.success}`);
            console.log(`\n📬 Please check the inbox for: ${testUser.email}`);
            console.log('   (Also check spam/junk folder if not in inbox)');
            
        } catch (error) {
            console.error('❌ Test email failed:', error.message);
            console.error('   Error details:', {
                message: error.message,
                code: error.code,
                stack: error.stack?.split('\n').slice(0, 3).join('\n')
            });
            
            // Provide helpful error messages
            if (error.message.includes('configuration')) {
                console.error('\n💡 Solution:');
                console.error('   - Check your .env file for email configuration');
                console.error('   - Make sure SENDGRID_API_KEY or SMTP settings are set');
                console.error('   - Restart the server after updating .env');
            } else if (error.message.includes('verified')) {
                console.error('\n💡 Solution:');
                console.error('   - Verify your sender email in SendGrid dashboard');
                console.error('   - Go to: https://app.sendgrid.com/settings/sender_auth');
            } else if (error.message.includes('authentication')) {
                console.error('\n💡 Solution:');
                console.error('   - Check your SMTP username and password');
                console.error('   - For Gmail, use an App Password (not your regular password)');
            }
            return;
        }
        
        // 4. Test Notification API Endpoint
        console.log('\n4️⃣ Testing Notification API Endpoint...');
        console.log('-'.repeat(60));
        
        // Create a test notification in the database
        console.log('📤 Creating test notification in database...');
        try {
            const testNotification = await prisma.notification.create({
                data: {
                    userId: testUser.id,
                    type: 'system',
                    title: 'Test Notification',
                    message: 'This is a test notification to verify the notification system is working.',
                    link: '/projects',
                    metadata: JSON.stringify({
                        test: true,
                        timestamp: new Date().toISOString()
                    }),
                    read: false
                }
            });
            
            console.log('✅ Test notification created in database!');
            console.log(`   Notification ID: ${testNotification.id}`);
            console.log(`   User ID: ${testNotification.userId}`);
            console.log(`   Type: ${testNotification.type}`);
            console.log(`   Title: ${testNotification.title}`);
            
            // Clean up test notification
            await prisma.notification.delete({
                where: { id: testNotification.id }
            });
            console.log('   ✅ Test notification cleaned up');
            
        } catch (error) {
            console.error('❌ Failed to create test notification:', error.message);
            console.error('   Error details:', {
                message: error.message,
                code: error.code
            });
        }
        
        // 5. Summary
        console.log('\n5️⃣ Test Summary');
        console.log('='.repeat(60));
        console.log('✅ Email configuration: OK');
        console.log(`✅ Users found: ${users.length}`);
        console.log(`✅ Users with settings: ${usersWithSettings.length}`);
        console.log(`✅ Test email: Sent to ${testUser.email}`);
        console.log('\n📋 Next Steps:');
        console.log('   1. Check the inbox for the test email');
        console.log('   2. If email not received, check spam/junk folder');
        console.log('   3. If still not received, check server logs for errors');
        console.log('   4. Verify email configuration in .env file');
        console.log('   5. For SendGrid users, verify sender email is verified');
        console.log('\n💡 To update all users\' notification settings:');
        console.log('   node api/update-notification-settings.js');
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        console.error('   Error details:', {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n')
        });
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testEmailNotifications()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });

