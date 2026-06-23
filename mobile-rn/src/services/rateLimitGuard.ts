/** Shared client backoff when the API returns 429 (matches web RateLimitManager idea). */

let resumeAt = 0
let consecutiveHits = 0

export function isRateLimited(): boolean {
  return Date.now() < resumeAt
}

export function getRateLimitWaitMs(): number {
  return Math.max(0, resumeAt - Date.now())
}

function parseRetryAfterMs(response?: Response): number | null {
  if (!response?.headers?.get) return null
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) {
    const sec = Number(retryAfter)
    if (Number.isFinite(sec) && sec > 0) return sec * 1000
  }
  const reset = response.headers.get('RateLimit-Reset')
  if (reset) {
    const resetEpochSec = Number(reset)
    if (Number.isFinite(resetEpochSec) && resetEpochSec > 0) {
      return Math.max(1000, resetEpochSec * 1000 - Date.now())
    }
  }
  return null
}

export function registerRateLimitHit(response?: Response): void {
  consecutiveHits += 1
  const fromHeader = parseRetryAfterMs(response)
  const baseMs = fromHeader ?? 60_000
  const scaled = Math.min(baseMs * Math.min(consecutiveHits, 3), 5 * 60_000)
  resumeAt = Math.max(resumeAt, Date.now() + scaled)
}

export function noteSuccessfulRequest(): void {
  if (consecutiveHits > 0) consecutiveHits -= 1
}
