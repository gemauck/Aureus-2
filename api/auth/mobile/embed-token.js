import { prisma } from '../../_lib/prisma.js'
import { authRequired } from '../../_lib/authRequired.js'
import { signMobileEmbedToken } from '../../_lib/jwt.js'
import { badRequest, ok, serverError, unauthorized } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')

  try {
    if (!process.env.JWT_SECRET) return serverError(res, 'Server configuration error', 'JWT_SECRET missing')

    const userId = req.user?.sub
    if (!userId) return unauthorized(res)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        permissions: true
      }
    })

    if (!user || user.status !== 'active') return unauthorized(res)

    const embedToken = signMobileEmbedToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    })

    if (!embedToken) return serverError(res, 'Could not issue embed token')

    return ok(res, {
      embedToken,
      expiresIn: 15 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions || '[]'
      }
    })
  } catch (error) {
    return serverError(res, 'Mobile embed token failed', error?.message || 'Unknown error')
  }
}

export default withHttp(withLogging(authRequired(handler)))
