export function trackError(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error)
  // Placeholder: wire to Sentry/Bugsnag in pilot hardening.
  console.warn(`[telemetry] ${context}: ${message}`)
}

export function trackEvent(eventName: string, payload?: Record<string, unknown>): void {
  // Placeholder: wire to product analytics in pilot hardening.
  console.log(`[event] ${eventName}`, payload || {})
}
