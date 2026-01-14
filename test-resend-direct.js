// Test resend invitation email sending directly
import { sendInvitationEmail } from './api/_lib/email.js';
import { getAppUrl } from './api/_lib/getAppUrl.js';

const testEmail = process.argv[2] || 'garethm@abcotronics.co.za';

console.log('🧪 Testing Resend Invitation Email Sending...');
console.log('📧 Test email:', testEmail);
console.log('📧 Email From:', process.env.EMAIL_FROM);
console.log('📧 Resend API Key:', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
console.log('');

const invitationLink = `${getAppUrl()}/accept-invitation?token=test-token-12345`;

try {
    console.log('📤 Sending test invitation email...');
    const result = await sendInvitationEmail({
        email: testEmail,
        name: 'Test User',
        role: 'user',
        invitationLink: invitationLink
    });
    
    console.log('');
    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('');
    console.log('Check your inbox (and spam folder) for the test email.');
    process.exit(0);
} catch (error) {
    console.error('');
    console.error('❌ Failed to send email:');
    console.error('Error:', error.message);
    if (error.stack) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
}











