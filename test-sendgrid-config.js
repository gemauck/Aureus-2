#!/usr/bin/env node
// Test SendGrid configuration

import dotenv from 'dotenv';
dotenv.config();

const sendGridKey = process.env.SENDGRID_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

console.log('📧 SendGrid Configuration Test');
console.log('================================');
console.log('');

if (!sendGridKey) {
    console.log('❌ SENDGRID_API_KEY: NOT SET');
} else {
    const keyPreview = sendGridKey.length > 10 
        ? sendGridKey.substring(0, 5) + '...' + sendGridKey.substring(sendGridKey.length - 5)
        : sendGridKey.substring(0, 5) + '...';
    console.log('✅ SENDGRID_API_KEY: ' + keyPreview + ' (length: ' + sendGridKey.length + ')');
    console.log('   Format check: ' + (sendGridKey.startsWith('SG.') ? '✅ Valid (starts with SG.)' : '⚠️  Unexpected format (should start with SG.)'));
}

if (!emailFrom) {
    console.log('❌ EMAIL_FROM: NOT SET');
} else {
    console.log('✅ EMAIL_FROM: ' + emailFrom);
    console.log('   Format check: ' + (emailFrom.includes('@') ? '✅ Valid email format' : '⚠️  Invalid email format'));
}

console.log('');

// Check if SendGrid will be used
const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const isSendGrid = sendGridKey || (host === 'smtp.sendgrid.net' && sendGridKey && sendGridKey.startsWith('SG.'));

if (isSendGrid) {
    console.log('✅ SendGrid HTTP API will be used for sending emails');
} else {
    console.log('⚠️  SendGrid HTTP API will NOT be used');
    console.log('   Reason: ' + (!sendGridKey ? 'SENDGRID_API_KEY not set' : 'SMTP_HOST not set to smtp.sendgrid.net'));
}

console.log('');

// Test API key format
if (sendGridKey) {
    if (!sendGridKey.startsWith('SG.')) {
        console.log('⚠️  WARNING: SendGrid API key should start with "SG."');
        console.log('   Your key starts with: "' + sendGridKey.substring(0, 3) + '"');
    } else {
        console.log('✅ SendGrid API key format looks correct');
    }
}

console.log('');

// Summary
if (sendGridKey && emailFrom) {
    console.log('✅ SendGrid is properly configured!');
    console.log('');
    console.log('📝 Important reminders:');
    console.log('   1. Verify your sender email in SendGrid dashboard:');
    console.log('      https://app.sendgrid.com/settings/sender_auth');
    console.log('      Email to verify: ' + emailFrom);
    console.log('   2. Test sending an invitation from the User Management page');
} else {
    console.log('❌ SendGrid is NOT fully configured');
    console.log('');
    if (!sendGridKey) {
        console.log('   Missing: SENDGRID_API_KEY');
    }
    if (!emailFrom) {
        console.log('   Missing: EMAIL_FROM');
    }
    console.log('');
    console.log('📝 To configure SendGrid:');
    console.log('   1. Get your API key from: https://app.sendgrid.com/settings/api_keys');
    console.log('   2. Add to .env file:');
    console.log('      SENDGRID_API_KEY=SG.your_key_here');
    console.log('      EMAIL_FROM=your-email@abcotronics.co.za');
    console.log('   3. Restart the application: pm2 restart abcotronics-erp');
}

