// Test Comment Notification via API
// This tests the full notification flow including email sending
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_BASE || process.env.APP_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'gemauck@gmail.com';

async function testCommentNotificationAPI() {
    console.log('🧪 Testing Comment Notification API');
    console.log(`📍 API Base: ${API_BASE}`);
    console.log(`📬 Test Email: ${TEST_EMAIL}\n`);
    console.log('='.repeat(60));
    
    // Get token from command line or environment
    const token = process.argv[2] || process.env.JWT_TOKEN;
    
    if (!token) {
        console.log('\n❌ Please provide a JWT token:');
        console.log('   node test-comment-notification-api.js YOUR_JWT_TOKEN');
        console.log('\n💡 To get your token:');
        console.log('   1. Open browser console (F12)');
        console.log('   2. Run: window.storage.getToken()');
        console.log('   3. Copy the token and use it as argument\n');
        console.log('   Or set JWT_TOKEN environment variable\n');
        process.exit(1);
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    
    try {
        // First, get current user to find their ID
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
        
        // Check notification settings
        console.log('\n📋 Step 2: Checking notification settings...');
        const settingsResponse = await fetch(`${API_BASE}/api/notifications/settings`, {
            headers
        });
        
        if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            const settings = settingsData.data?.settings || settingsData.settings;
            console.log('✅ Notification settings:');
            console.log('   Email Comments:', settings.emailComments ? '✅ Enabled' : '❌ Disabled');
            console.log('   In-App Comments:', settings.inAppComments ? '✅ Enabled' : '❌ Disabled');
            
            if (!settings.emailComments) {
                console.log('\n⚠️  Email Comments is disabled. Enabling for test...');
                // Enable email comments for testing
                await fetch(`${API_BASE}/api/notifications/settings`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        emailComments: true
                    })
                });
                console.log('✅ Email Comments enabled for testing');
            }
        }
        
        // Create a test comment notification (simulating document comment)
        console.log('\n📋 Step 3: Creating test comment notification...');
        const notificationResponse = await fetch(`${API_BASE}/api/notifications`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                userId: userId,
                type: 'comment',
                title: 'New comment on document: Invoice Template',
                message: `Test User commented on "Invoice Template" in Financial Documents (Website Redesign): "This is a test comment notification to verify the email system is working correctly."`,
                link: '/projects/test-project',
                metadata: {
                    projectId: 'test-project-id',
                    projectName: 'Website Redesign',
                    sectionId: 'section-1',
                    sectionName: 'Financial Documents',
                    documentId: 'doc-1',
                    documentName: 'Invoice Template',
                    month: 10,
                    year: 2025,
                    commentAuthor: 'Test User',
                    commentText: 'This is a test comment notification to verify the email system is working correctly.'
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
            
        } else {
            const errorText = await notificationResponse.text();
            console.log('❌ Failed to create notification:', errorText);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Test complete!');
        console.log('\n💡 What to check:');
        console.log('   1. In-app notification should appear in notification center');
        console.log('   2. Email should be sent (if emailComments enabled)');
        console.log('   3. Server logs should show email sending confirmation');
        console.log('');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\nError details:', error.stack);
        process.exit(1);
    }
}

testCommentNotificationAPI();

