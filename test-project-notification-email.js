// Test project notification email with client description, project description, and comment link
import dotenv from 'dotenv';
dotenv.config();
import { sendNotificationEmail } from './api/_lib/email.js';

async function testProjectNotificationEmail() {
    try {
        const recipientEmail = process.env.TEST_EMAIL || 'gemauck@gmail.com';
        console.log(`📧 Sending test project notification email to ${recipientEmail}...\n`);
        console.log('='.repeat(60));
        
        // Simulate a project comment notification
        const testMessage = `
            <p style="color: #333; margin-bottom: 15px; line-height: 1.6;">
                <strong>John Doe</strong> commented on "<strong>Implement User Authentication</strong>" in project "<strong>Website Redesign</strong>":
            </p>
            <div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <p style="color: #555; margin: 0; font-style: italic; line-height: 1.6;">
                    "This looks good! Let's make sure we handle edge cases for password reset."
                </p>
            </div>
        `;
        
        // Test with project-related information
        const projectOptions = {
            clientDescription: 'Acme Corporation is a leading technology company specializing in enterprise software solutions. They have been our client since 2020 and are known for their innovative approach to digital transformation.',
            projectDescription: 'Website Redesign project involves a complete overhaul of the company website with modern UI/UX, improved performance, and enhanced user experience. The project includes frontend development, backend API integration, and content migration.',
            commentLink: '/projects/proj_123#task-task_456',
            isProjectRelated: true
        };
        
        console.log('📧 Email Details:');
        console.log('   To:', recipientEmail);
        console.log('   Subject: New comment on task: Implement User Authentication');
        console.log('   Includes Client Description: ✅');
        console.log('   Includes Project Description: ✅');
        console.log('   Includes Comment Link: ✅');
        console.log('\n📧 Sending email...\n');
        
        const result = await sendNotificationEmail(
            recipientEmail,
            'New comment on task: Implement User Authentication',
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
        console.log('   ✅ Client Description');
        console.log('   ✅ Project Description');
        console.log('   ✅ View Comment Location button');
        console.log('\n📊 Check SendGrid Activity: https://app.sendgrid.com/activity\n');
        
    } catch (error) {
        console.error('❌ Failed to send test email:', error.message);
        console.error('\nError details:', error.stack);
        process.exit(1);
    }
}

testProjectNotificationEmail();

