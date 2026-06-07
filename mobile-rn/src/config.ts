import Constants from 'expo-constants'

type ExpoExtra = {
  apiBaseUrl?: string
  sentryDsn?: string
}

const extra = (Constants.expoConfig?.extra || {}) as ExpoExtra

/** Production default; override via app.config.js extra or EXPO_PUBLIC_API_BASE_URL at build time. */
export const API_BASE_URL =
  (typeof extra.apiBaseUrl === 'string' && extra.apiBaseUrl) ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://abcoafrica.co.za'

export const SENTRY_DSN =
  (typeof extra.sentryDsn === 'string' && extra.sentryDsn) ||
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  ''

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${p}`
}
