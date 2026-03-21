/**
 * Google OAuth2 client for greenfield ERP Calendar only.
 * Kept separate from erpGoogleCalendar.js so auth-url does not import Prisma.
 */
import { google } from 'googleapis'

export function getRedirectUri(req) {
  const fromEnv = process.env.ERP_GOOGLE_REDIRECT_URI
  if (fromEnv) return String(fromEnv).trim().replace(/\/$/, '')
  const host = req.headers?.host
  if (!host) return 'http://localhost:3000/api/erp-calendar/oauth-callback'
  const proto = host.includes('localhost') ? 'http' : 'https'
  return `${proto}://${host}/api/erp-calendar/oauth-callback`
}

/** Redirect URI for token refresh (no Request object). */
export function getStaticOAuth2RedirectUri() {
  const fromEnv = process.env.ERP_GOOGLE_REDIRECT_URI
  if (fromEnv) return String(fromEnv).trim().replace(/\/$/, '')
  return 'http://localhost:3000/api/erp-calendar/oauth-callback'
}

export function createOAuth2Client(req) {
  const id = (process.env.GOOGLE_CLIENT_ID || '').trim()
  const secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
  if (!id || !secret) {
    return null
  }
  return new google.auth.OAuth2(id, secret, getRedirectUri(req))
}

/** OAuth2 for server-side refresh using fixed redirect (must match token exchange). */
export function createOAuth2ClientStaticRedirect() {
  const id = (process.env.GOOGLE_CLIENT_ID || '').trim()
  const secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
  if (!id || !secret) {
    return null
  }
  return new google.auth.OAuth2(id, secret, getStaticOAuth2RedirectUri())
}
