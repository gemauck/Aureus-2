/**
 * Google OAuth2 client for greenfield ERP Calendar only.
 * Kept separate from erpGoogleCalendar.js so auth-url does not import Prisma.
 *
 * Credentials: GOOGLE_CLIENT_ID/SECRET first; if unset, GMAIL_CLIENT_ID/SECRET (same as Helpdesk Gmail OAuth).
 * Add https://<host>/api/erp-calendar/oauth-callback to that OAuth client's Authorized redirect URIs.
 */
import { google } from 'googleapis'

function getOAuthClientCredentials() {
  let id = (process.env.GOOGLE_CLIENT_ID || '').trim()
  let secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
  if (!id || !secret) {
    id = (process.env.GMAIL_CLIENT_ID || '').trim()
    secret = (process.env.GMAIL_CLIENT_SECRET || '').trim()
  }
  return { id, secret }
}

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
  const { id, secret } = getOAuthClientCredentials()
  if (!id || !secret) {
    return null
  }
  return new google.auth.OAuth2(id, secret, getRedirectUri(req))
}

/** OAuth2 for server-side refresh using fixed redirect (must match token exchange). */
export function createOAuth2ClientStaticRedirect() {
  const { id, secret } = getOAuthClientCredentials()
  if (!id || !secret) {
    return null
  }
  return new google.auth.OAuth2(id, secret, getStaticOAuth2RedirectUri())
}
