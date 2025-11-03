#!/usr/bin/env node
// Test email sending from server
import dotenv from 'dotenv';
import { sendInvitationEmail } from './api/_lib/email.js';

dotenv.config();

console.log('📧 Email Test Script');
console.log('===================');
console.log('');

// Check environment variables
console.log('🔍 Checking email configuration...');
const hasSendGrid = !!process.env.SENDGRID_API_KEY;
const hasSMTP = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'not-set';

console.log('  SENDGRID_API_KEY: ' + (hasSendGrid ? 'SET (' + process.env.SENDGRID_API_KEY.substring(0, 5) + '...)' : 'NOT SET'));
console.log('  SMTP_USER: ' + (process.env.SMTP_USER ? 'SET (' + process.env.SMTP_USER + ')' : 'NOT SET'));
console.log('  SMTP_PASS: ' + (process.env.SMTP_PASS ? 'SET' : 'NOT SET'));
console.log('  EMAIL_FROM: ' + emailFrom);
console.log('');

if (!hasSendGrid && !hasSMTP) {
    console.log('❌ ERROR: No email configuration found!');
    console.log('');
    console.log('Please configure either:');
    console.log('  1. SENDGRID_API_KEY (recommended)');
    console.log('  2. SMTP_USER and SMTP_PASS (Gmail SMTP)');
    process.exit(1);
}

const testEmail = 'garethm@abcotronics.co.za';
const testLink = 'https://abcoafrica.co.za/accept-invitation?token=test-token-12345';

console.log('📤 Sending test email to: ' + testEmail);
console.log('');

try {
    const result = await sendInvitationEmail({
        email: testEmail,
        name: 'Gareth Mauck (Test)',
        role: 'admin',
        invitationLink: testLink
    });
    
    console.log('');
    console.log('✅ SUCCESS! Test email sent successfully!');
    console.log('   Message ID: ' + result.messageId);
    console.log('');
    console.log('📬 Check your inbox at: ' + testEmail);
    
} catch (error) {
    console.log('');
    console.log('❌ FAILED to send test email');
    console.log('   Error: ' + error.message);
    console.log('');
    if (error.stack) {
        console.log('   Stack trace:');
        console.log(error.stack);
    }
    process.exit(1);
}

