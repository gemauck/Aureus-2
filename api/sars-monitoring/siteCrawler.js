const SARS_ORIGIN = 'https://www.sars.gov.za'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw, SARS_ORIGIN)
    if (u.origin !== SARS_ORIGIN) return null
    u.hash = ''
    // Drop query params to avoid infinite crawl variants.
    u.search = ''
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    return u.toString()
  } catch {
    return null
  }
}

function shouldSkipUrl(url) {
  const lower = url.toLowerCase()
  return (
    lower.includes('/wp-content/uploads/') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.mp3')
  )
}

function extractLinks(html, currentUrl) {
  const out = []
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"/gi)) {
    const n = normalizeUrl(new URL(m[1], currentUrl).toString())
    if (!n || shouldSkipUrl(n)) continue
    out.push(n)
  }
  return out
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AbcotronicsERPBot/1.0; +https://abcoafrica.co.za)',
        Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    })
    const contentType = String(res.headers.get('content-type') || '').toLowerCase()
    return { ok: res.ok, status: res.status, contentType, text: await res.text() }
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseSitemapLocs(xml) {
  const urls = []
  for (const m of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const raw = m[1].trim()
    const n = normalizeUrl(raw)
    if (n && !shouldSkipUrl(n)) urls.push(n)
  }
  return urls
}

async function getSitemapSeeds() {
  const seeds = new Set([`${SARS_ORIGIN}/`])
  const sitemapCandidates = [
    `${SARS_ORIGIN}/sitemap_index.xml`,
    `${SARS_ORIGIN}/wp-sitemap.xml`,
    `${SARS_ORIGIN}/sitemap.xml`
  ]

  for (const smUrl of sitemapCandidates) {
    try {
      const result = await fetchText(smUrl, 12000)
      if (!result.ok || !result.contentType.includes('xml')) continue
      const locs = parseSitemapLocs(result.text)
      for (const loc of locs) {
        seeds.add(loc)
      }
    } catch {
      // Non-fatal: fallback to link discovery from homepage.
    }
  }

  return [...seeds]
}

export async function crawlSarsSiteUrls(opts = {}) {
  const maxPages = Number(opts.maxPages || 600)
  const delayMs = Number(opts.delayMs || 180)

  const queue = await getSitemapSeeds()
  const queued = new Set(queue)
  const visited = new Set()
  const htmlPages = []
  const errors = []

  while (queue.length > 0 && visited.size < maxPages) {
    const current = queue.shift()
    queued.delete(current)
    if (!current || visited.has(current) || shouldSkipUrl(current)) continue

    try {
      const result = await fetchText(current)
      visited.add(current)
      if (!result.ok) {
        errors.push({ url: current, status: result.status })
        await sleep(delayMs)
        continue
      }

      if (!result.contentType.includes('text/html')) {
        await sleep(delayMs)
        continue
      }

      htmlPages.push(current)
      const links = extractLinks(result.text, current)
      for (const link of links) {
        if (!visited.has(link) && !queued.has(link) && queued.size + visited.size < maxPages * 3) {
          queue.push(link)
          queued.add(link)
        }
      }
    } catch (e) {
      visited.add(current)
      errors.push({ url: current, error: e.message })
    }

    await sleep(delayMs)
  }

  return { urls: htmlPages, visitedCount: visited.size, errors }
}

