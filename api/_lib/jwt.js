import jwt from 'jsonwebtoken'

const DAY = 24 * 60 * 60

export function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 2 * 60 * 60 }) // 2 hours
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

