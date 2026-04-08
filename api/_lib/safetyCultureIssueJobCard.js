/**
 * Build job card photos JSON and field overlays from SafetyCulture issue API payloads.
 * Photos use kind "safetyCultureMedia" so JobCards.jsx can resolve via /api/safety-culture/media/sign-url.
 */

/** Keep job card notes reasonable; TEXT column is unbounded but UI and emails suffer if huge. */
const MAX_ISSUE_NOTES_APPEND_CHARS = 120_000

function humanizeLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Plain-text appendix for "Additional notes" (readable; not JSON).
 * Full raw payload remains in safetyCultureSnapshotJson.
 */
export function buildSafetyCultureIssueNotesAppendix(issueId, feed, detailData) {
  const lines = []
  const push = (s) => lines.push(s)
  const blank = () => {
    if (lines.length && lines[lines.length - 1] !== '') push('')
  }
  const section = (title) => {
    blank()
    push('────────────────────────────────────────')
    push(title)
    push('────────────────────────────────────────')
  }
  const pair = (label, val) => {
    if (val == null || val === '') return
    if (typeof val === 'object') return
    const s = String(val).trim()
    if (!s) return
    push(`${label}: ${s}`)
  }

  const f = feed && typeof feed === 'object' && !Array.isArray(feed) ? feed : {}
  const d = detailData && typeof detailData === 'object' && !Array.isArray(detailData) ? detailData : {}

  section('SafetyCulture issue — full record')
  pair('Issue ID', issueId)
  pair('Copied into ERP at', new Date().toISOString())

  section('Summary (from feed / list)')
  pair('Title', f.title || f.name)
  pair('Description', f.description)
  pair('Status', f.status)
  pair('Priority', f.priority)
  pair('Category', f.category_label)
  pair('Site name', f.site_name)
  pair('Site ID', f.site_id != null ? String(f.site_id) : '')
  pair('Location', f.location_name || f.location)
  pair('Client / organisation', f.client_name || f.customer_name)
  pair('Unique ID', f.unique_id)
  pair('Due', f.due_at)
  pair('Inspection', f.inspection_name)
  pair('Assignee (feed)', f.assignee_name || f.assigneeName)
  pair('Occurred at', f.occurred_at)
  pair('Created (feed)', f.created_at || f.createdAt)
  pair('Modified (feed)', f.modified_at || f.updated_at)
  pair('Report link', f.url || f.web_url || f.link)

  const task = d.task && typeof d.task === 'object' ? d.task : {}
  const taskCreator = task.creator && typeof task.creator === 'object' ? task.creator : {}
  const dCreator = d.creator && typeof d.creator === 'object' ? d.creator : {}
  const assignee = d.assignee && typeof d.assignee === 'object' ? d.assignee : {}
  const site = d.site && typeof d.site === 'object' ? d.site : {}
  const loc = d.location && typeof d.location === 'object' ? d.location : {}
  const cat = d.category && typeof d.category === 'object' ? d.category : {}

  const creatorName =
    [taskCreator.firstname, taskCreator.lastname].filter(Boolean).join(' ').trim() ||
    taskCreator.name ||
    taskCreator.display_name ||
    [dCreator.firstname, dCreator.lastname].filter(Boolean).join(' ').trim() ||
    dCreator.name ||
    dCreator.display_name ||
    ''

  section('Task (from API detail)')
  pair('Title', task.title)
  pair('Description', task.description != null ? task.description : task.DESCRIPTION)
  pair('Task ID', task.task_id || task.id)
  pair('Created', task.created_at || task.createdAt)
  pair('Updated', task.updated_at || task.modified_at)

  section('People')
  pair('Creator name', creatorName || null)
  pair('Creator user ID', taskCreator.user_id || dCreator.user_id || dCreator.id)
  pair('Assignee', assignee.name || assignee.display_name || d.assignee_name)

  section('Site and location (from API detail)')
  pair('Site name', site.name)
  pair('Site ID', site.id != null ? String(site.id) : '')
  pair('Location name', loc.name)
  pair('Address line', loc.address || loc.formatted_address)
  pair('City / region / country', [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || '')
  pair('Coordinates', loc.latitude != null && loc.longitude != null ? `${loc.latitude}, ${loc.longitude}` : '')

  section('Issue fields (from API detail)')
  pair('Title', d.title && d.title !== task.title ? d.title : null)
  pair('Description', d.description && d.description !== task.description ? d.description : null)
  pair('Status', d.status)
  pair('Priority', d.priority)
  pair('Category', d.category_label || cat.label || cat.name)
  pair('Category ID', cat.id)
  pair('Unique ID', d.unique_id)

  const skipKeys = new Set([
    'task',
    'site',
    'location',
    'category',
    'creator',
    'assignee',
    'media',
    'medias',
    'images',
    'attachments',
    'photos',
    'files',
    'media_items',
    'evidence'
  ])
  const extra = []
  for (const [k, v] of Object.entries(d)) {
    if (skipKeys.has(k)) continue
    if (v == null || v === '') continue
    if (typeof v === 'object') continue
    extra.push([humanizeLabel(k), String(v).trim()])
  }
  if (extra.length) {
    section('Other details from API')
    for (const [lbl, val] of extra) {
      if (val) pair(lbl, val)
    }
  }

  blank()
  push('Files and images attached to this issue appear under “Photos & videos” above.')
  push('For the complete raw API payload, open “Safety Culture — imported snapshot” (JSON) on this job card.')

  let text = lines.join('\n').trimEnd()
  if (text.length > MAX_ISSUE_NOTES_APPEND_CHARS) {
    text =
      text.slice(0, MAX_ISSUE_NOTES_APPEND_CHARS) +
      '\n\n[…truncated — open the Safety Culture snapshot on this job card for the full raw data.]'
  }
  return `\n\n${text}`
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
