// Email service using nodemailer
import nodemailer from 'nodemailer';
import { getAppUrl } from './getAppUrl.js';

// Build transporter from environment variables
// Supported envs:
// - SMTP_URL (e.g. smtp://user:pass@smtp.gmail.com:587)
// - or granular: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
// - or GMAIL_USER, GMAIL_APP_PASSWORD for Gmail App Password auth
// - For SendGrid: Use HTTP API when SMTP_HOST=smtp.sendgrid.net (avoids port blocking)
// - For Resend: Use HTTP API when RESEND_API_KEY is set (preferred, modern API)

let transporter = null;
let transporterInitialized = false;
let useSendGridHTTP = false;
let useResendHTTP = false;

// Send email via Resend HTTP API (modern, developer-friendly, bypasses SMTP port blocking)
async function sendViaResendAPI(mailOptions, apiKey) {
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
    
    // Resend API payload structure
    const payload = {
        from: `${fromName} <${fromEmail}>`,
        to: [mailOptions.to],
        subject: mailOptions.subject
    };
    
    // Add reply_to if provided
    if (mailOptions.replyTo) {
        const replyEmail = mailOptions.replyTo.includes('<') 
            ? mailOptions.replyTo.match(/<(.+)>/)?.[1] || mailOptions.replyTo
            : mailOptions.replyTo;
        payload.reply_to = [replyEmail];
    }
    
    // Resend supports both html and text
    if (mailOptions.html) {
        payload.html = mailOptions.html;
    }
    
    if (mailOptions.text) {
        payload.text = mailOptions.text;
    } else if (mailOptions.html) {
        // If no text but we have HTML, create text version
        payload.text = mailOptions.html.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n\n');
    }
    
    console.log('📧 Resend API payload:', JSON.stringify({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        hasHtml: !!payload.html,
        hasText: !!payload.text
    }, null, 2));
    
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('📧 Resend API response status:', response.status, response.statusText);
    console.log('📧 Resend API response body:', responseText);

    if (!response.ok) {
        let errorDetails = responseText;
        try {
            const errorJson = JSON.parse(responseText);
            errorDetails = JSON.stringify(errorJson, null, 2);
            // Check for common Resend errors
            if (errorJson.message) {
                console.error('❌ Resend API error:', errorJson.message);
                if (errorJson.message.includes('domain') || errorJson.message.includes('verify')) {
                    console.error('❌ DOMAIN VERIFICATION ERROR: Your sending domain must be verified in Resend!');
                    console.error('   Go to: https://resend.com/domains');
                    console.error('   Verify: ' + fromEmail.split('@')[1]);
                }
            }
        } catch (e) {
            // Not JSON, use as-is
            console.error('❌ Resend API non-JSON error response:', responseText);
        }
        console.error('❌ Resend API error response:', errorDetails);
        throw new Error(`Resend API error: ${response.status} ${response.statusText} - ${errorDetails}`);
    }

    const result = JSON.parse(responseText);
    console.log('✅ Resend API success! Message ID:', result.id);
    return {
        success: true,
        messageId: result.id || `resend-${Date.now()}`,
        response: result
    };
}

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
                console.error('❌ SendGrid API errors:', errorJson.errors);
                errorJson.errors.forEach(err => {
                    if (err.message && err.message.includes('verified')) {
                        console.error('❌ SENDER VERIFICATION ERROR: The email address must be verified in SendGrid!');
                        console.error('   Go to: https://app.sendgrid.com/settings/sender_auth');
                        console.error('   Verify: ' + fromEmail);
                    }
                    if (err.message) {
                        console.error('❌ SendGrid error:', err.message);
                    }
                });
            }
        } catch (e) {
            // Not JSON, use as-is
            console.error('❌ SendGrid API non-JSON error response:', errorText);
        }
        console.error('❌ SendGrid API error response (status ' + response.status + '):', errorDetails);
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
        
        // Priority: Resend > SendGrid > SMTP
        const resendKey = process.env.RESEND_API_KEY;
        const host = process.env.SMTP_HOST || 'smtp.gmail.com';
        const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SENDGRID_API_KEY;
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (pass && pass.startsWith('SG.') ? pass : null);
        
        // Use Resend HTTP API if API key is set (preferred - modern, developer-friendly)
        if (resendKey && resendKey.startsWith('re_')) {
            useResendHTTP = true;
            transporter = { useHTTP: true, provider: 'resend', apiKey: resendKey };
            console.log('📧 Using Resend HTTP API (modern, bypasses SMTP port blocking)');
            return transporter;
        }
        
        // Use SendGrid HTTP API if:
        // 1. Explicit SENDGRID_API_KEY is set, OR
        // 2. SMTP_HOST is sendgrid.net AND password looks like SendGrid API key (starts with SG.)
        const isSendGrid = process.env.SENDGRID_API_KEY || 
                          (host === 'smtp.sendgrid.net' && sendGridKey && sendGridKey.startsWith('SG.'));
        
        if (isSendGrid) {
            useSendGridHTTP = true;
            transporter = { useHTTP: true, provider: 'sendgrid', apiKey: sendGridKey };
            console.log('📧 Using SendGrid HTTP API (bypasses SMTP port blocking)');
            return transporter;
        }
        
        if (process.env.SMTP_URL) {
            transporter = nodemailer.createTransport(process.env.SMTP_URL);
        } else {
            const port = Number(process.env.SMTP_PORT || 587);
            const secure = String(process.env.SMTP_SECURE || 'false') === 'true' || port === 465;

            const user = process.env.SMTP_USER || process.env.GMAIL_USER;


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
                    }
                });
            }
        }
    }
    
    return transporter;
}

