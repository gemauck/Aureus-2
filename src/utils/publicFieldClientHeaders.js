/** Headers sent with field job card / mobile reference-data fetches (see api/_lib/securityGuards.js). */
export const PUBLIC_FIELD_CLIENT_HEADER = 'X-Abcotronics-Client'
export const PUBLIC_FIELD_CLIENT_VALUE = 'field-app-v1'

export function publicFieldClientHeaders(extra = {}) {
  return {
    [PUBLIC_FIELD_CLIENT_HEADER]: PUBLIC_FIELD_CLIENT_VALUE,
    ...extra
  }
}
