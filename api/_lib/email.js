// Email service using nodemailer
import nodemailer from 'nodemailer';

// Build transporter from environment variables
// Supported envs:
// - SMTP_URL (e.g. smtp://user:pass@smtp.gmail.com:587)
// - or granular: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
// - or GMAIL_USER, GMAIL_APP_PASSWORD for Gmail App Password auth

function createTransporterFromEnv() {
    if (process.env.SMTP_URL) {
        return nodemailer.createTransport(process.env.SMTP_URL);
    }

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || 'false') === 'true' || port === 465;

    const user = process.env.SMTP_USER || process.env.GMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        tls: {
            // Do not fail on invalid certs for development
            rejectUnauthorized: false
        }
    });
}

const transporter = createTransporterFromEnv();

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email service configuration error:', error);
        console.error('❌ Email service details:', {
            message: error.message,
            code: error.code,
            command: error.command
        });
    } else {
        console.log('✅ Email service ready to send messages');
    }
});

// Send invitation email
export const sendInvitationEmail = async (invitationData) => {
    const { email, name, role, invitationLink } = invitationData;
    
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@abcotronics.co.za',
        replyTo: process.env.EMAIL_REPLY_TO || 'garethm@abcotronics.co.za',
        to: email,
        subject: 'Invitation to Join Abcotronics System',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">🎉 You're Invited!</h1>
                </div>
                
                <div style="padding: 30px; background: #f8f9fa;">
                    <h2 style="color: #333; margin-bottom: 20px;">Welcome to Abcotronics</h2>
                    
                    <p style="color: #555; line-height: 1.6;">Hi ${name},</p>
                    
                    <p style="color: #555; line-height: 1.6;">
                        You've been invited to join the Abcotronics system with the role: <strong>${role}</strong>
                    </p>
                    
                    <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <p style="color: #333; margin-bottom: 15px;"><strong>Your Account Details:</strong></p>
                        <ul style="color: #555; margin: 0;">
                            <li><strong>Email:</strong> ${email}</li>
                            <li><strong>Role:</strong> ${role}</li>
                            <li><strong>Company:</strong> Abcotronics</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${invitationLink}" 
                           style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                            Accept Invitation
                        </a>
                    </div>
                    
                    <div style="background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="color: #666; margin: 0; font-size: 14px;">
                            <strong>Important:</strong> This invitation link will expire in 7 days. 
                            If you need help, contact us at <a href="mailto:support@abcotronics.co.za">support@abcotronics.co.za</a>
                        </p>
                    </div>
                    
                    <p style="color: #555; line-height: 1.6;">
                        Best regards,<br>
                        The Abcotronics Team
                    </p>
                </div>
                
                <div style="background: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">© 2024 Abcotronics. All rights reserved.</p>
                </div>
            </div>
        `,
        text: `
            Welcome to Abcotronics
            
            Hi ${name},
            
            You've been invited to join the Abcotronics system with the role: ${role}
            
            Your Account Details:
            - Email: ${email}
            - Role: ${role}
            - Company: Abcotronics
            
            To accept your invitation, click this link: ${invitationLink}
            
            Important: This invitation link will expire in 7 days.
            If you need help, contact us at support@abcotronics.co.za
            
            Best regards,
            The Abcotronics Team
        `
    };

    try {
        console.log('📧 Sending email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        
        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Invitation email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Failed to send invitation email:', error);
        console.error('❌ Email sending error details:', {
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response
        });
        throw new Error(`Failed to send invitation email: ${error.message}`);
    }
};

// Send notification email
export const sendNotificationEmail = async (to, subject, message) => {
    const mailOptions = {
        from: 'garethm@abcotronics.co.za',
        to: to,
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #007bff; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">${subject}</h1>
                </div>
                
                <div style="padding: 30px; background: #f8f9fa;">
                    <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
                        ${message}
                    </div>
                </div>
                
                <div style="background: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">© 2024 Abcotronics. All rights reserved.</p>
                </div>
            </div>
        `
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Failed to send notification email:', error);
        throw new Error('Failed to send notification email');
    }
};
