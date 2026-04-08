/**
 * Coerce SafetyCulture / merged payloads into plain JSON-safe objects for Prisma `Json` columns.
 * Node/Prisma cannot persist BigInt, functions, symbols, or circular structures as JSON.
 */
export function sanitizePayloadForPrismaJson(value) {
  const seen = new WeakSet()
  try {
    const json = JSON.stringify(value, (_key, val) => {
      if (val !== null && typeof val === 'object') {
        if (seen.has(val)) return undefined
        seen.add(val)
      }
      if (typeof val === 'bigint') return val.toString()
      if (val instanceof Date) return val.toISOString()
      if (typeof val === 'function' || typeof val === 'symbol') return undefined
      return val
    })
    return json === undefined ? null : JSON.parse(json)
  } catch (e) {
    console.warn('[safetyCultureJsonSafe] sanitize failed:', e?.message || e)
    return {
      _erp_sync_sanitize_failed: true,
      _message: String(e?.message || e).slice(0, 500)
    }
  }
}
