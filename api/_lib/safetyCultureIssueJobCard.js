/**
 * Build job card photos JSON and field overlays from SafetyCulture issue API payloads.
 * Photos use kind "safetyCultureMedia" so JobCards.jsx can resolve via /api/safety-culture/media/proxy (issue_id refreshes stale tokens).
 */

/** Keep job card notes reasonable; TEXT column is unbounded but UI and emails suffer if huge. */
const MAX_ISSUE_NOTES_APPEND_CHARS = 120_000

function humanizeLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Creator / assignee fields from issue API detail (same semantics as the "People" notes section).
 * @param {object|null|undefined} detailData
 * @returns {{ creatorName: string, creatorUserId: string, creatorEmail: string, assigneeName: string }}
 */
export function extractIssuePeopleFromDetail(detailData) {
  const d =
    detailData && typeof detailData === 'object' && !Array.isArray(detailData) ? detailData : {}
  const task = d.task && typeof d.task === 'object' ? d.task : {}
  const taskCreator = task.creator && typeof task.creator === 'object' ? task.creator : {}
  const dCreator = d.creator && typeof d.creator === 'object' ? d.creator : {}
  const assignee = d.assignee && typeof d.assignee === 'object' ? d.assignee : {}

  const creatorName = (
    [taskCreator.firstname, taskCreator.lastname].filter(Boolean).join(' ').trim() ||
    taskCreator.name ||
    taskCreator.display_name ||
    [dCreator.firstname, dCreator.lastname].filter(Boolean).join(' ').trim() ||
    dCreator.name ||
    dCreator.display_name ||
    ''
  ).trim()

  const creatorUserIdRaw =
    taskCreator.user_id ||
    taskCreator.userId ||
    dCreator.user_id ||
    dCreator.userId ||
    dCreator.id
  const creatorUserId =
    creatorUserIdRaw != null && creatorUserIdRaw !== '' ? String(creatorUserIdRaw) : ''

  const rawEmail =
    taskCreator.email ||
    taskCreator.email_address ||
    taskCreator.Email ||
    dCreator.email ||
    dCreator.email_address ||
    dCreator.Email ||
    ''
  const creatorEmail = String(rawEmail || '').trim()

  const assigneeName = (
    assignee.name ||
    assignee.display_name ||
    assignee.full_name ||
    d.assignee_name ||
    ''
  ).trim()

  return { creatorName, creatorUserId, creatorEmail, assigneeName }
}

/**
 * Map incident/detail API payload (mixed snake_case / camelCase / nested) to a feed-like row.
 * Used when importing by issue id only (no list/feed row).
 * @param {object|null|undefined} d
 * @param {string} fallbackId
 */
