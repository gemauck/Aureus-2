/** Baked-in production API (standalone APK must not depend on Metro/.env). */
export const API_BASE_URL = 'https://abcoafrica.co.za'

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${p}`
}
