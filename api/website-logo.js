// GET /api/website-logo?url=https://example.com
// Returns a logo URL (favicon) for the given website, for use on client/lead profile.
import { withHttp } from './_lib/withHttp.js'

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false
  try {
    const parsed = new URL(u)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const host = (parsed.hostname || '').toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local')) return false
    if (/^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host)) return false
    return true
  } catch (_) {
    return false
  }
}

function getFaviconUrl(websiteUrl) {
  try {
    const parsed = new URL(websiteUrl.trim())
    const domain = parsed.hostname || parsed.host || ''
    if (!domain) return null
    // Google's favicon service (high quality, works cross-origin)
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
  } catch (_) {
    return null
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }
  const url = (req.query?.url || '').trim()
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Valid url query parameter (http or https) is required' })
  }
  const logoUrl = getFaviconUrl(url)
  if (!logoUrl) {
    return res.status(400).json({ error: 'Could not derive logo URL from website' })
  }
  res.setHeader('Cache-Control', 'private, max-age=86400')
  return res.status(200).json({ logoUrl })
}

export default withHttp(handler)
