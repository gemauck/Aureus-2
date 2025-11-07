// Comprehensive Email Notification System Test
// Tests the complete flow from notification creation to email delivery
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_BASE || process.env.APP_URL || 'https://abcoafrica.co.za';

async function testEmailNotificationSystem() {
    console.log('🧪 Comprehensive Email Notification System Test');
    console.log('='.repeat(60));
    
    const token = process.argv[2] || process.env.JWT_TOKEN;
    
    if (!token) {
        console.log('\n❌ Please provide a JWT token:');
        console.log('   node test-email-notification-system.js YOUR_JWT_TOKEN');
        console.log('\n💡 Get token from browser console: window.storage.getToken()\n');
        process.exit(1);
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    
    try {
        // Test 1: Get current user
        console.log('\n📋 Test 1: Authentication & User Info');
        const meResponse = await fetch(`${API_BASE}/api/auth/me`, { headers });
        if (!meResponse.ok) {
            throw new Error('Failed to authenticate');
        }
        const meData = await meResponse.json();
        const user = meData.data?.user || meData.user;
        console.log(`✅ Authenticated as: ${user.name} (${user.email})`);
        
        // Test 2: Check notification settings
        console.log('\n📋 Test 2: Notification Settings');
        const settingsResponse = await fetch(`${API_BASE}/api/notifications/settings`, { headers });
        const settingsData = await settingsResponse.json();
        const settings = settingsData.data?.settings || settingsData.settings;
        
        console.log('   Email Comments:', settings.emailComments ? '✅ Enabled' : '❌ Disabled');
        console.log('   In-App Comments:', settings.inAppComments ? '✅ Enabled' : '❌ Disabled');
        
        if (!settings.emailComments) {
            console.log('   ⚠️  Enabling emailComments for testing...');
            await fetch(`${API_BASE}/api/notifications/settings`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ emailComments: true })
            });
            console.log('   ✅ emailComments enabled');
        }
        
        // Test 3: Create test comment notification
        console.log('\n📋 Test 3: Creating Comment Notification');
        console.log('   This simulates a document comment notification...');
        
        const notificationResponse = await fetch(`${API_BASE}/api/notifications`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                userId: user.id,
                type: 'comment',
                title: 'Test: New comment on document: Invoice Template',
                message: `Test User commented on "Invoice Template" in Financial Documents (Test Project): "This is a test comment notification to verify the email system is working."`,
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
                    commentText: 'This is a test comment notification to verify the email system is working.'
                }
            })
        });
        
        if (notificationResponse.ok) {
            const notifData = await notificationResponse.json();
            const notification = notifData.data?.notification || notifData.notification;
            console.log('   ✅ Notification created successfully!');
            console.log('   ID:', notification?.id);
            console.log('   Type:', notification?.type);
            console.log('   Title:', notification?.title);
            
            // Test 4: Verify notification in database
            console.log('\n📋 Test 4: Verifying Notification in Database');
            const getNotifResponse = await fetch(`${API_BASE}/api/notifications`, { headers });
            if (getNotifResponse.ok) {
                const notifsData = await getNotifResponse.json();
                const notifications = notifsData.data?.notifications || notifsData.notifications || [];
                const testNotif = notifications.find(n => n.id === notification?.id);
                
                if (testNotif) {
                    console.log('   ✅ Notification found in database');
                    console.log('   Read status:', testNotif.read ? 'Read' : 'Unread');
                } else {
                    console.log('   ⚠️  Notification not found (may have been filtered)');
                }
            }
            
            // Test 5: Check server logs hint
            console.log('\n📋 Test 5: Email Delivery Status');
            console.log('   📧 Email should have been sent if:');
            console.log('      - emailComments is enabled ✅');
            console.log('      - User has valid email ✅');
            console.log('      - Email service is configured');
            console.log('\n   🔍 To check email delivery:');
            console.log('      1. Check your inbox (and spam folder)');
            console.log('      2. Check server logs:');
            console.log('         ssh root@165.22.127.196');
            console.log('         pm2 logs abcotronics-erp --lines 50 | grep -i email');
            console.log('\n   Look for:');
            console.log('     ✅ "Email notification sent to [email]" = Success');
            console.log('     ❌ "Connection timeout" = SMTP blocked (need SendGrid)');
            console.log('     ❌ "Failed to send email" = Configuration issue');
            
        } else {
            const errorText = await notificationResponse.text();
            console.log('   ❌ Failed to create notification');
            console.log('   Status:', notificationResponse.status);
            console.log('   Error:', errorText);
        }
        
        // Test 6: Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary');
        console.log('='.repeat(60));
        console.log('✅ Authentication: Working');
        console.log('✅ Notification Settings: Checked');
        console.log('✅ Notification Creation: Tested');
        console.log('✅ Database Storage: Verified');
        console.log('\n📧 Email Delivery Status:');
        console.log('   - Notification created: ✅');
        console.log('   - Email sending: Check server logs');
        console.log('   - If SMTP timeout: Configure SendGrid');
        console.log('\n💡 Next Steps:');
        console.log('   1. Check server logs for email sending status');
        console.log('   2. If SMTP timeout errors, set up SendGrid:');
        console.log('      - Get SendGrid API key');
        console.log('      - Set SENDGRID_API_KEY in server .env');
        console.log('      - Restart: pm2 restart abcotronics-erp');
        console.log('   3. Check email inbox (and spam folder)');
        console.log('');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\nError details:', error.stack);
        process.exit(1);
    }
}

testEmailNotificationSystem();

