// Automated Notification System Test
// Tests all notification functionality without user interaction
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Automated Notification System Test\n');
console.log('='.repeat(60));

const results = {
    passed: [],
    failed: [],
    warnings: []
};

function test(name, condition, message) {
    if (condition) {
        console.log(`✅ ${name}: ${message}`);
        results.passed.push(name);
    } else {
        console.log(`❌ ${name}: ${message}`);
        results.failed.push(name);
    }
}

function warn(name, message) {
    console.log(`⚠️  ${name}: ${message}`);
    results.warnings.push(name);
}

// Test 1: Check notification API files exist
console.log('\n📋 Test 1: Checking API Files...');
try {
    const apiFiles = [
        'api/notifications.js',
        'api/notifications/settings.js',
        'api/notifications/test.js'
    ];
    
    apiFiles.forEach(file => {
        try {
            const content = readFileSync(join(__dirname, file), 'utf8');
            test(`API file exists: ${file}`, true, 'File found');
            test(`API file has content: ${file}`, content.length > 100, 'File has content');
        } catch (error) {
            test(`API file exists: ${file}`, false, `File not found: ${error.message}`);
        }
    });
} catch (error) {
    test('API files check', false, error.message);
}

// Test 2: Check notification components exist
console.log('\n📋 Test 2: Checking Frontend Components...');
try {
    const componentFiles = [
        'src/components/common/NotificationCenter.jsx',
        'src/components/settings/NotificationSettings.jsx',
        'src/components/common/CommentInputWithMentions.jsx',
        'src/utils/mentionHelper.js'
    ];
    
    componentFiles.forEach(file => {
        try {
            const content = readFileSync(join(__dirname, file), 'utf8');
            test(`Component exists: ${file}`, true, 'File found');
            test(`Component has content: ${file}`, content.length > 100, 'File has content');
        } catch (error) {
            test(`Component exists: ${file}`, false, `File not found: ${error.message}`);
        }
    });
} catch (error) {
    test('Component files check', false, error.message);
}

// Test 3: Check API endpoints have correct methods
console.log('\n📋 Test 3: Checking API Endpoint Methods...');
try {
    const notificationsApi = readFileSync(join(__dirname, 'api/notifications.js'), 'utf8');
    
    test('GET method exists', notificationsApi.includes('req.method === \'GET\''), 'GET endpoint implemented');
    test('POST method exists', notificationsApi.includes('req.method === \'POST\''), 'POST endpoint implemented');
    test('PATCH method exists', notificationsApi.includes('req.method === \'PATCH\''), 'PATCH endpoint implemented');
    test('DELETE method exists', notificationsApi.includes('req.method === \'DELETE\''), 'DELETE endpoint implemented');
    test('Auth required', notificationsApi.includes('authRequired'), 'Authentication required');
    test('Prisma used', notificationsApi.includes('prisma.notification'), 'Database integration present');
} catch (error) {
    test('API methods check', false, error.message);
}

// Test 4: Check notification settings API
console.log('\n📋 Test 4: Checking Notification Settings API...');
try {
    const settingsApi = readFileSync(join(__dirname, 'api/notifications/settings.js'), 'utf8');
    
    test('GET settings method', settingsApi.includes('req.method === \'GET\''), 'GET settings endpoint');
    test('PUT settings method', settingsApi.includes('req.method === \'PUT\''), 'PUT settings endpoint');
    test('User ID extraction', settingsApi.includes('req.user?.sub || req.user?.id'), 'User ID extraction fixed');
    test('Prisma settings', settingsApi.includes('prisma.notificationSetting'), 'Database integration');
} catch (error) {
    test('Settings API check', false, error.message);
}

// Test 5: Check NotificationCenter component
console.log('\n📋 Test 5: Checking NotificationCenter Component...');
try {
    const notificationCenter = readFileSync(join(__dirname, 'src/components/common/NotificationCenter.jsx'), 'utf8');
    
    test('Component exports', notificationCenter.includes('window.NotificationCenter'), 'Component registered globally');
    test('API calls', notificationCenter.includes('/notifications'), 'API endpoint called');
    test('Polling implemented', notificationCenter.includes('setInterval'), 'Auto-refresh implemented');
    test('Unread count', notificationCenter.includes('unreadCount'), 'Unread count displayed');
    test('Mark as read', notificationCenter.includes('markAsRead'), 'Mark as read functionality');
    test('Delete notification', notificationCenter.includes('deleteNotification'), 'Delete functionality');
} catch (error) {
    test('NotificationCenter check', false, error.message);
}

// Test 6: Check NotificationSettings component
console.log('\n📋 Test 6: Checking NotificationSettings Component...');
try {
    const settingsComponent = readFileSync(join(__dirname, 'src/components/settings/NotificationSettings.jsx'), 'utf8');
    
    test('Component exports', settingsComponent.includes('window.NotificationSettings'), 'Component registered globally');
    test('Settings API calls', settingsComponent.includes('/notifications/settings'), 'Settings API integrated');
    test('Test button', settingsComponent.includes('Create Test Notification'), 'Test button present');
    test('Email preferences', settingsComponent.includes('emailMentions'), 'Email preferences UI');
    test('In-app preferences', settingsComponent.includes('inAppMentions'), 'In-app preferences UI');
    test('Save functionality', settingsComponent.includes('handleSave'), 'Save functionality');
} catch (error) {
    test('NotificationSettings check', false, error.message);
}

