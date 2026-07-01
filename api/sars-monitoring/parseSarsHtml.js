/**
 * Extract announcement-like items from SARS HTML (news articles, lists, tariff tables).
 */

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PUB_DATE_RE = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i

/**
 * Tariff amendment year pages use WordPress table rows: date | GG ref | description + Notice link | implementation date.
 */
function extractTariffAmendmentRows(html, pageUrl, pageTitle) {
  const out = []
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = trRe.exec(html)) !== null) {
    const row = m[1]
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1])
    if (cells.length < 4) continue
    if (!PUB_DATE_RE.test(cells[0])) continue

    const linkMatch = cells[2].match(/<a[^>]+href="(https?:\/\/www\.sars\.gov\.za\/[^"]+)"/i)
    if (!linkMatch) continue

    let desc = ''
    for (const pm of cells[2].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = stripTags(pm[1])
      if (t.length > desc.length && t.length > 15) desc = t
    }
    if (!desc) continue

    const dateMatch = cells[0].match(PUB_DATE_RE)
    let publishedAt = new Date()
    if (dateMatch) {
      const d = new Date(dateMatch[1])
      if (!Number.isNaN(d.getTime())) publishedAt = d
    }

    const impl = stripTags(cells[3]).slice(0, 400)

    const description = impl ? `${desc} — ${impl}` : desc
    let href = linkMatch[1]
    if (!href.startsWith('http')) href = new URL(href, pageUrl).href

    const title = desc.slice(0, 240) + (desc.length > 240 ? '…' : '')
    out.push({
      title,
      description,
      url: href,
      pageTitle,
      publishedAt
    })
  }
  return out
}

export function extractAnnouncements(html, url) {
  const announcements = []

  try {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const pageTitle = titleMatch ? titleMatch[1].trim().replace(/<[^>]*>/g, '') : 'SARS Website'

    if (/tariff-amendments-\d{4}/i.test(url)) {
      const fromTable = extractTariffAmendmentRows(html, url, pageTitle)
      if (fromTable.length > 0) return fromTable
    }

    const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
    const articleMatches = [...html.matchAll(articlePattern)]

    for (const match of articleMatches) {
      const articleHtml = match[1]

      const tMatch =
        articleHtml.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i) ||
        articleHtml.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/a>/i)
      const title = tMatch ? tMatch[1].trim().replace(/<[^>]*>/g, '') : 'Untitled'

      const descMatch = articleHtml.match(/<p[^>]*>(.*?)<\/p>/i)
      const description = descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '').substring(0, 500) : ''

      const linkMatch = articleHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/i)
      let link = linkMatch ? linkMatch[1] : ''
      if (link && !link.startsWith('http')) {
        link = new URL(link, url).href
      }

      const dateMatch =
        articleHtml.match(/(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i) ||
        articleHtml.match(/(\d{4}-\d{2}-\d{2})/)
      let publishedAt = null
      if (dateMatch) {
        try {
          publishedAt = new Date(dateMatch[1])
        } catch {
          // use below
        }
      }

      if (title && title !== 'Untitled') {
        announcements.push({
          title,
          description,
          url: link || url,
          pageTitle,
          publishedAt: publishedAt || new Date()
        })
      }
    }

    const isListingLikePage = /(news|media|legal-counsel|whats-new|latest-news|announcements|notices|tariff-amendments)/i.test(url)

    if (announcements.length === 0 && isListingLikePage) {
      const listItemPattern = /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<\/li>/gi
      const listMatches = [...html.matchAll(listItemPattern)]

      for (const match of listMatches.slice(0, 20)) {
        const link = match[1]
        const title = match[2].trim().replace(/<[^>]*>/g, '')
        const cleaned = title
          .replace(/&#160;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (
          !cleaned ||
          cleaned.length < 8 ||
          /^skip to content$/i.test(cleaned) ||
          cleaned.startsWith('[') ||
          cleaned.includes('@')
        ) {
          continue
        }

        if (cleaned && link) {
          let fullLink = link
          if (!link.startsWith('http')) {
            fullLink = new URL(link, url).href
          }

          announcements.push({
            title: cleaned,
            description: '',
            url: fullLink,
            pageTitle,
            publishedAt: new Date()
          })
        }
      }
    }
  } catch (error) {
    console.error('Error extracting announcements:', error)
  }

  return announcements
}

const BOILERPLATE_RE =
  /south african revenue service|what'?s new at sars|skip to content|cookie|search for:/i

function cleanSummaryText(text) {
  const t = stripTags(text).replace(/\s+/g, ' ').trim()
  if (!t || t.length < 24) return ''
  if (BOILERPLATE_RE.test(t) && t.length < 120) return ''
  return t.slice(0, 900)
}

/** True when stored description is useful (not empty listing-page noise). */
export function isSubstantiveSarsDescription(description, pageTitle, title) {
  const desc = cleanSummaryText(description || '')
  if (!desc) return false
  const page = stripTags(pageTitle || '').toLowerCase()
  const ttl = stripTags(title || '').toLowerCase()
  if (desc.toLowerCase() === page || desc.toLowerCase() === ttl) return false
  if (/south african revenue service/i.test(desc) && desc.length < 100) return false
  return true
}

/**
 * Extract a short plain-text summary from a SARS detail page HTML.
 * @param {string} html
 * @returns {string}
 */
export function extractPageSummary(html) {
  if (!html) return ''

  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
  const ogText = cleanSummaryText(og?.[1] || '')
  if (ogText.length >= 40) return ogText

  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  const metaText = cleanSummaryText(metaDesc?.[1] || '')
  if (metaText.length >= 40) return metaText

  const contentMatch =
    html.match(/<div[^>]+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)

  if (contentMatch) {
    const block = contentMatch[1]
    const parts = []
    for (const pm of block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = cleanSummaryText(pm[1])
      if (!t || t.length < 30) continue
      if (/^share this/i.test(t)) continue
      parts.push(t)
      if (parts.join(' ').length >= 500) break
    }
    if (parts.length) return parts.join(' ').slice(0, 900)
  }

  return ogText || metaText || ''
}
