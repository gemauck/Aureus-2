/**
 * Detect deploy/health probes — must not create Feedback rows or GitHub triage noise.
 */

const PROBE_CONTEXTS = new Set([
  'deploy-probe',
  'health-probe',
  'mobile-error-probe',
  'web-error-probe'
])

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
export function isInternalErrorProbe(body = {}, req = null) {
  const mobileHeader = String(req?.headers?.['x-mobile-error-probe'] || '').trim().toLowerCase()
  const webHeader = String(req?.headers?.['x-web-error-probe'] || '').trim().toLowerCase()
  if (mobileHeader === '1' || mobileHeader === 'true' || mobileHeader === 'yes') return true
  if (webHeader === '1' || webHeader === 'true' || webHeader === 'yes') return true

  const meta = parseMeta(body.meta)
  const context = String(meta.context || '').trim().toLowerCase()
  if (PROBE_CONTEXTS.has(context)) return true
  if (meta.probe === true || meta.internalProbe === true) return true

  const message = String(body.message || '').trim().toLowerCase()
  if (message.startsWith('[test]') || message.includes('deploy probe')) return true

  return false
}

/** Email + in-app admin alert for auto error reports (medium and above; crashes always). */
export function shouldNotifyAdminForAutoErrorReport(severity, metaRaw) {
  const s = String(severity || 'medium').toLowerCase()
  if (s === 'high' || s === 'medium') return true
  const meta = parseMeta(metaRaw)
  if (String(meta?.category || '').toLowerCase() === 'crash') return true
  return false
}

/** @deprecated use isInternalErrorProbe */
export function isInternalMobileErrorProbe(body = {}, req = null) {
  return isInternalErrorProbe(body, req)
}