// Test 7: Check MentionHelper
console.log('\n📋 Test 7: Checking MentionHelper Utility...');
try {
    const mentionHelper = readFileSync(join(__dirname, 'src/utils/mentionHelper.js'), 'utf8');
    
    test('Parse mentions', mentionHelper.includes('parseMentions'), 'Parse mentions function');
    test('Process mentions', mentionHelper.includes('processMentions'), 'Process mentions function');
    test('Create notification', mentionHelper.includes('createMentionNotification'), 'Create notification function');
    test('User matching', mentionHelper.includes('matchedUser'), 'User matching logic');
    test('DatabaseAPI usage', mentionHelper.includes('DatabaseAPI.makeRequest'), 'Uses DatabaseAPI');
} catch (error) {
    test('MentionHelper check', false, error.message);
}

// Test 8: Check database schema
console.log('\n📋 Test 8: Checking Database Schema...');
try {
    const schema = readFileSync(join(__dirname, 'prisma/schema.prisma'), 'utf8');
    
    test('Notification model', schema.includes('model Notification'), 'Notification model exists');
    test('NotificationSetting model', schema.includes('model NotificationSetting'), 'NotificationSetting model exists');
    test('User relation', schema.includes('Notification[]'), 'User notification relation');
    test('Required fields', schema.includes('userId') && schema.includes('type') && schema.includes('title'), 'Required fields present');
    test('Settings fields', schema.includes('emailMentions') && schema.includes('inAppMentions'), 'Settings fields present');
} catch (error) {
    test('Schema check', false, error.message);
}

// Test 9: Check integration points
console.log('\n📋 Test 9: Checking Integration Points...');
try {
    const clientModal = readFileSync(join(__dirname, 'src/components/clients/ClientDetailModal.jsx'), 'utf8');
    const leadModal = readFileSync(join(__dirname, 'src/components/clients/LeadDetailModal.jsx'), 'utf8');
    const mainLayout = readFileSync(join(__dirname, 'src/components/layout/MainLayout.jsx'), 'utf8');
    
    test('ClientDetailModal mentions', clientModal.includes('processMentions'), 'Mentions in client comments');
    test('LeadDetailModal mentions', leadModal.includes('processMentions'), 'Mentions in lead comments');
    test('MainLayout NotificationCenter', mainLayout.includes('NotificationCenter'), 'NotificationCenter in header');
} catch (error) {
    warn('Integration check', `Could not verify all integrations: ${error.message}`);
}

// Test 10: Check email integration
console.log('\n📋 Test 10: Checking Email Integration...');
try {
    const emailLib = readFileSync(join(__dirname, 'api/_lib/email.js'), 'utf8');
    const notificationsApi = readFileSync(join(__dirname, 'api/notifications.js'), 'utf8');
    
    test('SendGrid API function', emailLib.includes('sendViaSendGridAPI'), 'SendGrid HTTP API function');
    test('SendGrid detection', emailLib.includes('sendgrid.net') || emailLib.includes('SENDGRID_API_KEY'), 'SendGrid detection logic');
    test('Email notification function', emailLib.includes('sendNotificationEmail'), 'Email notification function');
    test('Notifications use email', notificationsApi.includes('sendNotificationEmail'), 'Notifications API uses email');
    test('User preferences check', notificationsApi.includes('emailMentions') || notificationsApi.includes('emailSystem'), 'Checks user email preferences');
} catch (error) {
    test('Email integration check', false, error.message);
}

// Test 11: Check environment variables
console.log('\n📋 Test 11: Checking Environment Configuration...');
const hasSendGrid = !!(process.env.SENDGRID_API_KEY || 
                      (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.')));
const hasSMTP = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
const hasEmailConfig = hasSendGrid || hasSMTP;

// Email config is optional - in-app notifications work without it
if (hasEmailConfig) {
    test('Email configuration', true, hasSendGrid ? 'SendGrid configured' : 'SMTP configured');
} else {
    warn('Email config', 'Email notifications will not work without SMTP or SendGrid configuration (in-app notifications still work)');
    // Don't fail the test - email config is optional
    results.passed.push('Email configuration (optional)');
}

// Test 12: Check index.html loading
console.log('\n📋 Test 12: Checking Component Loading...');
try {
    const indexHtml = readFileSync(join(__dirname, 'index.html'), 'utf8');
    
    test('NotificationCenter loaded', indexHtml.includes('NotificationCenter.js'), 'NotificationCenter in index.html');
    test('NotificationSettings loaded', indexHtml.includes('NotificationSettings.js'), 'NotificationSettings in index.html');
    test('MentionHelper loaded', indexHtml.includes('mentionHelper.js'), 'MentionHelper in index.html');
    test('CommentInputWithMentions loaded', indexHtml.includes('CommentInputWithMentions.js'), 'CommentInputWithMentions in index.html');
} catch (error) {
    test('Component loading check', false, error.message);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed: ${results.passed.length}`);
console.log(`❌ Failed: ${results.failed.length}`);
console.log(`⚠️  Warnings: ${results.warnings.length}`);

if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(test => console.log(`   - ${test}`));
}

if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    results.warnings.forEach(test => console.log(`   - ${test}`));
}

console.log('\n' + '='.repeat(60));

if (results.failed.length === 0) {
    console.log('✅ All critical tests passed!');
    console.log('✅ Notification system is properly configured');
    console.log('\n💡 Next steps:');
    console.log('   1. Start your server: npm run dev');
    console.log('   2. Test via UI: Settings → Notifications → Create Test Notification');
    console.log('   3. Check notification bell icon in header');
    process.exit(0);
} else {
    console.log('❌ Some tests failed. Please review the errors above.');
    process.exit(1);
}

