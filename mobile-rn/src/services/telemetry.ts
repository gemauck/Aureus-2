import { SENTRY_DSN } from '../config'
import { reportError } from './errorReporting'

type SentryModule = {
  init: (opts: Record<string, unknown>) => void
  captureException: (error: unknown, context?: Record<string, unknown>) => void
  captureMessage: (message: string, level?: string) => void
  setUser: (user: { id?: string; email?: string } | null) => void
}

let sentry: SentryModule | null = null
let initAttempted = false

export function initTelemetry(): void {
  if (initAttempted) return
  initAttempted = true

  if (SENTRY_DSN) {
    try {
      // Optional native dependency — no-op when not installed or DSN unset.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/react-native') as SentryModule
      Sentry.init({
        dsn: SENTRY_DSN,
        enableNative: true,
        tracesSampleRate: 0.1,
        enableAutoSessionTracking: true
      })
      sentry = Sentry
    } catch {
      console.warn('[telemetry] Sentry not available — set EXPO_PUBLIC_SENTRY_DSN and install @sentry/react-native')
    }
  }

  try {
    const ErrorUtils = (global as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, f?: boolean) => void; setGlobalHandler: (h: (e: unknown, f?: boolean) => void) => void } }).ErrorUtils
    if (ErrorUtils?.getGlobalHandler && ErrorUtils?.setGlobalHandler) {
      const defaultHandler = ErrorUtils.getGlobalHandler()
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        trackError(error, isFatal ? 'GlobalFatal' : 'Global')
        defaultHandler(error, isFatal)
      })
    }
  } catch {
    /* non-fatal */
  }
}

export function setTelemetryUser(user: { id?: string; email?: string } | null): void {
  try {
    sentry?.setUser(user)
  } catch {
    /* non-fatal */
  }
}

export function trackError(error: unknown, context: string, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error)
  if (sentry) {
    try {
      sentry.captureException(error instanceof Error ? error : new Error(message), {
        tags: { context }
      })
    } catch {
      /* fall through */
    }
  }
  void reportError(error, context, extra)
  console.warn(`[telemetry] ${context}: ${message}`)
}

export function trackEvent(eventName: string, payload?: Record<string, unknown>): void {
  if (sentry) {
    try {
      sentry.captureMessage(`event:${eventName}`, 'info')
    } catch {
      /* non-fatal */
    }
  }
  console.log(`[event] ${eventName}`, payload || {})
}
