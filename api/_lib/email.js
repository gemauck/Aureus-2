// Email service using nodemailer
import nodemailer from 'nodemailer';

// Build transporter from environment variables
// Supported envs:
// - SMTP_URL (e.g. smtp://user:pass@smtp.gmail.com:587)
// - or granular: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
// - or GMAIL_USER, GMAIL_APP_PASSWORD for Gmail App Password auth
// - For SendGrid: Use HTTP API when SMTP_HOST=smtp.sendgrid.net (avoids port blocking)

let transporter = null;
let transporterInitialized = false;
let useSendGridHTTP = false;

// Send email via SendGrid HTTP API (bypasses SMTP port blocking)
async function sendViaSendGridAPI(mailOptions, apiKey) {
    // Extract email from "Name <email>" format if needed
    let fromEmail = mailOptions.from;
    let fromName = mailOptions.fromName || 'Abcotronics';
    
    if (mailOptions.from.includes('<')) {
        const match = mailOptions.from.match(/^(.+?)\s*<(.+)>$/);
        if (match) {
            fromName = match[1].trim() || fromName;
            fromEmail = match[2].trim();
        }
    }
    
    const payload = {
        personalizations: [{
            to: [{ email: mailOptions.to }],
            subject: mailOptions.subject
        }],
        from: { email: fromEmail, name: fromName },
        content: []
    };
    
    // Add reply_to if provided
    if (mailOptions.replyTo) {
        const replyEmail = mailOptions.replyTo.includes('<') 
            ? mailOptions.replyTo.match(/<(.+)>/)?.[1] || mailOptions.replyTo
            : mailOptions.replyTo;
        payload.reply_to = { email: replyEmail };
    }
    
    // SendGrid requires text/plain first, then text/html
    if (mailOptions.text) {
        payload.content.push({
            type: 'text/plain',
            value: mailOptions.text
        });
    }
    
    if (mailOptions.html) {
        payload.content.push({
            type: 'text/html',
            value: mailOptions.html
        });
    } else if (mailOptions.text) {
        // If no HTML but we have text, use text for HTML too
        payload.content.push({
            type: 'text/html',
            value: mailOptions.text.replace(/\n/g, '<br>')
        });
    }
    
    console.log('📧 SendGrid API payload:', {
        to: mailOptions.to,
        from: { email: fromEmail, name: fromName },
        subject: mailOptions.subject,
        hasHtml: !!mailOptions.html,
        hasText: !!mailOptions.text
    });
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorDetails = errorText;
        try {
            const errorJson = JSON.parse(errorText);
            errorDetails = JSON.stringify(errorJson, null, 2);
            // Check for common SendGrid errors
            if (errorJson.errors) {
                errorJson.errors.forEach(err => {
                    if (err.message && err.message.includes('verified')) {
                        console.error('❌ SENDER VERIFICATION ERROR: The email address must be verified in SendGrid!');
                        console.error('   Go to: https://app.sendgrid.com/settings/sender_auth');
                        console.error('   Verify: ' + fromEmail);
                    }
                });
            }
        } catch (e) {
            // Not JSON, use as-is
        }
        console.error('❌ SendGrid API error response:', errorDetails);
        throw new Error(`SendGrid API error: ${response.status} ${response.statusText} - ${errorDetails}`);
    }

    return {
        success: true,
        messageId: `sendgrid-${Date.now()}`,
        response
    };
}

