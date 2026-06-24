/** Transient connectivity failures — not actionable product bugs. */
export function isTransientNetworkError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /unable to resolve host|no address associated with hostname|network request failed|failed to connect|connection refused|econnrefused|enetunreach|timed out|timeout exceeded|no internet|network error|socket closed|host unreachable|dns lookup failed|fetch failed|cleartext communication not permitted/i.test(
      m
    )
  )
}

export function networkErrorUserMessage(): string {
  return 'Update check skipped — no network connection.'
}
