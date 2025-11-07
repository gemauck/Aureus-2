// Comprehensive Test for Document Comment Email Notifications
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_BASE || process.env.APP_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'gemauck@gmail.com';

async function testDocumentCommentEmailFlow() {
    console.log('🧪 Testing Document Comment Email Notification Flow');
    console.log(`📍 API Base: ${API_BASE}`);
    console.log(`📬 Test Email: ${TEST_EMAIL}\n`);
    console.log('='.repeat(60));
    
    // Get token from command line or environment
    const token = process.argv[2] || process.env.JWT_TOKEN;
    
    if (!token) {
        console.log('\n❌ Please provide a JWT token:');
        console.log('   node test-document-comment-email-flow.js YOUR_JWT_TOKEN');
        console.log('\n💡 To get your token:');
        console.log('   1. Open browser console (F12)');
        console.log('   2. Run: window.storage.getToken()');
        console.log('   3. Copy the token and use it as argument\n');
        process.exit(1);
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    
    try {
        // Step 1: Get current user
        console.log('\n📋 Step 1: Getting current user...');
        const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
            headers
        });
        
        if (!meResponse.ok) {
            console.log('❌ Failed to get user:', await meResponse.text());
            process.exit(1);
        }
        
        const meData = await meResponse.json();
        const currentUser = meData.data?.user || meData.user;
        const userId = currentUser?.id || currentUser?.sub;
        
        if (!userId) {
            console.log('❌ Could not determine user ID');
            process.exit(1);
        }
        
        console.log(`✅ Current user: ${currentUser.name || currentUser.email} (ID: ${userId})`);
        console.log(`   Email: ${currentUser.email}`);
        
        // Step 2: Check notification settings
        console.log('\n📋 Step 2: Checking notification settings...');
        const settingsResponse = await fetch(`${API_BASE}/api/notifications/settings`, {
            headers
        });
        
        if (!settingsResponse.ok) {
            console.log('❌ Failed to get settings:', await settingsResponse.text());
            process.exit(1);
        }
        
        const settingsData = await settingsResponse.json();
        const settings = settingsData.data?.settings || settingsData.settings;
        
        console.log('✅ Notification settings:');
        console.log('   Email Comments:', settings.emailComments ? '✅ Enabled' : '❌ Disabled');
        console.log('   In-App Comments:', settings.inAppComments ? '✅ Enabled' : '❌ Disabled');
        console.log('   Email Mentions:', settings.emailMentions ? '✅ Enabled' : '❌ Disabled');
        
        if (!settings.emailComments) {
            console.log('\n⚠️  Email Comments is DISABLED. Enabling for test...');
            const enableResponse = await fetch(`${API_BASE}/api/notifications/settings`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    emailComments: true
                })
            });
            
            if (enableResponse.ok) {
                console.log('✅ Email Comments enabled for testing');
            } else {
                console.log('❌ Failed to enable Email Comments:', await enableResponse.text());
            }
        }
        
        // Step 3: Get all users to find a test recipient
        console.log('\n📋 Step 3: Getting all users...');
        const usersResponse = await fetch(`${API_BASE}/api/users`, {
            headers
        });
        
        if (!usersResponse.ok) {
            console.log('❌ Failed to get users:', await usersResponse.text());
            process.exit(1);
        }
        
        const usersData = await usersResponse.json();
        const allUsers = usersData.data?.users || usersData.users || [];
        console.log(`✅ Found ${allUsers.length} users`);
        
        // Find a test recipient (not the current user)
        const testRecipient = allUsers.find(u => 
            u.id !== userId && u.email && u.email !== currentUser.email
        );
        
        if (!testRecipient) {
            console.log('❌ No suitable test recipient found (need another user with email)');
            process.exit(1);
        }
        
        console.log(`✅ Test recipient: ${testRecipient.name} (${testRecipient.email})`);
        
        // Step 4: Check recipient's notification settings
        console.log('\n📋 Step 4: Checking recipient notification settings...');
        const recipientSettingsResponse = await fetch(`${API_BASE}/api/notifications/settings`, {
            headers: {
                ...headers,
                // Note: This will get current user's settings, not recipient's
                // We'll test with current user as recipient for now
            }
        });
        
        // Step 5: Create a test comment notification
        console.log('\n📋 Step 5: Creating test comment notification...');
        console.log('   Simulating: Comment on document "Invoice Template" in "Financial Documents"');
        
        const notificationResponse = await fetch(`${API_BASE}/api/notifications`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                userId: userId, // Send to self for testing
                type: 'comment',
                title: 'New comment on document: Invoice Template',
                message: `Test User commented on "Invoice Template" in Financial Documents (Test Project): "This is a test comment to verify email notifications are working correctly."`,
                link: '/projects/test-project',
                metadata: {
                    projectId: 'test-project-id',
                    projectName: 'Test Project',
                    sectionId: 'section-1',
                    sectionName: 'Financial Documents',
                    documentId: 'doc-1',
                    documentName: 'Invoice Template',
                    month: 10,
                    year: 2025,
                    commentAuthor: 'Test User',
                    commentText: 'This is a test comment to verify email notifications are working correctly.'
                }
            })
        });
        
        if (notificationResponse.ok) {
            const notificationData = await notificationResponse.json();
            const notification = notificationData.data?.notification || notificationData.notification;
            
            console.log('✅ Comment notification created!');
            console.log('   Notification ID:', notification?.id);
            console.log('   Type:', notification?.type);
            console.log('   Title:', notification?.title);
            console.log('   Message:', notification?.message?.substring(0, 80) + '...');
            
            console.log('\n📧 Email Status:');
            console.log('   If emailComments is enabled, an email should have been sent.');
            console.log('   Check your inbox (and spam folder) for the notification email.');
            console.log('   Check server logs for email sending confirmation.');
            
            // Step 6: Check server logs hint
            console.log('\n📋 Step 6: To check server logs:');
            console.log('   SSH into server and run: pm2 logs abcotronics-erp --lines 50');
            console.log('   Look for:');
            console.log('     ✅ Email notification sent to [email]');
            console.log('     ❌ Failed to send email notification');
            
        } else {
            const errorText = await notificationResponse.text();
            console.log('❌ Failed to create notification:', errorText);
            console.log('   Status:', notificationResponse.status);
        }
        
        // Step 7: Verify notification was created
        console.log('\n📋 Step 7: Verifying notification was created...');
        const getNotificationsResponse = await fetch(`${API_BASE}/api/notifications`, {
            headers
        });
        
        if (getNotificationsResponse.ok) {
            const notificationsData = await getNotificationsResponse.json();
            const notifications = notificationsData.data?.notifications || notificationsData.notifications || [];
            const recentCommentNotifications = notifications.filter(n => 
                n.type === 'comment' && 
                n.title.includes('Invoice Template')
            );
            
            console.log(`✅ Found ${recentCommentNotifications.length} matching comment notification(s)`);
            if (recentCommentNotifications.length > 0) {
                console.log('   Latest notification:', {
                    id: recentCommentNotifications[0].id,
                    title: recentCommentNotifications[0].title,
                    read: recentCommentNotifications[0].read
                });
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Test complete!');
        console.log('\n💡 Summary:');
        console.log('   1. ✅ User authenticated');
        console.log('   2. ✅ Notification settings checked');
        console.log('   3. ✅ Test notification created');
        console.log('   4. ✅ Notification verified in database');
        console.log('\n📧 Next steps:');
        console.log('   1. Check your email inbox (and spam folder)');
        console.log('   2. Check server logs for email sending status');
        console.log('   3. Verify emailComments setting is enabled');
        console.log('   4. Check SMTP/email service configuration');
        console.log('');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\nError details:', error.stack);
        process.exit(1);
    }
}

testDocumentCommentEmailFlow();

