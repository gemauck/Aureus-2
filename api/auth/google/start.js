// Google OAuth start endpoint
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
    if (req.method !== 'GET') return badRequest(res, 'Invalid method')
    
    try {
        // Google OAuth configuration
        const googleClientId = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id'
        const redirectUri = `${process.env.APP_URL || 'http://localhost:3001'}/api/auth/google/callback`
        
        // Generate state parameter for security
        const state = Buffer.from(JSON.stringify({
            timestamp: Date.now(),
            random: Math.random().toString(36)
        })).toString('base64')
        
        // Store state in session/cookie for verification
        res.setHeader('Set-Cookie', [
            `oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600` // 10 minutes
        ])
        
        // Google OAuth URL
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${googleClientId}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&` +
            `scope=openid email profile&` +
            `state=${state}&` +
            `hd=abcotronics.co.za` // Restrict to Abcotronics domain
        
        return ok(res, {
            authUrl: googleAuthUrl,
            message: 'Google OAuth URL generated'
        })
        
    } catch (error) {
        console.error('Google OAuth start error:', error)
        return serverError(res, 'Failed to start Google OAuth', error.message)
    }
}

export default withHttp(withLogging(handler))
