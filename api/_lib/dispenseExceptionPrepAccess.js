/**
 * Dispense Exception Prep: restricted to a single allowed user email for now.
 */
import { forbidden } from './response.js'
import { prisma } from './prisma.js'

export const DISPENSE_EXCEPTION_PREP_ALLOWED_EMAIL = 'garethm@abcotronics.co.za'

export function dispenseExceptionPrepEmailAllowed(email) {
  if (email == null || email === '') return false
  return String(email).trim().toLowerCase() === DISPENSE_EXCEPTION_PREP_ALLOWED_EMAIL.toLowerCase()
}

/**
 * Returns true if allowed; otherwise sends 403 and returns false.
 */
export async function requireDispenseExceptionPrepAccess(req, res) {
  let email = req.user?.email
  if ((!email || String(email).trim() === '') && req.user?.sub) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { email: true },
      })
      email = u?.email
    } catch (e) {
      console.error('dispenseExceptionPrepAccess: user email lookup failed', e)
    }
  }

  if (!dispenseExceptionPrepEmailAllowed(email)) {
    forbidden(res, 'Dispense Exception Prep is not available for your account.')
    return false
  }
  return true
}
