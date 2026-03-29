/**
 * URLs the SARS monitor fetches. Tariff amendment tables live on per-year pages
 * under /tariff-amendments/tariff-amendments-YYYY/ — not on the generic Secondary Legislation index.
 */
const CURRENT_YEAR = new Date().getFullYear()

const BASE_SECTIONS = [
  { url: 'https://www.sars.gov.za/news-and-media/announcements/', label: 'Announcements' },
  { url: 'https://www.sars.gov.za/news-and-media/', label: 'News & Media' },
  { url: 'https://www.sars.gov.za/latest-news/', label: 'Latest News' },
  { url: 'https://www.sars.gov.za/whats-new-at-sars/', label: "What's New" },
  { url: 'https://www.sars.gov.za/legal-counsel/secondary-legislation/public-notices/', label: 'Public Notices' },
  { url: 'https://www.sars.gov.za/legal-counsel/secondary-legislation/', label: 'Secondary Legislation' },
  { url: 'https://www.sars.gov.za/media/media-releases/', label: 'Media Releases' }
]

function tariffYearUrl(y) {
  return `https://www.sars.gov.za/legal-counsel/secondary-legislation/tariff-amendments/tariff-amendments-${y}/`
}

function baseSections() {
  return [
    ...BASE_SECTIONS,
    { url: tariffYearUrl(CURRENT_YEAR), label: `Tariff Amendments ${CURRENT_YEAR}` },
    { url: tariffYearUrl(CURRENT_YEAR - 1), label: `Tariff Amendments ${CURRENT_YEAR - 1}` }
  ]
}

/**
 * @param {{ crawlAll?: boolean, maxPages?: number }} [opts]
 * @returns {Promise<{ url: string, label: string }[]>}
 */
export async function getSarsSections(opts = {}) {
  const { crawlAll = false, maxPages = 600 } = opts
  const sections = baseSections()

  if (!crawlAll) return sections

  const { crawlSarsSiteUrls } = await import('./siteCrawler.js')
  const crawled = await crawlSarsSiteUrls({ maxPages })

  const seen = new Set(sections.map((s) => s.url))
  for (const url of crawled.urls) {
    if (seen.has(url)) continue
    seen.add(url)
    sections.push({ url, label: 'Site Crawl' })
  }

  return sections
}
