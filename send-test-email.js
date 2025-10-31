// Send test email to gemauck@gmail.com
import dotenv from 'dotenv';
dotenv.config();
import { sendNotificationEmail } from './api/_lib/email.js';

async function sendTestEmail() {
    try {
        console.log('📧 Sending test email to gemauck@gmail.com...\n');
        
        const testContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">✅ Test Email from SendGrid</h1>
                </div>
                
                <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px;">
                    <h2 style="color: #333;">Hello!</h2>
                    
                    <p style="color: #555; line-height: 1.6;">
                        This is a test email sent via SendGrid to verify that feedback emails are working correctly.
                    </p>
                    
                    <div style="background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="color: #333; margin: 0;"><strong>Email Details:</strong></p>
                        <ul style="color: #555; margin: 10px 0;">
                            <li><strong>From:</strong> ${process.env.EMAIL_FROM || 'garethm@abcotronics.co.za'}</li>
                            <li><strong>To:</strong> gemauck@gmail.com</li>
                            <li><strong>Sent:</strong> ${new Date().toLocaleString()}</li>
                            <li><strong>Service:</strong> SendGrid HTTP API</li>
                        </ul>
                    </div>
                    
                    <p style="color: #555; line-height: 1.6;">
                        If you receive this email, it means:
                    </p>
                    <ul style="color: #555;">
                        <li>✅ SendGrid API is working correctly</li>
                        <li>✅ Email configuration is correct</li>
                        <li>✅ Feedback notification emails should work</li>
                    </ul>
                    
                    <div style="background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="color: #666; margin: 0; font-size: 14px;">
                            <strong>Note:</strong> If this email went to spam, please mark it as "Not Spam" to help with future deliveries.
                        </p>
                    </div>
                    
                    <p style="color: #555; line-height: 1.6; margin-top: 20px;">
                        Best regards,<br>
                        Abcotronics ERP System
                    </p>
                </div>
            </div>
        `;
        
        const result = await sendNotificationEmail(
            'gemauck@gmail.com',
            'Test Email from SendGrid - Feedback System',
            testContent
        );
        
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('   To: gemauck@gmail.com');
        console.log('   From:', process.env.EMAIL_FROM || 'garethm@abcotronics.co.za');
        console.log('\n📬 Check your inbox (and spam folder) for the email!');
        console.log('📊 Check SendGrid Activity: https://app.sendgrid.com/activity\n');
        
    } catch (error) {
        console.error('❌ Failed to send test email:', error.message);
        console.error('\nError details:', error.stack);
        process.exit(1);
    }
}

sendTestEmail();

