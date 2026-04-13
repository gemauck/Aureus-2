/**
 * Who may create travel booking requests and see the tool card (v1: nominated creators only).
 * Set TRAVEL_BOOKING_TOOL_EMAILS=comma@separated,list — defaults to primary owner if unset.
 */
const DEFAULT_CREATORS = 'garethm@abcotronics.co.za'

export function travelBookingCreatorEmails() {
  const raw = (process.env.TRAVEL_BOOKING_TOOL_EMAILS || DEFAULT_CREATORS).trim()
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function canCreateTravelBookingRequest(email) {
  if (!email || typeof email !== 'string') return false
  const norm = email.trim().toLowerCase()
  return travelBookingCreatorEmails().includes(norm)
}
