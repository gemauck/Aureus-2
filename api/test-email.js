// Email test endpoint for debugging
import { sendInvitationEmail } from './_lib/email.js'
import { badRequest, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { getAppUrl } from './_lib/getAppUrl.js'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        
        const { email = 'gemauck@gmail.com', name = 'Test User', role = 'user' } = req.body || {}
        
        
        const testInvitationLink = `${getAppUrl()}/accept-invitation?token=test-token-123`
        
        const result = await sendInvitationEmail({
            email,
            name,
            role,
            invitationLink: testInvitationLink
        })
        
        
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
