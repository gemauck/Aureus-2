// Test Notification System
// Run with: node test-notifications.js

import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'gemauck@gmail.com';

// You'll need to get a valid JWT token first
// For testing, you can get it from browser console: window.storage.getToken()

async function testNotifications() {
    console.log('🧪 Testing Notification System\n');
    console.log('='.repeat(60));
    
    // Get token from command line or prompt
    const token = process.argv[2];
    
    if (!token) {
        console.log('\n❌ Please provide a JWT token as an argument:');
        console.log('   node test-notifications.js YOUR_JWT_TOKEN');
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
        // Test 1: Get notifications
        console.log('\n📋 Test 1: Getting notifications...');
        const getResponse = await fetch(`${API_BASE}/api/notifications`, {
            headers
        });
        
        if (getResponse.ok) {
            const data = await getResponse.json();
            const notifications = data.data?.notifications || data.notifications || [];
            const unreadCount = data.data?.unreadCount || data.unreadCount || 0;
            console.log(`✅ Found ${notifications.length} notifications (${unreadCount} unread)`);
        } else {
            console.log('❌ Failed to get notifications:', await getResponse.text());
        }
        
        // Test 2: Create test notification
        console.log('\n📋 Test 2: Creating test notification...');
        const testResponse = await fetch(`${API_BASE}/api/notifications/test`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                type: 'system',
                title: 'Test Notification',
                message: 'This is a test notification created via API. If you see this, the notification system is working!'
            })
        });
        
        if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log('✅ Test notification created:', testData.data?.notification?.id || testData.notification?.id);
            console.log('   Title:', testData.data?.notification?.title || testData.notification?.title);
            console.log('   Message:', testData.data?.notification?.message || testData.notification?.message);
        } else {
            console.log('❌ Failed to create test notification:', await testResponse.text());
        }
        
        // Test 3: Get notification settings
        console.log('\n📋 Test 3: Getting notification settings...');
        const settingsResponse = await fetch(`${API_BASE}/api/notifications/settings`, {
            headers
        });
        
        if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            const settings = settingsData.data?.settings || settingsData.settings;
            console.log('✅ Notification settings loaded:');
            console.log('   Email Mentions:', settings.emailMentions);
            console.log('   Email Comments:', settings.emailComments);
            console.log('   In-App Mentions:', settings.inAppMentions);
            console.log('   In-App Comments:', settings.inAppComments);
        } else {
            console.log('❌ Failed to get settings:', await settingsResponse.text());
        }
        
        // Test 4: Create mention notification
        console.log('\n📋 Test 4: Creating mention notification...');
        const mentionResponse = await fetch(`${API_BASE}/api/notifications`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                userId: process.argv[3] || 'same-user', // Use same user or provide another user ID
                type: 'mention',
                title: 'You were mentioned',
                message: 'Test User mentioned you in a comment: "Hey @you, check this out!"',
                link: '/settings?tab=notifications',
                metadata: JSON.stringify({
                    mentionedBy: 'Test User',
                    context: 'Test Comment',
                    fullComment: 'Hey @you, check this out!'
                })
            })
        });
        
        if (mentionResponse.ok) {
            const mentionData = await mentionResponse.json();
            console.log('✅ Mention notification created:', mentionData.data?.notification?.id || mentionData.notification?.id);
        } else {
            console.log('❌ Failed to create mention notification:', await mentionResponse.text());
        }
        
        // Test 5: Verify notifications appear
        console.log('\n📋 Test 5: Verifying notifications...');
        const verifyResponse = await fetch(`${API_BASE}/api/notifications`, {
            headers
        });
        
        if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            const notifications = verifyData.data?.notifications || verifyData.notifications || [];
            const unreadCount = verifyData.data?.unreadCount || verifyData.unreadCount || 0;
            console.log(`✅ Verification: ${notifications.length} total notifications, ${unreadCount} unread`);
            
            if (notifications.length > 0) {
                console.log('\n📬 Latest notifications:');
                notifications.slice(0, 3).forEach((notif, idx) => {
                    console.log(`   ${idx + 1}. [${notif.read ? 'READ' : 'UNREAD'}] ${notif.type}: ${notif.title}`);
                });
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Notification system test complete!');
        console.log('\n💡 Next steps:');
        console.log('   1. Check the notification bell icon in the header');
        console.log('   2. Verify notifications appear in the dropdown');
        console.log('   3. Test mark as read/unread functionality');
        console.log('   4. Test mention notifications in comments');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testNotifications();

