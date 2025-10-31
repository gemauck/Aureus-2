import { prisma } from '../_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { signAccessToken, signRefreshToken } from '../_lib/jwt.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging, logger } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  
  try {
    logger.info({ email: req.body?.email || 'unknown' }, '🔐 Login attempt started')
    
    // Validate request body
    const { email, password } = req.body || {}
    logger.info({ email, hasPassword: !!password, bodyKeys: Object.keys(req.body || {}) }, '📝 Request body parsed')
    
    if (!email || !password) {
      logger.warn({ hasEmail: !!email, hasPassword: !!password }, '❌ Missing email or password')
      return badRequest(res, 'Email and password required')
    }

    logger.info({ email }, '✅ Email and password validated, proceeding...')

    // Development-only shortcut to allow local login without a database
    if (process.env.DEV_LOCAL_NO_DB === 'true') {
      logger.info({ email }, '🔧 Using DEV_LOCAL_NO_DB mode')
      const devEmail = 'admin@example.com'
      const devPassword = 'password123'
      if (email !== devEmail || password !== devPassword) {
        logger.warn({ email }, '❌ DEV mode: Invalid credentials')
        return unauthorized(res, 'Invalid credentials')
      }

      if (!process.env.JWT_SECRET) {
        return serverError(res, 'Server configuration error', 'JWT_SECRET missing')
      }

      const payload = { 
        sub: 'dev-admin', 
        email: devEmail, 
        role: 'admin',
        name: 'Admin User'
      }

      const accessToken = signAccessToken(payload)
      const refreshToken = signRefreshToken(payload)

      const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
      const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
      const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
      const cookieValue = `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${domainAttr}`
      res.setHeader('Set-Cookie', [cookieValue])

      return ok(res, {
        accessToken,
        user: {
          id: 'dev-admin',
          email: devEmail,
          name: 'Admin User',
          role: 'admin'
        },
        mustChangePassword: false
      })
    }

    logger.info({ email, devMode: process.env.DEV_LOCAL_NO_DB }, '🔍 Looking up user (after dev check)')
    
    // Find user (Prisma handles connection automatically)
    let user
    try {
      logger.info({ email }, '🔍 Querying database for user')
      user = await prisma.user.findUnique({ 
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
      logger.info({ email, userFound: !!user }, '🔍 User query completed')
    } catch (queryError) {
      logger.error({ email, error: queryError.message, stack: queryError.stack }, '❌ Database query failed')
      return serverError(res, 'Database query failed', queryError.message)
    }
    
    if (!user) {
      logger.warn({ email }, '❌ User not found')
      return unauthorized(res, 'Invalid credentials')
    }
    
    if (!user.passwordHash) {
      logger.warn({ email, userId: user.id }, '❌ User has no password hash')
      return unauthorized(res, 'Invalid credentials')
    }
    
    if (user.status !== 'active') {
      logger.warn({ email, userId: user.id, status: user.status }, '❌ User account is not active')
      return unauthorized(res, 'Account is not active')
    }

    logger.info({ email, userId: user.id, passwordLength: password?.length || 0, hashLength: user.passwordHash?.length || 0, hashPrefix: user.passwordHash?.substring(0, 7) || 'N/A' }, '🔑 Verifying password')
    
    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    logger.info({ email, valid, hashFormatValid: !!user.passwordHash.match(/^\$2[ayb]\$.{56}$/) }, '🔑 Password comparison result')
    
    if (!valid) {
      logger.warn({ email, userId: user.id, hashFormatValid: !!user.passwordHash.match(/^\$2[ayb]\$.{56}$/) }, '❌ Invalid password - check: password hash format, password encoding, or password mismatch')
      return unauthorized(res, 'Invalid credentials')
    }

    logger.info({ email, userId: user.id }, '✅ Password verified, generating tokens')

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET) {
      logger.error({ email }, '❌ JWT_SECRET not configured')
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
    
    logger.info({ email, userId: user.id, role: user.role }, '✅ Login successful')
    
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
    logger.error({ 
      email: req.body?.email || 'unknown',
      error: e.message, 
      stack: e.stack, 
      code: e.code 
    }, '❌ Login error')
    return serverError(res, 'Login failed', e.message)
  }
}

export default withHttp(withLogging(handler))