function checkEmailConfiguration() {
    // Priority: Resend > SendGrid > SMTP
    // Check for Resend API key first (preferred - modern, developer-friendly)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && resendKey.startsWith('re_')) {
        return true;
    }
    
    // Check for SendGrid API key
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
        throw new Error('Email configuration incomplete. Either:\n  - Set RESEND_API_KEY (recommended, starts with re_), OR\n  - Set SENDGRID_API_KEY (or SMTP_PASS with SendGrid key starting with SG.), OR\n  - Set SMTP_USER and SMTP_PASS (or GMAIL_USER and GMAIL_APP_PASSWORD)');
    }
    
    return true;
}

/**
 * Send a simple email (raw subject/body). Used for document collection requests,
 * leave notifications, and other custom user-drafted emails.
 * @param {{ to: string, subject: string, html?: string, text?: string, replyTo?: string, fromName?: string }} opts
 * @returns {{ success: boolean, messageId: string }}
 */
export async function sendEmail(opts) {
    const { to, subject, html, text, replyTo, fromName } = opts;
    if (!to || !subject) {
        throw new Error('sendEmail requires "to" and "subject"');
    }
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@abcotronics.co.za';
    const fromDisplayName = fromName && typeof fromName === 'string' ? fromName : 'Abcotronics';
    const fromEmailOnly = emailFrom.includes('<') ? (emailFrom.match(/<(.+)>/)?.[1] || emailFrom).trim() : emailFrom;
    const fromAddress = `${fromDisplayName} <${fromEmailOnly}>`;
    const textContent = text || (html ? html.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n\n') : '');
    const mailOptions = {
        from: fromAddress,
        to,
        subject,
        ...(replyTo && { replyTo }),
        ...(html && { html }),
        ...(textContent && { text: textContent })
    };
    if (fromName && typeof fromName === 'string') {
        mailOptions.fromName = fromName;
    }

    checkEmailConfiguration();
    const emailTransporter = getTransporter();
    const resendKey = process.env.RESEND_API_KEY;
    const sendGridKey = process.env.SENDGRID_API_KEY ||
        (emailTransporter?.apiKey && emailTransporter.apiKey?.startsWith?.('SG.') ? emailTransporter.apiKey : null) ||
        (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);

    const hasAnyConfig = !!(
        process.env.RESEND_API_KEY ||
        process.env.SENDGRID_API_KEY ||
        (process.env.SMTP_USER && process.env.SMTP_PASS) ||
        (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
        process.env.SMTP_URL
    );
    if (!hasAnyConfig) {
        throw new Error('Email configuration not available. Configure RESEND_API_KEY, SENDGRID_API_KEY, or SMTP settings.');
    }

    let result;
    if (resendKey && resendKey.startsWith('re_')) {
        if (!mailOptions.fromName) mailOptions.fromName = 'Abcotronics';
        result = await sendViaResendAPI(mailOptions, resendKey);
    } else if (sendGridKey && (useSendGridHTTP || emailTransporter?.provider === 'sendgrid')) {
        if (!mailOptions.fromName) mailOptions.fromName = 'Abcotronics';
        const fromEmail = mailOptions.from.includes('<')
            ? (mailOptions.from.match(/<(.+)>/)?.[1] || mailOptions.from)
            : mailOptions.from;
        mailOptions.from = fromEmail;
        result = await sendViaSendGridAPI(mailOptions, sendGridKey);
    } else if (emailTransporter && typeof emailTransporter.sendMail === 'function') {
        const sendPromise = emailTransporter.sendMail(mailOptions);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Email sending timed out after 15 seconds')), 15000)
        );
        result = await Promise.race([sendPromise, timeoutPromise]);
    } else {
        throw new Error('No email transporter available. Configure RESEND_API_KEY, SENDGRID_API_KEY, or SMTP.');
    }

    return { success: true, messageId: result?.messageId ?? result?.id ?? 'unknown' };
}

// Send invitation email
export const sendInvitationEmail = async (invitationData) => {
    const { email, name, role, invitationLink } = invitationData;
    
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@abcotronics.co.za';
    const replyToAddress = process.env.EMAIL_REPLY_TO || process.env.EMAIL_SUPPORT || emailFrom;
    const replyToEmail = replyToAddress.includes('<')
        ? (replyToAddress.match(/<(.+)>/)?.[1] || replyToAddress)
        : replyToAddress;
    // Format from field with name "Abcotronics" if it's just an email address
    const fromAddress = emailFrom.includes('<') ? emailFrom : `Abcotronics <${emailFrom}>`;
    
    const mailOptions = {
        from: fromAddress,
        // Keep Reply-To aligned to the sending domain by default (helps deliverability)
        replyTo: replyToAddress,
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
                            If you need help, contact us at <a href="mailto:${replyToEmail}">${replyToEmail}</a>
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
            If you need help, contact us at ${replyToEmail}
            
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

        // Priority: Resend > SendGrid > SMTP
        const resendKey = process.env.RESEND_API_KEY;
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (emailTransporter.apiKey && emailTransporter.apiKey.startsWith('SG.') ? emailTransporter.apiKey : null) ||
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Early exit if no email configuration at all
        const hasAnyConfig = !!(
            process.env.RESEND_API_KEY ||
            process.env.SENDGRID_API_KEY || 
            (process.env.SMTP_USER && process.env.SMTP_PASS) ||
            (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
            process.env.SMTP_URL
        );
        
        if (!hasAnyConfig) {
            throw new Error('Email configuration not available. Please configure RESEND_API_KEY (recommended), SENDGRID_API_KEY, or SMTP settings in your .env file.');
        }
        
        
        // Use Resend HTTP API if configured (preferred)
        // Priority: Resend > SendGrid > SMTP
        let result;
        if (resendKey && resendKey.startsWith('re_')) {
            // Use Resend if API key is set, regardless of transporter state
            console.log('📧 Using Resend API to send invitation email to:', email);
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaResendAPI(mailOptions, resendKey);
            console.log('✅ Resend API email sent successfully. Message ID:', result.messageId);
        } else if (sendGridKey && (useSendGridHTTP || emailTransporter.provider === 'sendgrid')) {
            console.log('📧 Using SendGrid API to send invitation email to:', email);
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaSendGridAPI(mailOptions, sendGridKey);
            console.log('✅ SendGrid API email sent successfully. Message ID:', result.messageId);
        } else if (emailTransporter && typeof emailTransporter.sendMail === 'function') {
            console.log('📧 Using SMTP to send invitation email to:', email);
            // Only try SMTP if we have a valid transporter
            // Use Promise.race to prevent long timeouts
            const sendPromise = emailTransporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email sending timed out after 10 seconds')), 10000)
            );
            result = await Promise.race([sendPromise, timeoutPromise]);
        } else {
            // No valid email configuration
            throw new Error('No email transporter available. Please configure RESEND_API_KEY (recommended), SENDGRID_API_KEY, or SMTP settings.');
        }
        
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
        } else if (error.message.includes('Resend API error')) {
            // Extract Resend-specific errors
            if (error.message.includes('domain') || error.message.includes('verify')) {
                errorMessage = 'Resend domain not verified. Please verify your sending domain in Resend dashboard (https://resend.com/domains).';
            } else {
                errorMessage = error.message;
            }
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
        
        // Priority: Resend > SendGrid > SMTP
        const resendKey = process.env.RESEND_API_KEY;
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (emailTransporter.apiKey && emailTransporter.apiKey.startsWith('SG.') ? emailTransporter.apiKey : null) ||
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Use Resend HTTP API if configured (preferred)
        // Priority: Resend > SendGrid > SMTP
        let result;
        if (resendKey && resendKey.startsWith('re_')) {
            // Use Resend if API key is set, regardless of transporter state
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaResendAPI(mailOptions, resendKey);
        } else if (sendGridKey && (useSendGridHTTP || emailTransporter.provider === 'sendgrid')) {
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaSendGridAPI(mailOptions, sendGridKey);
        } else {
            result = await emailTransporter.sendMail(mailOptions);
        }
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
        taskDescription,
        taskStatus,
        taskPriority,
        taskDueDate,
        taskListName,
        isProjectRelated,
        // Notification creation parameters (if userId provided, create in-app notification)
        userId,
        notificationType,
        notificationLink,
        notificationMetadata,
        skipNotificationCreation = false // Set to true if notification is already created elsewhere
    } = options;
    
    // If userId is provided and we're not skipping, create in-app notification
    if (userId && !skipNotificationCreation) {
        try {
            // Dynamically import prisma to avoid circular dependencies
            const { prisma } = await import('./prisma.js');
            
            // Find user by email if userId looks like an email (contains @), otherwise treat as ID
            let targetUserId = userId;
            if (userId.includes('@')) {
                // Looks like an email, try to find user by email
                try {
                    const user = await prisma.user.findUnique({
                        where: { email: userId }
                    });
                    if (user) {
                        targetUserId = user.id;
                    } else {
                        console.warn(`⚠️ Could not find user with email ${userId}, skipping notification creation`);
                        targetUserId = null;
                    }
                } catch (lookupError) {
                    console.error(`❌ Error looking up user by email ${userId}:`, lookupError);
                    targetUserId = null;
                }
            }
            // If userId doesn't contain @, assume it's already a user ID
            
            if (targetUserId) {
                // Get or create notification settings
                let settings = await prisma.notificationSetting.findUnique({
                    where: { userId: targetUserId }
                });
                
                if (!settings) {
                    settings = await prisma.notificationSetting.create({
                        data: { 
                            userId: targetUserId,
                            emailTasks: true,
                            emailMentions: true,
                            emailComments: true,
                            emailInvoices: true,
                            emailSystem: true,
                            inAppTasks: true,
                            inAppMentions: true,
                            inAppComments: true,
                            inAppInvoices: true,
                            inAppSystem: true
                        }
                    });
                }
                
                // Determine notification type (default to 'system' if not specified)
                const type = notificationType || 'system';
                
                // Check if user wants in-app notifications for this type
                let shouldCreateInAppNotification = false;
                if (type === 'mention' && settings.inAppMentions) {
                    shouldCreateInAppNotification = true;
                } else if (type === 'comment' && settings.inAppComments) {
                    shouldCreateInAppNotification = true;
                } else if (type === 'task' && settings.inAppTasks) {
                    shouldCreateInAppNotification = true;
                } else if (type === 'invoice' && settings.inAppInvoices) {
                    shouldCreateInAppNotification = true;
                } else if (type === 'system' && settings.inAppSystem) {
                    shouldCreateInAppNotification = true;
                }
                
                // Create in-app notification if enabled
                if (shouldCreateInAppNotification) {
                    // Strip HTML tags from message for notification text
                    const plainMessage = message.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                    const notificationMessage = plainMessage.length > 200 
                        ? plainMessage.substring(0, 200) + '...' 
                        : plainMessage;
                    
                    // Determine link - use notificationLink if provided, otherwise try to construct from metadata
                    let validLink = notificationLink || '/dashboard';
                    if (!validLink || validLink.trim() === '') {
                        try {
                            const metadataObj = notificationMetadata 
                                ? (typeof notificationMetadata === 'string' ? JSON.parse(notificationMetadata) : notificationMetadata)
                                : {};
                            
                            if (metadataObj.projectId) {
                                validLink = `/projects/${metadataObj.projectId}`;
                            } else if (metadataObj.clientId) {
                                validLink = `/clients/${metadataObj.clientId}`;
                            } else if (metadataObj.taskId) {
                                validLink = `/tasks/${metadataObj.taskId}`;
                            } else {
                                validLink = '/dashboard';
                            }
                        } catch (parseError) {
                            validLink = '/dashboard';
                        }
                    }
                    
                    // Ensure link starts with /
                    if (validLink && !validLink.startsWith('/') && !validLink.startsWith('#')) {
                        validLink = '/' + validLink;
                    }
                    
                    await prisma.notification.create({
                        data: {
                            userId: targetUserId,
                            type: type,
                            title: subject,
                            message: notificationMessage,
                            link: validLink || '/dashboard',
                            metadata: notificationMetadata ? JSON.stringify(notificationMetadata) : '{}',
                            read: false
                        }
                    });
                    
                    console.log(`✅ Created in-app notification for user ${targetUserId} (type: ${type})`);
                } else {
                    console.log(`⏭️ In-app notification skipped for user ${targetUserId} (type: ${type}) - preference disabled`);
                }
            }
        } catch (notificationError) {
            // Don't fail email sending if notification creation fails
            console.error('❌ Failed to create in-app notification:', notificationError);
            console.error('❌ Notification error details:', {
                message: notificationError.message,
                stack: notificationError.stack,
                userId,
                type: notificationType
            });
        }
    }
    
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
    
    // Build base URL for comment link using getAppUrl() for proper production/development handling
    let baseUrl = getAppUrl();
    // Ensure base URL has trailing slash so hash links are https://domain.com/#/... (more reliable in email clients)
    if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl = baseUrl + '/';
    }
    // Build clickable link for email: support hash routes (#/...), paths (/...), and full URLs
    let fullCommentLink = null;
    if (commentLink) {
        const trimmed = String(commentLink).trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            fullCommentLink = trimmed;
        } else if (trimmed.startsWith('#')) {
            // Hash-based routing - https://domain.com/#/projects/123?params
            fullCommentLink = `${baseUrl}${trimmed}`;
        } else if (trimmed.startsWith('/')) {
            fullCommentLink = `${baseUrl}${trimmed}`;
        } else {
            fullCommentLink = `${baseUrl}/${trimmed}`;
        }
    }
    
    // Build project information section HTML (shown at bottom after message)
    // Always show link button when there's project context, even if no additional info
    let projectInfoHtml = '';
    if (isProjectRelated) {
        // Determine link text based on context
        let linkText = 'View in Project';
        if (taskTitle) {
            linkText = 'View Task';
        }
        
        // Format due date if available
        let formattedDueDate = null;
        if (taskDueDate) {
            try {
                const dueDate = new Date(taskDueDate);
                formattedDueDate = dueDate.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            } catch (e) {
                formattedDueDate = taskDueDate;
            }
        }
        
        // Determine priority color
        let priorityColor = '#6c757d'; // Default gray
        if (taskPriority) {
            const priorityLower = taskPriority.toLowerCase();
            if (priorityLower === 'high') priorityColor = '#dc3545'; // Red
            else if (priorityLower === 'medium') priorityColor = '#ffc107'; // Yellow/Orange
            else if (priorityLower === 'low') priorityColor = '#28a745'; // Green
        }
        
        // Determine status color
        let statusColor = '#6c757d'; // Default gray
        if (taskStatus) {
            const statusLower = taskStatus.toLowerCase();
            if (statusLower.includes('done') || statusLower.includes('completed')) statusColor = '#28a745'; // Green
            else if (statusLower.includes('progress')) statusColor = '#007bff'; // Blue
            else if (statusLower.includes('blocked')) statusColor = '#dc3545'; // Red
            else if (statusLower.includes('review')) statusColor = '#ffc107'; // Yellow
        }
        
        projectInfoHtml = `
            <div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 4px;">
                ${taskTitle ? `
                    <h3 style="color: #333; margin-top: 0; margin-bottom: 15px; font-size: 18px;">📋 Task Details</h3>
                    <div style="background: white; border-radius: 4px; padding: 15px; margin-bottom: 15px;">
                        <h4 style="color: #333; margin-top: 0; margin-bottom: 10px; font-size: 16px;">${escapeHtml(taskTitle)}</h4>
                        ${taskDescription ? `
                            <div style="margin-bottom: 12px;">
                                <p style="color: #555; margin: 0; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(taskDescription)}</p>
                            </div>
                        ` : ''}
                        <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 12px;">
                            ${taskStatus ? `
                                <div>
                                    <strong style="color: #555; font-size: 12px; text-transform: uppercase; display: block; margin-bottom: 4px;">Status:</strong>
                                    <span style="background: ${statusColor}; color: white; padding: 4px 10px; border-radius: 3px; font-size: 13px; font-weight: bold;">${escapeHtml(taskStatus)}</span>
                                </div>
                            ` : ''}
                            ${taskPriority ? `
                                <div>
                                    <strong style="color: #555; font-size: 12px; text-transform: uppercase; display: block; margin-bottom: 4px;">Priority:</strong>
                                    <span style="background: ${priorityColor}; color: white; padding: 4px 10px; border-radius: 3px; font-size: 13px; font-weight: bold;">${escapeHtml(taskPriority)}</span>
                                </div>
                            ` : ''}
                            ${formattedDueDate ? `
                                <div>
                                    <strong style="color: #555; font-size: 12px; text-transform: uppercase; display: block; margin-bottom: 4px;">Due Date:</strong>
                                    <span style="color: #333; font-size: 13px;">${escapeHtml(formattedDueDate)}</span>
                                </div>
                            ` : ''}
                            ${taskListName ? `
                                <div>
                                    <strong style="color: #555; font-size: 12px; text-transform: uppercase; display: block; margin-bottom: 4px;">Location:</strong>
                                    <span style="color: #333; font-size: 13px;">${escapeHtml(taskListName)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                ${(projectDescription || clientDescription) && !taskTitle ? `
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
                ` : (projectDescription || clientDescription) ? `
                    <div style="margin-top: 15px;">
                        <h4 style="color: #333; margin-top: 0; margin-bottom: 10px; font-size: 14px;">📌 Project Context</h4>
                        ${clientDescription ? `
                            <div style="margin-bottom: 12px;">
                                <strong style="color: #555; display: block; margin-bottom: 5px;">Client Notes:</strong>
                                <p style="color: #666; margin: 0; line-height: 1.5; font-size: 13px;">${escapeHtml(clientDescription)}</p>
                            </div>
                        ` : ''}
                        ${projectDescription ? `
                            <div style="margin-bottom: 12px;">
                                <strong style="color: #555; display: block; margin-bottom: 5px;">Project Description:</strong>
                                <p style="color: #666; margin: 0; line-height: 1.5; font-size: 13px;">${escapeHtml(projectDescription)}</p>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                ${fullCommentLink ? `
                    <div style="margin-top: ${(taskTitle || projectDescription || clientDescription) ? '15px' : '0'};">
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
            
            // Add task details if available
            if (taskTitle) {
                text += '\n\n--- Task Details ---\n';
                text += `Title: ${taskTitle}\n`;
                if (taskDescription) {
                    text += `Description: ${taskDescription.replace(/<[^>]*>/g, '')}\n`;
                }
                if (taskStatus) {
                    text += `Status: ${taskStatus}\n`;
                }
                if (taskPriority) {
                    text += `Priority: ${taskPriority}\n`;
                }
                if (taskDueDate) {
                    try {
                        const dueDate = new Date(taskDueDate);
                        const formattedDueDate = dueDate.toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                        });
                        text += `Due Date: ${formattedDueDate}\n`;
                    } catch (e) {
                        text += `Due Date: ${taskDueDate}\n`;
                    }
                }
                if (taskListName) {
                    text += `Location: ${taskListName}\n`;
                }
            }
            
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
        
        // Priority: Resend > SendGrid > SMTP
        const resendKey = process.env.RESEND_API_KEY;
        const sendGridKey = process.env.SENDGRID_API_KEY || 
                           (emailTransporter?.apiKey && emailTransporter.apiKey.startsWith('SG.') ? emailTransporter.apiKey : null) ||
                           (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
        
        // Check if we have any email configuration
        const hasAnyConfig = !!(
            process.env.RESEND_API_KEY ||
            process.env.SENDGRID_API_KEY || 
            (process.env.SMTP_USER && process.env.SMTP_PASS) ||
            (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
            process.env.SMTP_URL
        );
        
        if (!hasAnyConfig) {
            const errorMsg = 'Email configuration not available. Please configure RESEND_API_KEY (recommended), SENDGRID_API_KEY, or SMTP settings in your .env file.';
            console.error('❌', errorMsg);
            throw new Error(errorMsg);
        }
        
        
        // Use Resend HTTP API if configured (preferred)
        // Priority: Resend > SendGrid > SMTP
        let result;
        if (resendKey && resendKey.startsWith('re_')) {
            // Use Resend if API key is set, regardless of transporter state
            mailOptions.fromName = 'Abcotronics';
            result = await sendViaResendAPI(mailOptions, resendKey);
        } else if (sendGridKey && (useSendGridHTTP || emailTransporter?.provider === 'sendgrid')) {
            mailOptions.fromName = 'Abcotronics';
            // Extract email from "Name <email>" format if needed
            const fromEmail = mailOptions.from.includes('<') 
                ? mailOptions.from.match(/<(.+)>/)?.[1] || mailOptions.from
                : mailOptions.from;
            mailOptions.from = fromEmail; // SendGrid API expects just email
            result = await sendViaSendGridAPI(mailOptions, sendGridKey);
        } else if (emailTransporter && typeof emailTransporter.sendMail === 'function') {
            // Use Promise.race to prevent long timeouts
            const sendPromise = emailTransporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email sending timed out after 15 seconds')), 15000)
            );
            result = await Promise.race([sendPromise, timeoutPromise]);
        } else {
            const errorMsg = 'No email transporter available. Please configure RESEND_API_KEY (recommended), SENDGRID_API_KEY, or SMTP settings.';
            console.error('❌', errorMsg);
            throw new Error(errorMsg);
        }
        
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
        } else if (error.message && error.message.includes('Resend API error')) {
            // Extract Resend-specific errors
            if (error.message.includes('domain') || error.message.includes('verify')) {
                errorMessage = 'Resend domain not verified. Please verify your sending domain in Resend dashboard (https://resend.com/domains).';
            } else {
                errorMessage = error.message;
            }
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
