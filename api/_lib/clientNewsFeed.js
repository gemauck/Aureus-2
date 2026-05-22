// Shared helpers for Client News Feed (RSS fetch, display ordering)

export const GOOGLE_NEWS_RSS_LOCALE = { hl: 'en-ZA', gl: 'ZA', ceid: 'ZA:en' }

export function buildGoogleNewsRssUrl(query) {
  const { hl, gl, ceid } = GOOGLE_NEWS_RSS_LOCALE
  const encodedQuery = encodeURIComponent(query)
  return `https://news.google.com/rss/search?q=${encodedQuery}&hl=${hl}&gl=${gl}&ceid=${ceid}`
}

/** Round-robin by client so one noisy client (e.g. Samancor) does not fill the whole feed. */
export function diversifyNewsArticles(articles, { maxPerClient = 4, limit = 100 } = {}) {
  if (!articles?.length) return []

  const byClient = new Map()
  for (const article of articles) {
    const id = article.clientId
    if (!byClient.has(id)) byClient.set(id, [])
    byClient.get(id).push(article)
  }

  const result = []
  let round = 0
  while (result.length < limit) {
    let added = false
    for (const list of byClient.values()) {
      if (round < list.length && round < maxPerClient) {
        result.push(list[round])
        added = true
        if (result.length >= limit) break
      }
    }
    if (!added) break
    round++
  }
  return result
}
