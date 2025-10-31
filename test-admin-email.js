// Test email to admin user garethm@abcotronics.co.za
import dotenv from 'dotenv';
dotenv.config();
import { sendNotificationEmail } from './api/_lib/email.js';

async function testAdminEmail() {
    try {
        console.log('📧 Testing feedback email to admin: garethm@abcotronics.co.za\n');
        console.log('='.repeat(60));
        
        const adminEmail = 'garethm@abcotronics.co.za';
        
        // Simulate feedback notification email
        const feedbackContent = `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #333; margin-bottom: 10px;"><strong>Submitted by:</strong> Test User</p>
                <p style="color: #333; margin-bottom: 10px;"><strong>Section:</strong> Testing</p>
                <p style="color: #333; margin-bottom: 10px;"><strong>Page:</strong> /test</p>
                <p style="color: #333; margin-bottom: 10px;"><strong>Severity:</strong> 🔴 High</p>
                <p style="color: #333; margin-bottom: 10px;"><strong>Type:</strong> feedback</p>
                
                <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px;">
                    <p style="color: #555; margin: 0; white-space: pre-wrap;">This is a test feedback notification to verify the admin email system is working for garethm@abcotronics.co.za.</p>
                </div>
            </div>
        `;
        
        console.log('📧 Sending test feedback notification...\n');
        
        const result = await sendNotificationEmail(
            adminEmail,
            'Test Feedback Notification - Admin Email Test',
            feedbackContent
        );
        
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('   To:', adminEmail);
        console.log('   From:', process.env.EMAIL_FROM || 'garethm@abcotronics.co.za');
        console.log('\n📬 Check inbox for garethm@abcotronics.co.za (and spam folder)');
        console.log('📊 Check SendGrid Activity: https://app.sendgrid.com/activity\n');
        
        console.log('ℹ️  Important Notes:');
        console.log('   - If email doesn\'t arrive, check sender verification in SendGrid');
        console.log('   - Sender email (garethm@abcotronics.co.za) must be verified');
        console.log('   - Verify at: https://app.sendgrid.com/settings/sender_auth');
        console.log('   - Check spam/junk folder');
        
    } catch (error) {
        console.error('❌ Failed to send test email:', error.message);
        
        if (error.message.includes('verified')) {
            console.error('\n🔴 SENDER NOT VERIFIED!');
            console.error('   The email garethm@abcotronics.co.za needs to be verified in SendGrid.');
            console.error('   Go to: https://app.sendgrid.com/settings/sender_auth');
        }
        
        console.error('\nFull error:', error.stack);
    }
}

testAdminEmail();

