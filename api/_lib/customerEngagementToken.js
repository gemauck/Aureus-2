import crypto from 'crypto'

const TOKEN_BYTES = 32

export function generateCustomerEngagementToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashCustomerEngagementToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return ''
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function timingSafeEqualTokenHash(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
