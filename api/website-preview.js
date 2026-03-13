// GET /api/website-preview?url=https://example.com
// Returns a small front-page screenshot (proxied from PageShot) for client/lead profile preview.
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

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }
  const url = (req.query?.url || '').trim()
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Valid url query parameter (http or https) is required' })
  }
  const width = Math.min(Number(req.query?.width) || 400, 800)
  const height = Math.min(Number(req.query?.height) || 300, 600)
  const pageUrl = encodeURIComponent(url)
  const screenshotUrl = `https://pageshot.site/v1/screenshot?url=${pageUrl}&width=${width}&height=${height}&format=webp`
  try {
    const response = await fetch(screenshotUrl, {
      method: 'GET',
      headers: { Accept: 'image/webp,image/*,*/*' },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return res.status(response.status).json({ error: 'Screenshot service error', detail: text.slice(0, 200) })
    }
    const contentType = response.headers.get('content-type') || 'image/webp'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.warn('website-preview fetch failed:', err?.message)
    return res.status(502).json({ error: 'Could not fetch website preview', detail: err?.message })
  }
}

export default withHttp(handler)
