/**
 * Dispense Exception Audit: restricted to a single allowed user email.
 */
import { forbidden } from './response.js'
import { prisma } from './prisma.js'

export const DISPENSE_EXCEPTION_AUDIT_ALLOWED_EMAIL = 'garethm@abcotronics.co.za'

export function dispenseExceptionAuditEmailAllowed(email) {
  if (email == null || email === '') return false
  return String(email).trim().toLowerCase() === DISPENSE_EXCEPTION_AUDIT_ALLOWED_EMAIL.toLowerCase()
}

/**
 * Returns true if allowed; otherwise sends 403 and returns false.
 */
export async function requireDispenseExceptionAuditAccess(req, res) {
  let email = req.user?.email
  if ((!email || String(email).trim() === '') && req.user?.sub) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { email: true },
      })
      email = u?.email
    } catch (e) {
      console.error('dispenseExceptionAuditAccess: user email lookup failed', e)
    }
  }

  if (!dispenseExceptionAuditEmailAllowed(email)) {
    forbidden(res, 'Dispense Exception Audit is not available for your account.')
    return false
  }
  return true
}
