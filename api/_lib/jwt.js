import jwt from 'jsonwebtoken'

const DAY = 24 * 60 * 60

export function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 6 * 60 * 60 }) // 6 hours
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 14 * DAY })
}

export function verifyToken(token) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET is not configured')
      return null
    }
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    console.error('❌ Token verification error:', error.message)
    return null
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    return null
  }
}

const CALENDAR_FEED_EXPIRY = 365 * DAY // 1 year

/** Sign a long-lived token for calendar feed subscription (used in feed URL). */
export function signCalendarFeedToken(payload) {
  return jwt.sign(
    { ...payload, purpose: 'calendar-feed' },
    process.env.JWT_SECRET,
    { expiresIn: CALENDAR_FEED_EXPIRY }
  )
}

/** Verify calendar feed token; returns payload or null. Caller must check payload.purpose === 'calendar-feed'. */
export function verifyCalendarFeedToken(token) {
  try {
    if (!process.env.JWT_SECRET || !token) return null
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.purpose !== 'calendar-feed') return null
    return payload
  } catch (error) {
    return null
  }
}

const ERP_CAL_OAUTH_PURPOSE = 'erp-cal-oauth'

/** Short-lived state token for Google OAuth (greenfield Erp Calendar). */
export function signErpCalendarOAuthState(userId) {
  if (!process.env.JWT_SECRET || !userId) return null
  return jwt.sign({ purpose: ERP_CAL_OAUTH_PURPOSE, sub: userId }, process.env.JWT_SECRET, {
    expiresIn: '15m'
  })
}

export function verifyErpCalendarOAuthState(token) {
  try {
    if (!process.env.JWT_SECRET || !token) return null
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.purpose !== ERP_CAL_OAUTH_PURPOSE || !payload.sub) return null
    return payload
  } catch {
    return null
  }
}