export function issueFeedRowFromIssueDetail(d, fallbackId) {
  if (!d || typeof d !== 'object') d = {}
  const site = d.site && typeof d.site === 'object' ? d.site : {}
  const loc = d.location && typeof d.location === 'object' ? d.location : {}
  const cat = d.category && typeof d.category === 'object' ? d.category : {}
  const task = d.task && typeof d.task === 'object' ? d.task : {}
  const asg = d.assignee && typeof d.assignee === 'object' ? d.assignee : {}
  const cre = d.creator && typeof d.creator === 'object' ? d.creator : {}
  const id = d.id || d.issue_id || fallbackId
  const taskDesc = task.description || task.DESCRIPTION
  return {
    id,
    title: d.title || task.title || (taskDesc ? String(taskDesc).slice(0, 500) : undefined),
    name: d.name,
    description: d.description || taskDesc,
    status: d.status,
    priority: d.priority,
    unique_id: d.unique_id,
    category_label: d.category_label || cat.label || cat.name,
    inspection_name: d.inspection_name || d.inspectionName,
    due_at: d.due_at || d.dueAt,
    url: d.url || d.web_url || d.link,
    web_url: d.web_url,
    link: d.link,
    assignee_name:
      d.assignee_name ||
      d.assigneeName ||
      asg.name ||
      asg.display_name ||
      asg.full_name,
    assigneeName: d.assigneeName || asg.name,
    creator_user_name:
      d.creator_user_name ||
      d.creatorUserName ||
      cre.name ||
      cre.display_name,
    site_name: d.site_name || d.siteName || site.name,
    site_id: d.site_id ?? d.siteId ?? site.id,
    location_name:
      d.location_name ||
      d.locationName ||
      loc.name ||
      [loc.city, loc.region, loc.country].filter(Boolean).join(', ') ||
      '',
    occurred_at: d.occurred_at || d.occurredAt,
    created_at: d.created_at || d.createdAt,
    createdAt: d.createdAt,
    completed_at: d.completed_at || d.completedAt,
    completedAt: d.completedAt
  }
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
  const toPair = (label, val) => {
    if (val == null || val === '') return
    if (typeof val === 'object') return
    const s = String(val).trim()
    if (!s) return
    return `${label}: ${s}`
  }
  const sectionPairs = (title, pairs) => {
    const filled = pairs.filter(Boolean)
    if (filled.length === 0) return
    section(title)
    for (const line of filled) push(line)
  }

  const f = feed && typeof feed === 'object' && !Array.isArray(feed) ? feed : {}
  const d = detailData && typeof detailData === 'object' && !Array.isArray(detailData) ? detailData : {}

  sectionPairs('SafetyCulture issue — full record', [
    toPair('Issue ID', issueId),
    toPair('Copied into ERP at', new Date().toISOString())
  ])

  sectionPairs('Summary (from feed / list)', [
    toPair('Title', f.title || f.name),
    toPair('Description', f.description),
    toPair('Status', f.status),
    toPair('Priority', f.priority),
    toPair('Category', f.category_label),
    toPair('Site name', f.site_name),
    toPair('Site ID', f.site_id != null ? String(f.site_id) : ''),
    toPair('Location', f.location_name || f.location),
    toPair('Client / organisation', f.client_name || f.customer_name),
    toPair('Unique ID', f.unique_id),
    toPair('Due', f.due_at),
    toPair('Inspection', f.inspection_name),
    toPair('Assignee (feed)', f.assignee_name || f.assigneeName),
    toPair('Occurred at', f.occurred_at),
    toPair('Created (feed)', f.created_at || f.createdAt),
    toPair('Modified (feed)', f.modified_at || f.updated_at),
    toPair('Report link', f.url || f.web_url || f.link)
  ])

  const task = d.task && typeof d.task === 'object' ? d.task : {}
  const site = d.site && typeof d.site === 'object' ? d.site : {}
  const loc = d.location && typeof d.location === 'object' ? d.location : {}
  const cat = d.category && typeof d.category === 'object' ? d.category : {}
  const people = extractIssuePeopleFromDetail(detailData)

  sectionPairs('Task (from API detail)', [
    toPair('Title', task.title),
    toPair('Description', task.description != null ? task.description : task.DESCRIPTION),
    toPair('Task ID', task.task_id || task.id),
    toPair('Created', task.created_at || task.createdAt),
    toPair('Updated', task.updated_at || task.modified_at)
  ])

  sectionPairs('People', [
    toPair('Creator name', people.creatorName || null),
    toPair('Creator user ID', people.creatorUserId || null),
    toPair('Assignee', people.assigneeName || null)
  ])

  sectionPairs('Site and location (from API detail)', [
    toPair('Site name', site.name),
    toPair('Site ID', site.id != null ? String(site.id) : ''),
    toPair('Location name', loc.name),
    toPair('Address line', loc.address || loc.formatted_address),
    toPair('City / region / country', [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || ''),
    toPair('Coordinates', loc.latitude != null && loc.longitude != null ? `${loc.latitude}, ${loc.longitude}` : '')
  ])

  sectionPairs('Issue fields (from API detail)', [
    toPair('Title', d.title && d.title !== task.title ? d.title : null),
    toPair('Description', d.description && d.description !== task.description ? d.description : null),
    toPair('Status', d.status),
    toPair('Priority', d.priority),
    toPair('Category', d.category_label || cat.label || cat.name),
    toPair('Category ID', cat.id),
    toPair('Unique ID', d.unique_id)
  ])

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
    sectionPairs(
      'Other details from API',
      extra.map(([lbl, val]) => toPair(lbl, val))
    )
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
  /** Prefer media_id: nested payloads sometimes use id for a non-file entity. */
  const id = obj.media_id ?? obj.id ?? obj.document_id
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
