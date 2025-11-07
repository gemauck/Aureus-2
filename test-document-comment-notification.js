// Test Document Comment Notification Email
// This tests the email notification system for document comments
import dotenv from 'dotenv';
dotenv.config();
import { sendNotificationEmail } from './api/_lib/email.js';

async function testDocumentCommentNotification() {
    try {
        const recipientEmail = process.env.TEST_EMAIL || 'gemauck@gmail.com';
        console.log(`📧 Testing Document Comment Notification Email`);
        console.log(`📬 Sending to: ${recipientEmail}\n`);
        console.log('='.repeat(60));
        
        // Simulate a document comment notification (like what we just fixed)
        const testMessage = `
            <p style="color: #333; margin-bottom: 15px; line-height: 1.6;">
                <strong>John Doe</strong> commented on "<strong>Invoice Template</strong>" in <strong>Financial Documents</strong> (Website Redesign):
            </p>
            <div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <p style="color: #555; margin: 0; font-style: italic; line-height: 1.6;">
                    "Please review the invoice format for November 2025. All fields look correct."
                </p>
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 15px;">
                This is a test notification to verify that document comment emails are working correctly after the fix.
            </p>
        `;
        
        // Test with project-related information (same format as document comments)
        const projectOptions = {
            clientDescription: 'Acme Corporation is a leading technology company specializing in enterprise software solutions.',
            projectDescription: 'Website Redesign project involves a complete overhaul of the company website with modern UI/UX.',
            commentLink: '/projects/proj_123',
            isProjectRelated: true
        };
        
        console.log('📧 Email Details:');
        console.log('   To:', recipientEmail);
        console.log('   Subject: New comment on document: Invoice Template');
        console.log('   Type: Comment notification (document)');
        console.log('   Includes Client Description: ✅');
        console.log('   Includes Project Description: ✅');
        console.log('   Includes Comment Link: ✅');
        console.log('\n📧 Sending email...\n');
        
        const result = await sendNotificationEmail(
            recipientEmail,
            'New comment on document: Invoice Template',
            testMessage,
            projectOptions
        );
        
        console.log('='.repeat(60));
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('   To:', recipientEmail);
        console.log('   From:', process.env.EMAIL_FROM || 'garethm@abcotronics.co.za');
        console.log('\n📬 Check your inbox (and spam folder) for the email!');
        console.log('   The email should include:');
        console.log('   ✅ Document name and section');
        console.log('   ✅ Project name');
        console.log('   ✅ Comment preview');
        console.log('   ✅ Client Description');
        console.log('   ✅ Project Description');
        console.log('   ✅ View Comment Location button');
        console.log('\n📊 Check SendGrid Activity: https://app.sendgrid.com/activity');
        console.log('\n💡 This test verifies that:');
        console.log('   1. Email notifications are working for document comments');
        console.log('   2. Project metadata is included in emails');
        console.log('   3. The notification system can send emails correctly');
        console.log('');
        
    } catch (error) {
        console.error('❌ Failed to send test email:', error.message);
        console.error('\nError details:', error.stack);
        process.exit(1);
    }
}

testDocumentCommentNotification();

