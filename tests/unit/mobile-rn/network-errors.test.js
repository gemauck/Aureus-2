import { describe, expect, it } from '@jest/globals'

/** Mirror of mobile-rn/src/utils/networkErrors.ts — keep patterns in sync. */
function isTransientNetworkError(message) {
  const m = message.toLowerCase()
  return /unable to resolve host|no address associated with hostname|network request failed|failed to connect|connection refused|econnrefused|enetunreach|timed out|timeout exceeded|no internet|network error|socket closed|host unreachable|dns lookup failed|fetch failed|cleartext communication not permitted/i.test(
    m
  )
}

describe('isTransientNetworkError', () => {
  it('treats DNS and connectivity failures as transient', () => {
    const message =
      'Failed to download remote update from URL: https://abcoafrica.co.za/api/public/mobile-ota/manifest: Unable to resolve host "abcoafrica.co.za": No address associated with hostname'
    expect(isTransientNetworkError(message)).toBe(true)
  })

  it('does not treat missing OTA bundle errors as transient', () => {
    expect(isTransientNetworkError('No OTA bundles published for runtime erp-mobile-4')).toBe(
      false
    )
  })

  it('treats auth refresh connectivity failures as transient', () => {
    const message =
      'Cannot reach https://abcoafrica.co.za/api/auth/mobile/refresh. Check Wi‑Fi or mobile data, open that URL in Chrome on this device, then try again. (Network request failed)'
    expect(isTransientNetworkError(message)).toBe(true)
  })
})
