/**
 * Detect deploy/health probes — must not create Feedback rows or GitHub triage noise.
 */

const PROBE_CONTEXTS = new Set(['deploy-probe', 'health-probe', 'mobile-error-probe'])

function parseMeta(meta) {
  if (!meta) return {}
  if (typeof meta === 'object') return meta
  try {
    return JSON.parse(meta)
  } catch {
    return {}
  }
}

/** True when a POST is an intentional probe (header, context, or legacy curl shape). */
export function isInternalMobileErrorProbe(body = {}, req = null) {
  const header = String(req?.headers?.['x-mobile-error-probe'] || '').trim().toLowerCase()
  if (header === '1' || header === 'true' || header === 'yes') return true

  const meta = parseMeta(body.meta)
  const context = String(meta.context || '').trim().toLowerCase()
  if (PROBE_CONTEXTS.has(context)) return true
  if (meta.probe === true || meta.internalProbe === true) return true

  const message = String(body.message || '').trim().toLowerCase()
  if (message.startsWith('[test]') || message.includes('deploy probe')) return true

  return false
}