function getTransporter() {
    // Create transporter lazily to ensure env vars are loaded
    if (!transporterInitialized) {
        transporterInitialized = true;
        
        const host = process.env.SMTP_HOST || 'smtp.gmail.com';
        const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SENDGRID_API_KEY;
        const sendGridKey = process.env.SENDGRID_API_KEY || pass;
        
        // Use SendGrid HTTP API if:
        // 1. Explicit SENDGRID_API_KEY is set, OR
        // 2. SMTP_HOST is sendgrid.net AND password looks like SendGrid API key (starts with SG.)
        const isSendGrid = process.env.SENDGRID_API_KEY || 
                          (host === 'smtp.sendgrid.net' && sendGridKey && sendGridKey.startsWith('SG.'));
        
        if (isSendGrid) {
            console.log('📧 Using SendGrid HTTP API (bypasses SMTP port blocking)');
            console.log('📧 SendGrid API Key:', sendGridKey ? `${sendGridKey.substring(0, 5)}...` : 'NOT SET');
            useSendGridHTTP = true;
            transporter = { useHTTP: true, apiKey: sendGridKey }; // Flag to use HTTP API
            return transporter;
        }
        
        if (process.env.SMTP_URL) {
            transporter = nodemailer.createTransport(process.env.SMTP_URL);
        } else {
            const port = Number(process.env.SMTP_PORT || 587);
            const secure = String(process.env.SMTP_SECURE || 'false') === 'true' || port === 465;

            const user = process.env.SMTP_USER || process.env.GMAIL_USER;

            console.log('📧 Initializing email transporter...', {
                host,
                port,
                secure,
                hasUser: !!user,
                hasPass: !!pass
            });

            transporter = nodemailer.createTransport({
                host,
                port,
                secure, // true for 465, false for 587 (STARTTLS)
                auth: user && pass ? { user, pass } : undefined,
                tls: {
                    // Do not fail on invalid certs for development
                    rejectUnauthorized: false
                },
                connectionTimeout: 5000, // 5 seconds - fail fast if no config
                greetingTimeout: 5000,
                socketTimeout: 5000,
                debug: process.env.NODE_ENV === 'development', // Enable debug output
                logger: process.env.NODE_ENV === 'development' // Enable logging
            });

            // Verify connection configuration asynchronously (skip for SendGrid HTTP)
            if (host !== 'smtp.sendgrid.net') {
                transporter.verify((error, success) => {
                    if (error) {
                        console.error('❌ Email service configuration error:', error);
                        console.error('❌ Email service details:', {
                            message: error.message,
                            code: error.code,
                            command: error.command,
                            response: error.response
                        });
                        console.error('⚠️ Email sending will fail. Check your SMTP configuration in environment variables.');
                    } else {
                        console.log('✅ Email service ready to send messages');
                    }
                });
            }
        }
    }
    
    return transporter;
}

