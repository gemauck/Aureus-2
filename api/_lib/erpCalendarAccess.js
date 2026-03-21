/**
 * Greenfield ERP Calendar: restricted to a single allowed user email.
 */
import { forbidden } from './response.js'
import { prisma } from './prisma.js'

export const ERP_CALENDAR_ALLOWED_EMAIL = 'garethm@abcotronics.co.za'

export function erpCalendarEmailAllowed(email) {
  if (email == null || email === '') return false
  return String(email).trim().toLowerCase() === ERP_CALENDAR_ALLOWED_EMAIL.toLowerCase()
}

/**
 * Returns true if allowed; otherwise sends 403 and returns false.
 * If JWT omits email, loads it from the database (some refresh tokens only carry sub).
 */
export async function requireErpCalendarAccess(req, res) {
  let email = req.user?.email
  if ((!email || String(email).trim() === '') && req.user?.sub) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { email: true }
      })
      email = u?.email
    } catch (e) {
      console.error('erpCalendarAccess: user email lookup failed', e)
    }
  }

  if (!erpCalendarEmailAllowed(email)) {
    forbidden(res, 'Calendar is not available for your account.')
    return false
  }
  return true
}
