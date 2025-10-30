import { prisma } from '../_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { signAccessToken, signRefreshToken } from '../_lib/jwt.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  
  try {
    console.log('🔐 Login attempt started')
    
    // Validate request body
    const { email, password } = req.body || {}
    if (!email || !password) {
      console.log('❌ Missing email or password')
      return badRequest(res, 'Email and password required')
    }

    console.log('🔍 Looking up user:', email)
    
    // Test database connection first
    try {
      await prisma.$connect()
      console.log('✅ Database connection verified')
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError)
      return serverError(res, 'Database connection failed', dbError.message)
    }

    // Find user
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        status: true,
        mustChangePassword: true
      }
    })
    
    if (!user) {
      console.log('❌ User not found:', email)
      return unauthorized(res, 'Invalid credentials')
    }
    
    if (!user.passwordHash) {
      console.log('❌ User has no password hash:', email)
      return unauthorized(res, 'Invalid credentials')
    }
    
    if (user.status !== 'active') {
      console.log('❌ User account is not active:', email)
      return unauthorized(res, 'Account is not active')
    }

    console.log('🔑 Verifying password for user:', user.id)
    
    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      console.log('❌ Invalid password for user:', email)
      return unauthorized(res, 'Invalid credentials')
    }

    console.log('✅ Password verified, generating tokens')

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET not configured')
      return serverError(res, 'Server configuration error', 'JWT_SECRET missing')
    }

    // Generate tokens
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      name: user.name 
    }
    
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    // Update last login and last seen timestamps
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        lastSeenAt: new Date()
      }
    })

    // Set refresh token cookie
    const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
    const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
    const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
    const cookieValue = `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${domainAttr}`
    res.setHeader('Set-Cookie', [cookieValue])
    
    console.log('✅ Login successful for user:', user.email)
    
    return ok(res, { 
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      mustChangePassword: user.mustChangePassword || false
    })
    
  } catch (e) {
    console.error('❌ Login error:', {
      message: e.message,
      stack: e.stack,
      code: e.code
    })
    return serverError(res, 'Login failed', e.message)
  }
}

export default withHttp(withLogging(handler))