/**
 * Build job card photos JSON and field overlays from SafetyCulture issue API payloads.
 * Photos use kind "safetyCultureMedia" so JobCards.jsx can resolve via /api/safety-culture/media/sign-url.
 */

/** Keep job card notes reasonable; TEXT column is unbounded but UI and emails suffer if huge. */
const MAX_ISSUE_NOTES_APPEND_CHARS = 120_000

/**
 * Append a full JSON dump of feed + API detail for "Additional notes" (user-requested audit trail).
 */
export function buildSafetyCultureIssueNotesAppendix(issueId, feed, detailData) {
  const payload = {
    safetyCultureIssueId: issueId,
    exportedAt: new Date().toISOString(),
    feed: feed ?? null,
    detail: detailData ?? null
  }
  let text = ''
  try {
    text = JSON.stringify(payload, null, 2)
  } catch {
    try {
      text = JSON.stringify({ safetyCultureIssueId: issueId, note: 'Payload not JSON-serializable' })
    } catch {
      text = `{ "safetyCultureIssueId": "${String(issueId)}" }`
    }
  }
  if (text.length > MAX_ISSUE_NOTES_APPEND_CHARS) {
    const over = text.length - MAX_ISSUE_NOTES_APPEND_CHARS
    text =
      text.slice(0, MAX_ISSUE_NOTES_APPEND_CHARS) +
      `\n\n[…truncated: ${over} more characters; see safetyCultureSnapshotJson on the job card]`
  }
  return `\n\n--- Full SafetyCulture issue record (JSON) ---\n${text}`
}

const MEDIA_ARRAY_KEYS = new Set([
  'media',
  'medias',
  'images',
  'attachments',
  'photos',
  'files',
  'media_items',
  'evidence'
])

function pushIfMediaItem(obj, out, seen) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
  const id = obj.id ?? obj.media_id ?? obj.document_id
  const token = obj.token ?? obj.download_token ?? obj.media_token ?? obj.access_token
  if (id == null || token == null || String(token).trim() === '') return
  const key = `${String(id)}:${String(token)}`
  if (seen.has(key)) return
  seen.add(key)
  out.push({
    kind: 'safetyCultureMedia',
    mediaId: String(id),
    token: String(token),
    mediaType: String(obj.media_type || obj.mediaType || ''),
    filename: String(obj.file_name || obj.filename || obj.name || 'media')
  })
}

function walkForMedia(val, out, seen, depth) {
  if (depth > 14 || val == null) return
  if (Array.isArray(val)) {
    for (const x of val) {
      if (x && typeof x === 'object') {
        pushIfMediaItem(x, out, seen)
        walkForMedia(x, out, seen, depth + 1)
      }
    }
    return
  }
  if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) {
      if (MEDIA_ARRAY_KEYS.has(k)) {
        if (Array.isArray(v)) {
          for (const x of v) pushIfMediaItem(x, out, seen)
        } else if (v && typeof v === 'object') {
          if (Array.isArray(v.items)) {
            for (const x of v.items) pushIfMediaItem(x, out, seen)
          }
          if (Array.isArray(v.media)) {
            for (const x of v.media) pushIfMediaItem(x, out, seen)
          }
          walkForMedia(v, out, seen, depth + 1)
        }
      } else {
        walkForMedia(v, out, seen, depth + 1)
      }
    }
  }
}

/**
 * Collect unique SafetyCulture media descriptors from issue feed row + detail object.
 * @param {object|null|undefined} feed
 * @param {object|null|undefined} detail
 * @returns {object[]}
 */
export function collectIssueMediaForJobCard(feed, detail) {
  const out = []
  const seen = new Set()
  walkForMedia(feed, out, seen, 0)
  walkForMedia(detail, out, seen, 0)
  return out
}

/**
 * @param {object|null|undefined} feed
 * @param {object|null|undefined} detail
 * @returns {string} JSON array string for JobCard.photos
 */
export function buildIssueJobCardPhotosJson(feed, detail) {
  const items = collectIssueMediaForJobCard(feed, detail)
  return JSON.stringify(items)
}

/**
 * Prefer API detail for technician, client/site labels, location, GPS when feed omits them.
 * @param {object} issue — feed-like row (may already be merged)
 * @param {object|null|undefined} detailData — normalized incident from fetchIssueDetails
 */
export function overlayIssueJobCardFieldsFromDetail(issue, detailData) {
  if (!issue || typeof issue !== 'object') return issue
  const d = detailData && typeof detailData === 'object' ? detailData : {}
  const site = d.site && typeof d.site === 'object' ? d.site : {}
  const loc = d.location && typeof d.location === 'object' ? d.location : {}
  const assignee = d.assignee && typeof d.assignee === 'object' ? d.assignee : {}
  const creator = d.creator && typeof d.creator === 'object' ? d.creator : {}
  const task = d.task && typeof d.task === 'object' ? d.task : {}
  const catObj = d.category && typeof d.category === 'object' ? d.category : {}

  const next = { ...issue }

  if (d.status != null && d.status !== '' && !next.status) next.status = d.status
  if (d.priority != null && d.priority !== '' && next.priority == null) next.priority = d.priority
  if (d.unique_id && !next.unique_id) next.unique_id = d.unique_id
  if (d.category_label && !next.category_label) next.category_label = d.category_label
  if (!next.category_label && (catObj.label || catObj.name)) {
    next.category_label = catObj.label || catObj.name
  }

  const agentName =
    next.assignee_name ||
    next.assigneeName ||
    assignee.name ||
    assignee.display_name ||
    assignee.full_name ||
    next.creator_user_name ||
    creator.name ||
    creator.display_name ||
    creator.full_name ||
    d.assignee_name ||
    d.creator_name ||
    ''
  if (agentName) {
    next.assignee_name = agentName
    next.assigneeName = agentName
  }

  const clientName =
    next.client_name ||
    d.client_name ||
    d.customer_name ||
    d.organisation_name ||
    d.organization_name ||
    site.client_name ||
    next.site_name ||
    d.site_name ||
    site.name ||
    ''
  if (clientName) next.client_name = clientName

  const siteName = next.site_name || d.site_name || site.name || ''
  if (siteName) next.site_name = siteName

  const siteId = next.site_id ?? d.site_id ?? site.id
  if (siteId != null && siteId !== '') next.site_id = siteId

  const location =
    next.location_name ||
    d.location_name ||
    loc.name ||
    d.location_address ||
    [loc.city, loc.region, loc.country].filter(Boolean).join(', ') ||
    next.location ||
    ''
  if (location) next.location_name = location

  let lat =
    next.latitude ??
    d.latitude ??
    loc.latitude ??
    site.latitude ??
    loc.lat ??
    site.lat
  let lng =
    next.longitude ??
    d.longitude ??
    loc.longitude ??
    site.longitude ??
    loc.lng ??
    site.lng
  if (lat != null && lat !== '') next.latitude = lat
  if (lng != null && lng !== '') next.longitude = lng

  const title =
    next.title ||
    next.name ||
    d.title ||
    task.title ||
    (task.DESCRIPTION != null ? String(task.DESCRIPTION).slice(0, 500) : '') ||
    next.description ||
    d.description ||
    ''
  if (title) {
    next.title = title
    if (!next.name) next.name = title
  }

  const desc =
    next.description ||
    d.description ||
    task.description ||
    (task.DESCRIPTION != null ? String(task.DESCRIPTION) : '') ||
    ''
  if (desc) next.description = desc

  return next
}
