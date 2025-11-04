// Email test endpoint for debugging
import { sendInvitationEmail } from './_lib/email.js'
import { badRequest, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { getAppUrl } from './_lib/getAppUrl.js'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        console.log('🧪 Starting email test...')
        
        const { email = 'gemauck@gmail.com', name = 'Test User', role = 'user' } = req.body || {}
        
        console.log('📧 Testing email configuration...')
        console.log('📧 Environment variables:', {
            SMTP_HOST: process.env.SMTP_HOST,
            SMTP_PORT: process.env.SMTP_PORT,
            SMTP_SECURE: process.env.SMTP_SECURE,
            SMTP_USER: process.env.SMTP_USER ? '***' : 'NOT_SET',
            SMTP_PASS: process.env.SMTP_PASS ? '***' : 'NOT_SET',
            EMAIL_FROM: process.env.EMAIL_FROM,
            APP_URL: process.env.APP_URL
        })
        
        const testInvitationLink = `${getAppUrl()}/accept-invitation?token=test-token-123`
        
        console.log('📧 Attempting to send test email...')
        const result = await sendInvitationEmail({
            email,
            name,
            role,
            invitationLink: testInvitationLink
        })
        
        console.log('✅ Test email sent successfully!')
        
        return ok(res, {
            success: true,
            message: 'Test email sent successfully',
            result,
            config: {
                SMTP_HOST: process.env.SMTP_HOST,
                SMTP_PORT: process.env.SMTP_PORT,
                EMAIL_FROM: process.env.EMAIL_FROM,
                APP_URL: process.env.APP_URL
            }
        })
        
    } catch (error) {
        console.error('❌ Email test failed:', error)
        console.error('❌ Error details:', {
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response
        })
        
        return serverError(res, 'Email test failed', {
            message: error.message,
            code: error.code,
            config: {
                SMTP_HOST: process.env.SMTP_HOST,
                SMTP_PORT: process.env.SMTP_PORT,
                EMAIL_FROM: process.env.EMAIL_FROM,
                APP_URL: process.env.APP_URL
            }
        })
    }
}

export default withHttp(withLogging(handler))
