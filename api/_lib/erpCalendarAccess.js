/**
 * Greenfield ERP Calendar: restricted to a single allowed user email.
 */
import { forbidden } from './response.js'

export const ERP_CALENDAR_ALLOWED_EMAIL = 'garethm@abcotronics.co.za'

export function erpCalendarEmailAllowed(email) {
  if (email == null || email === '') return false
  return String(email).trim().toLowerCase() === ERP_CALENDAR_ALLOWED_EMAIL.toLowerCase()
}

/** Returns true if allowed; otherwise sends 403 and returns false. */
export function requireErpCalendarAccess(req, res) {
  if (!erpCalendarEmailAllowed(req.user?.email)) {
    forbidden(res, 'Calendar is not available for your account.')
    return false
  }
  return true
}
