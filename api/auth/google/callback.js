// Google OAuth callback endpoint
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { signAccessToken, signRefreshToken } from '../../_lib/jwt.js'

async function handler(req, res) {
    if (req.method !== 'GET') return badRequest(res, 'Invalid method')
    
    try {
        const { code, state } = req.query || {}
        
        if (!code || !state) {
            return badRequest(res, 'Missing authorization code or state')
        }
        
        // Verify state parameter
        const cookieState = req.cookies?.oauth_state
        if (!cookieState || cookieState !== state) {
            return badRequest(res, 'Invalid state parameter')
        }
        
        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
                client_secret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: `${process.env.APP_URL || 'http://localhost:3001'}/api/auth/google/callback`
            })
        })
        
        if (!tokenResponse.ok) {
            throw new Error('Failed to exchange code for tokens')
        }
        
        const tokens = await tokenResponse.json()
        
        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`
            }
        })
        
        if (!userResponse.ok) {
            throw new Error('Failed to get user info from Google')
        }
        
        const googleUser = await userResponse.json()
        
        // Verify domain
        if (!googleUser.email.endsWith('@abcotronics.co.za')) {
            return badRequest(res, 'Only Abcotronics email addresses are allowed')
        }
        
        // Check if user exists
        let user = await prisma.user.findUnique({
            where: { email: googleUser.email }
        })
        
        if (!user) {
            // Create new user
            user = await prisma.user.create({
                data: {
                    email: googleUser.email,
                    name: googleUser.name,
                    provider: 'google',
                    role: 'user', // Default role for Google OAuth users
                    status: 'active'
                }
            })
        } else {
            // Update existing user
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    name: googleUser.name,
                    provider: 'google',
                    lastLoginAt: new Date()
                }
            })
        }
        
        // Generate JWT tokens
        const payload = { sub: user.id, email: user.email, role: user.role }
        const accessToken = signAccessToken(payload)
        const refreshToken = signRefreshToken(payload)
        
        // Set refresh token cookie
        const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
        const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
        const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
        res.setHeader('Set-Cookie', [
            `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${domainAttr}`
        ])
        
        // Clear OAuth state cookie
        res.setHeader('Set-Cookie', [
            `oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
        ])
        
        // Redirect to frontend with success
        const frontendUrl = `${process.env.APP_URL || 'http://localhost:3001'}?login=success&token=${accessToken}`
        res.redirect(frontendUrl)
        
    } catch (error) {
        console.error('Google OAuth callback error:', error)
        const frontendUrl = `${process.env.APP_URL || 'http://localhost:3001'}?login=error&message=${encodeURIComponent(error.message)}`
        res.redirect(frontendUrl)
    }
}

export default withHttp(withLogging(handler))