function checkEmailConfiguration() {
    // Check for SendGrid API key first (preferred for production)
    const sendGridKey = process.env.SENDGRID_API_KEY || 
                       (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
    
    // If SendGrid is configured, that's sufficient
    if (sendGridKey) {
        return true;
    }
    
    // Otherwise, check for SMTP credentials
    const user = process.env.SMTP_USER || process.env.GMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
    
    if (!user || !pass) {
        throw new Error('Email configuration incomplete. Either:\n  - Set SENDGRID_API_KEY (or SMTP_PASS with SendGrid key starting with SG.), OR\n  - Set SMTP_USER and SMTP_PASS (or GMAIL_USER and GMAIL_APP_PASSWORD)');
    }
    
    return true;
}

// Send invitation email
export const sendInvitationEmail = async (invitationData) => {
    const { email, name, role, invitationLink } = invitationData;
    
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@abcotronics.co.za';
    // Format from field with name "Abcotronics" if it's just an email address
    const fromAddress = emailFrom.includes('<') ? emailFrom : `Abcotronics <${emailFrom}>`;
    
    const mailOptions = {
        from: fromAddress,
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
                            If you need help, contact us at <a href="mailto:garethm@abcotronics.co.za">garethm@abcotronics.co.za</a>
                        </p>
                    </div>
                    
                    <p style="color: #555; line-height: 1.6;">
                        Best regards,<br>
                        Gareth Mauck
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
            If you need help, contact us at garethm@abcotronics.co.za
            
            Best regards,
            Gareth Mauck
        `
    };

    // Check configuration (warn but don't block)
    let configWarning = null;
    try {
        checkEmailConfiguration();
    } catch (configError) {
        configWarning = configError.message;
        console.warn('⚠️ Email configuration check warning:', configWarning);
        console.warn('⚠️ Will attempt to send anyway - actual send attempt will provide better error details');
    }
    
    try {
        const emailTransporter = getTransporter();

        // Get SendGrid API key - check multiple sources
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (emailTransporter.apiKey && emailTransporter.apiKey.startsWith('SG.') ? emailTransporter.apiKey : null) ||
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Early exit if no email configuration at all
        const hasAnyConfig = !!(
            process.env.SENDGRID_API_KEY || 
            (process.env.SMTP_USER && process.env.SMTP_PASS) ||
            (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
            process.env.SMTP_URL
        );
        
        if (!hasAnyConfig) {
            throw new Error('Email configuration not available. Please configure SENDGRID_API_KEY or SMTP settings in your .env file.');
        }
        
        console.log('📧 Sending email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            method: useSendGridHTTP ? 'SendGrid HTTP API' : 'SMTP',
            hasSendGridKey: !!sendGridKey,
            configWarning: configWarning
        });
        
        // Use SendGrid HTTP API if configured
        // Priority: SendGrid API key takes precedence over SMTP
        let result;
        if (sendGridKey && (useSendGridHTTP || emailTransporter.useHTTP)) {
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaSendGridAPI(mailOptions, sendGridKey);
        } else if (emailTransporter && typeof emailTransporter.sendMail === 'function') {
            // Only try SMTP if we have a valid transporter
            // Use Promise.race to prevent long timeouts
            const sendPromise = emailTransporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email sending timed out after 10 seconds')), 10000)
            );
            result = await Promise.race([sendPromise, timeoutPromise]);
        } else {
            // No valid email configuration
            throw new Error('No email transporter available. Please configure SENDGRID_API_KEY or SMTP settings.');
        }
        
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
        
        // Provide more helpful error messages
        let errorMessage = error.message;
        if (error.code === 'EAUTH') {
            errorMessage = 'Email authentication failed. Please check your SMTP username and password (app password for Gmail).';
        } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Email connection failed. Please check your network connection and SMTP server settings.';
        } else if (error.message.includes('SendGrid API error')) {
            // Extract SendGrid-specific errors
            if (error.message.includes('verified')) {
                errorMessage = 'SendGrid sender email not verified. Please verify your sender email in SendGrid dashboard.';
            } else {
                errorMessage = error.message;
            }
        } else if (configWarning && error.message.includes('sendMail')) {
            // If config check warned and send failed, combine messages
            errorMessage = `${configWarning}. Additionally: ${error.message}`;
        }
        
        throw new Error(`Failed to send invitation email: ${errorMessage}`);
    }
};

// Send password reset email
export const sendPasswordResetEmail = async ({ email, name, resetLink }) => {
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@abcotronics.co.za';
    const fromAddress = emailFrom.includes('<') ? emailFrom : `Abcotronics <${emailFrom}>`;

    const mailOptions = {
        from: fromAddress,
        replyTo: process.env.EMAIL_REPLY_TO || 'garethm@abcotronics.co.za',
        to: email,
        subject: 'Reset your Abcotronics password',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Password Reset</h1>
                </div>
                <div style="padding: 30px; background: #f8f9fa;">
                    <p style="color: #555; line-height: 1.6;">Hi ${name || email},</p>
                    <p style="color: #555; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new password.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}" style="background: #1d4ed8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                    </div>
                    <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.</p>
                </div>
                <div style="background: #343a40; color: white; padding: 16px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">© 2024 Abcotronics. All rights reserved.</p>
                </div>
            </div>
        `,
        text: `Password Reset\n\nHi ${name || email},\n\nClick this link to reset your password: ${resetLink}\n\nIf you didn't request this, ignore this email. The link expires in 1 hour.`
    };

    try {
        checkEmailConfiguration();
        const emailTransporter = getTransporter();
        
        // Get SendGrid API key - check multiple sources
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (emailTransporter.apiKey && emailTransporter.apiKey.startsWith('SG.') ? emailTransporter.apiKey : null) ||
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Use SendGrid HTTP API if configured
        // Priority: SendGrid API key takes precedence over SMTP
        let result;
        if (sendGridKey && (useSendGridHTTP || emailTransporter.useHTTP)) {
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaSendGridAPI(mailOptions, sendGridKey);
        } else {
            result = await emailTransporter.sendMail(mailOptions);
        }
        console.log('✅ Password reset email sent:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Failed to send password reset email:', error);
        throw new Error(`Failed to send password reset email: ${error.message}`);
    }
};

// Send notification email
export const sendNotificationEmail = async (to, subject, message, options = {}) => {
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'garethm@abcotronics.co.za';
    const fromAddress = emailFrom.includes('<') ? emailFrom : `Abcotronics <${emailFrom}>`;
    
    // Extract project-related information from options
    const { 
        projectName, 
        clientName, 
        clientDescription, 
        projectDescription, 
        commentText, 
        commentLink, 
        taskTitle,
        isProjectRelated 
    } = options;
    
    // Helper function to escape HTML for security
    const escapeHtml = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    
    // Build base URL for comment link (use environment variable or default)
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fullCommentLink = commentLink ? `${baseUrl}${commentLink.startsWith('/') ? commentLink : '/' + commentLink}` : null;
    
    // Build project information section HTML (shown at bottom after message)
    // Always show link button when there's project context, even if no additional info
    let projectInfoHtml = '';
    if (isProjectRelated) {
        // Determine link text based on context
        let linkText = 'View in Project';
        if (taskTitle) {
            linkText = 'View Task';
        }
        
        projectInfoHtml = `
            <div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 4px;">
                ${(projectDescription || clientDescription) ? `
                    <h3 style="color: #333; margin-top: 0; margin-bottom: 15px; font-size: 16px;">📋 Additional Information</h3>
                    ${clientDescription ? `
                        <div style="margin-bottom: 12px;">
                            <strong style="color: #555; display: block; margin-bottom: 5px;">Client Notes:</strong>
                            <p style="color: #666; margin: 0; line-height: 1.5;">${escapeHtml(clientDescription)}</p>
                        </div>
                    ` : ''}
                    ${projectDescription ? `
                        <div style="margin-bottom: 12px;">
                            <strong style="color: #555; display: block; margin-bottom: 5px;">Project Description:</strong>
                            <p style="color: #666; margin: 0; line-height: 1.5;">${escapeHtml(projectDescription)}</p>
                        </div>
                    ` : ''}
                ` : ''}
                ${fullCommentLink ? `
                    <div style="margin-top: ${(projectDescription || clientDescription) ? '15px' : '0'};">
                        <a href="${fullCommentLink}" 
                           style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                            ${linkText}
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    const mailOptions = {
        from: fromAddress,
        replyTo: process.env.EMAIL_REPLY_TO || 'garethm@abcotronics.co.za',
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
                        ${projectInfoHtml}
                    </div>
                </div>
                
                <div style="background: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">© 2024 Abcotronics. All rights reserved.</p>
                </div>
            </div>
        `,
        text: (() => {
            let text = subject + '\n\n';
            
            // Add project context to plain text email
            if (isProjectRelated && (clientName || projectName || taskTitle)) {
                text += '--- Project Context ---\n';
                if (clientName) {
                    text += `Client: ${clientName}\n`;
                }
                if (projectName) {
                    text += `Project: ${projectName}\n`;
                }
                if (taskTitle) {
                    text += `Task: ${taskTitle}\n`;
                }
                text += '\n';
            }
            
            // Add message content (strip HTML)
            text += message.replace(/<[^>]*>/g, '');
            
            // Add comment text if available
            if (commentText) {
                const commentPreview = commentText.length > 200 
                    ? commentText.substring(0, 200) + '...' 
                    : commentText;
                text += '\n\n--- Comment ---\n';
                text += commentPreview + '\n';
            }
            
            // Add additional project information
            if (isProjectRelated) {
                text += '\n--- Additional Information ---\n';
                if (clientDescription) {
                    text += `Client Notes: ${clientDescription.replace(/<[^>]*>/g, '')}\n\n`;
                }
                if (projectDescription) {
                    text += `Project Description: ${projectDescription.replace(/<[^>]*>/g, '')}\n\n`;
                }
                if (fullCommentLink) {
                    text += `View in Project: ${fullCommentLink}\n`;
                }
            }
            
            return text;
        })()
    };

    try {
        // Check configuration before attempting to send
        let configError = null;
        try {
            checkEmailConfiguration();
        } catch (configCheckError) {
            configError = configCheckError;
            console.error('❌ Email configuration check failed:', configCheckError.message);
            // Continue anyway - the actual send attempt will provide better error details
        }
        
        const emailTransporter = getTransporter();
        
        // Get SendGrid API key - check multiple sources
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (emailTransporter?.apiKey && emailTransporter.apiKey.startsWith('SG.') ? emailTransporter.apiKey : null) ||
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Check if we have any email configuration
        const hasAnyConfig = !!(
            process.env.SENDGRID_API_KEY || 
            (process.env.SMTP_USER && process.env.SMTP_PASS) ||
            (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
            process.env.SMTP_URL
        );
        
        if (!hasAnyConfig) {
            const errorMsg = 'Email configuration not available. Please configure SENDGRID_API_KEY or SMTP settings in your .env file.';
            console.error('❌', errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('📧 Sending notification email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            method: useSendGridHTTP ? 'SendGrid HTTP API' : 'SMTP',
            hasSendGridKey: !!sendGridKey,
            hasEmailTransporter: !!emailTransporter,
            configError: configError?.message
        });
        
        // Use SendGrid HTTP API if configured
        // Priority: SendGrid API key takes precedence over SMTP
        let result;
        if (sendGridKey && (useSendGridHTTP || emailTransporter?.useHTTP)) {
            console.log('📧 Using SendGrid HTTP API for notification email');
            mailOptions.fromName = 'Abcotronics';
            // Extract email from "Name <email>" format if needed
            const fromEmail = mailOptions.from.includes('<') 
                ? mailOptions.from.match(/<(.+)>/)?.[1] || mailOptions.from
                : mailOptions.from;
            mailOptions.from = fromEmail; // SendGrid API expects just email
            result = await sendViaSendGridAPI(mailOptions, sendGridKey);
        } else if (emailTransporter && typeof emailTransporter.sendMail === 'function') {
            console.log('📧 Using SMTP for notification email');
            // Use Promise.race to prevent long timeouts
            const sendPromise = emailTransporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email sending timed out after 15 seconds')), 15000)
            );
            result = await Promise.race([sendPromise, timeoutPromise]);
        } else {
            const errorMsg = 'No email transporter available. Please configure SENDGRID_API_KEY or SMTP settings.';
            console.error('❌', errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('✅ Notification email sent successfully:', {
            messageId: result?.messageId,
            success: result?.success,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        return { success: true, messageId: result?.messageId || result?.messageId || 'unknown' };
    } catch (error) {
        console.error('❌ Failed to send notification email:', error);
        console.error('❌ Email sending error details:', {
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response,
            stack: error.stack,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        
        // Provide more helpful error messages
        let errorMessage = error.message;
        if (error.code === 'EAUTH') {
            errorMessage = 'Email authentication failed. Please check your SMTP username and password (app password for Gmail).';
        } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Email connection failed. Please check your network connection and SMTP server settings.';
        } else if (error.message && error.message.includes('SendGrid API error')) {
            // Extract SendGrid-specific errors
            if (error.message.includes('verified')) {
                errorMessage = 'SendGrid sender email not verified. Please verify your sender email in SendGrid dashboard.';
            } else {
                errorMessage = error.message;
            }
        } else if (error.message && error.message.includes('configuration')) {
            errorMessage = error.message;
        }
        
        throw new Error(`Failed to send notification email: ${errorMessage}`);
    }
};
