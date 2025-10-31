// Email diagnostic script
import dotenv from 'dotenv';
dotenv.config();
import { sendNotificationEmail } from './api/_lib/email.js';

async function diagnoseEmail() {
    console.log('🔍 Email Configuration Diagnostic\n');
    console.log('='.repeat(50));
    
    // Check environment variables
    console.log('\n📋 Environment Variables:');
    console.log('   SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
    console.log('   SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
    console.log('   SMTP_USER:', process.env.SMTP_USER || 'NOT SET');
    console.log('   SMTP_PASS:', process.env.SMTP_PASS ? 
        (process.env.SMTP_PASS.startsWith('SG.') ? 'SET ✅ (SendGrid detected)' : 'SET (not SendGrid)') : 
        'NOT SET ❌');
    console.log('   SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'SET ✅' : 'NOT SET');
    console.log('   EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET ❌');
    console.log('   EMAIL_REPLY_TO:', process.env.EMAIL_REPLY_TO || 'NOT SET');
    
    // Check SendGrid configuration
    const sendGridKey = process.env.SENDGRID_API_KEY || 
                       (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
    const host = process.env.SMTP_HOST;
    const fromEmail = process.env.EMAIL_FROM;
    
    console.log('\n📧 SendGrid Configuration:');
    if (sendGridKey) {
        console.log('   ✅ SendGrid API Key found');
    } else {
        console.log('   ❌ SendGrid API Key NOT found');
    }
    
    if (host === 'smtp.sendgrid.net') {
        console.log('   ✅ SMTP_HOST correctly set to SendGrid');
    } else {
        console.log('   ⚠️  SMTP_HOST:', host || 'NOT SET');
        console.log('      Should be: smtp.sendgrid.net');
    }
    
    if (fromEmail) {
        console.log('   📧 FROM Email:', fromEmail);
        console.log('   ⚠️  IMPORTANT: Make sure this email is verified in SendGrid!');
        console.log('      Check: https://app.sendgrid.com/settings/sender_auth');
    } else {
        console.log('   ❌ EMAIL_FROM not set!');
    }
    
    // Test email sending
    console.log('\n🧪 Testing Email Send...');
    console.log('='.repeat(50));
    
    try {
        const testHtml = '<p>This is a test email from the diagnostic script.</p>';
        const result = await sendNotificationEmail(
            'gemauck@gmail.com',
            'Email Diagnostic Test - ' + new Date().toLocaleString(),
            testHtml
        );
        
        console.log('\n✅ Email sent successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('\n📬 Next Steps:');
        console.log('   1. Check your inbox (and spam folder)');
        console.log('   2. Check SendGrid Activity: https://app.sendgrid.com/activity');
        console.log('   3. If not received, verify sender email in SendGrid');
        
    } catch (error) {
        console.log('\n❌ Email send failed!');
        console.log('   Error:', error.message);
        console.log('\n🔧 Common Issues:');
        
        if (error.message.includes('verified')) {
            console.log('   ❌ SENDER NOT VERIFIED:');
            console.log('      1. Go to: https://app.sendgrid.com/settings/sender_auth');
            console.log('      2. Click "Verify a Single Sender"');
            console.log('      3. Enter:', fromEmail || 'YOUR_EMAIL_FROM');
            console.log('      4. Verify the email address');
        }
        
        if (error.message.includes('API key')) {
            console.log('   ❌ API KEY ISSUE:');
            console.log('      - Check your SendGrid API key is correct');
            console.log('      - Ensure it has "Mail Send" permissions');
            console.log('      - Key should start with "SG."');
        }
        
        if (!sendGridKey) {
            console.log('   ❌ SENDGRID NOT CONFIGURED:');
            console.log('      - Set SENDGRID_API_KEY or SMTP_PASS with SendGrid key');
        }
        
        if (!fromEmail) {
            console.log('   ❌ EMAIL_FROM NOT SET:');
            console.log('      - Set EMAIL_FROM in .env file');
        }
        
        console.log('\n📊 Full Error Details:');
        console.log(error.stack || error);
    }
    
    console.log('\n' + '='.repeat(50));
}

diagnoseEmail().catch(console.error);

