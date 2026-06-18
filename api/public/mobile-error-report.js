/**
 * Public mobile app crash/error reports — no login required (field devices may fail before auth).
 * POST /api/public/mobile-error-report
 */
import { prisma } from '../_lib/prisma.js'
import { badRequest, created, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { verifyToken } from '../_lib/jwt.js'
import { notifyAdminsOfFeedback } from '../feedback.js'

const SECTION = 'mobile-app'
const META_MAX = 5_242_880
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX_PER_IP = 120

/** @type {Map<string, { count: number; resetAt: number }>} */
const rateByIp = new Map()

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

function checkRate(ip) {
  const now = Date.now()
  const entry = rateByIp.get(ip)
  if (!entry || now >= entry.resetAt) {
    rateByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_MAX_PER_IP) return false
  entry.count += 1
  return true
}

async function resolveUser(req) {
  const authHeader = req.headers['authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return null
  try {
    const payload = verifyToken(authHeader.slice(7))
    if (!payload?.sub) return null
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true }
    })
    return user || { id: payload.sub, email: payload.email, name: payload.name }
  } catch {
    return null
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Method not allowed')
  }

  const ip = clientIp(req)
  if (!checkRate(ip)) {
    return res.status(429).json({ error: { message: 'Too many mobile error reports. Try again later.' } })
  }

  let body = req.body
  if (!body || Object.keys(body).length === 0) {
    body = await parseJsonBody(req)
  }

  const message = String(body.message || '').trim()
  const pageUrl = String(body.pageUrl || 'mobile://App').trim()
  if (!message) return badRequest(res, 'message required')

  let metaValue = body.meta || null
  if (metaValue && typeof metaValue === 'object') {
    metaValue = JSON.stringify(metaValue)
  }
  if (metaValue != null && typeof metaValue === 'string' && metaValue.length > META_MAX) {
    return badRequest(res, 'Report payload too large')
  }

  const user = await resolveUser(req)
  const severity = ['low', 'medium', 'high'].includes(body.severity) ? body.severity : 'medium'

  try {
    const record = await prisma.feedback.create({
      data: {
        userId: user?.id || null,
        pageUrl,
        section: SECTION,
        message,
        type: 'bug',
        severity,
        meta: metaValue
      }
    })

    if (severity === 'high' || String(body.meta || '').includes('"category":"crash"')) {
      void notifyAdminsOfFeedback(record, user).catch((err) => {
        console.error('❌ Mobile error report notification failed:', err?.message || err)
      })
    }

    return created(res, { id: record.id })
  } catch (e) {
    console.error('❌ Mobile error report save failed:', e)
    return serverError(res, 'Failed to save mobile error report', e.message)
  }
}

export default withHttp(handler)
