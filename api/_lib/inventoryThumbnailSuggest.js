// Suggest inventory product thumbnails via web image search (Openverse + optional SerpAPI) with optional OpenAI query refinement.

const OPENVERSE_BASE = 'https://api.openverse.org/v1/images/'
const IMAGE_FETCH_TIMEOUT_MS = 12000
const MAX_QUERY_LEN = 180

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function buildInventoryImageSearchQuery(item) {
  const parts = []
  const name = String(item?.name || '').trim()
  const mpn = String(item?.manufacturingPartNumber || '').trim()
  const legacy = String(item?.legacyPartNumber || '').trim()
  const supplier = String(item?.supplier || '').trim()
  const sku = String(item?.sku || '').trim()
  if (name) parts.push(name)
  if (mpn) parts.push(mpn)
  if (legacy && legacy !== mpn) parts.push(legacy)
  if (supplier) parts.push(supplier)
  if (!name && sku) parts.push(sku)
  const q = parts.join(' ').replace(/\s+/g, ' ').trim()
  return q.slice(0, MAX_QUERY_LEN) || 'electronic component'
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed.length > 2048) return false
  if (/^data:/i.test(trimmed)) return false
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const host = (parsed.hostname || '').toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local')) return false
    if (/^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host)) return false
    return true
  } catch {
    return false
  }
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} baseQuery
 * @returns {Promise<string>}
 */
export async function refineInventoryImageSearchQuery(item, baseQuery) {
  const key = (process.env.OPENAI_API_KEY || '').trim()
  if (!key) return baseQuery

  try {
    const openaiModule = await import('openai').catch(() => null)
    if (!openaiModule) return baseQuery
    const OpenAI = openaiModule.OpenAI || openaiModule.default
    if (!OpenAI) return baseQuery
    const openai = new OpenAI({ apiKey: key })
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You help find product photos for an industrial/electronics inventory catalog. Return JSON only: {"query":"..."}. The query must be under 14 words, suitable for image search, and focus on the physical product (not logos or diagrams unless nothing else exists).'
        },
        {
          role: 'user',
          content: JSON.stringify({
            draftQuery: baseQuery,
            name: item?.name,
            sku: item?.sku,
            manufacturingPartNumber: item?.manufacturingPartNumber,
            legacyPartNumber: item?.legacyPartNumber,
            supplier: item?.supplier,
            category: item?.category
          })
        }
      ]
    })
    const raw = completion.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(raw)
    const refined = String(parsed?.query || '').trim()
    if (refined) return refined.slice(0, MAX_QUERY_LEN)
  } catch (err) {
    console.warn('inventoryThumbnailSuggest: OpenAI query refinement skipped:', err?.message || err)
  }
  return baseQuery
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<Array<{ url: string, thumbnail: string, title: string, provider: string }>>}
 */
export async function searchOpenverseImages(query, limit = 8) {
  const url = new URL(OPENVERSE_BASE)
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', String(Math.min(limit, 20)))
  url.searchParams.set('license', 'cc0,pdm,by,by-sa')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Abcotronics-ERP/1.0' }
    })
    if (!res.ok) return []
    const data = await res.json()
    const results = Array.isArray(data?.results) ? data.results : []
    return results
      .map((row) => {
        const imageUrl = String(row?.url || '').trim()
        const thumb = String(row?.thumbnail || row?.url || '').trim()
        return {
          url: imageUrl,
          thumbnail: thumb || imageUrl,
          title: String(row?.title || '').trim(),
          provider: 'openverse'
        }
      })
      .filter((c) => isAllowedThumbnailUrl(c.url))
  } catch (err) {
    console.warn('inventoryThumbnailSuggest: Openverse search failed:', err?.message || err)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<Array<{ url: string, thumbnail: string, title: string, provider: string }>>}
 */
export async function searchSerpApiImages(query, limit = 8) {
  const apiKey = (process.env.SERPAPI_API_KEY || '').trim()
  if (!apiKey) return []

  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_images')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('num', String(Math.min(limit, 10)))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) return []
    const data = await res.json()
    const results = Array.isArray(data?.images_results) ? data.images_results : []
    return results
      .map((row) => {
        const imageUrl = String(row?.original || row?.thumbnail || '').trim()
        const thumb = String(row?.thumbnail || row?.original || '').trim()
        return {
          url: imageUrl,
          thumbnail: thumb || imageUrl,
          title: String(row?.title || '').trim(),
          provider: 'serpapi'
        }
      })
      .filter((c) => isAllowedThumbnailUrl(c.url))
  } catch (err) {
    console.warn('inventoryThumbnailSuggest: SerpAPI search failed:', err?.message || err)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {Record<string, unknown>} item
 * @returns {Promise<{
 *   imageUrl: string,
 *   previewUrl: string,
 *   searchQuery: string,
 *   provider: string,
 *   candidates: Array<{ url: string, thumbnail: string, title: string, provider: string }>
 * } | null>}
 */
export async function suggestInventoryThumbnail(item) {
  const baseQuery = buildInventoryImageSearchQuery(item)
  const searchQuery = await refineInventoryImageSearchQuery(item, baseQuery)

  let candidates = await searchSerpApiImages(searchQuery, 8)
  let provider = candidates.length > 0 ? 'serpapi' : 'openverse'
  if (candidates.length === 0) {
    candidates = await searchOpenverseImages(searchQuery, 8)
    provider = 'openverse'
  }

  const picked = candidates[0]
  if (!picked) return null

  return {
    imageUrl: picked.url,
    previewUrl: picked.thumbnail || picked.url,
    searchQuery,
    provider,
    candidates: candidates.slice(0, 5)
  }
}
