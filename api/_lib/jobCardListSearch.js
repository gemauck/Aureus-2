/**
 * Job card list search: field-scoped tokens (site:, location:, …), multi-word AND,
 * and dedicated filter params. Keeps heavy JSON columns out of list scans.
 */

const HEADING_PREFIX = 'Heading:'

/** Prisma `contains` targets for a single free-text token (list endpoint only). */
export const JOB_CARD_LIST_FREE_TEXT_FIELDS = [
  'jobCardNumber',
  'status',
  'agentName',
  'otherTechnicians',
  'clientId',
  'clientName',
  'siteId',
  'siteName',
  'location',
  'locationLatitude',
  'locationLongitude',
  'vehicleUsed',
  'reasonForVisit',
  'callOutCategory',
  'diagnosis',
  'futureWorkRequired',
  'actionsTaken',
  'otherComments',
  'completedByName',
  'completedByUserId'
]

const FIELD_ALIASES = {
  site: 'site',
  location: 'location',
  loc: 'location',
  client: 'client',
  heading: 'heading',
  title: 'heading',
  technician: 'technician',
  tech: 'technician',
  category: 'category',
  cat: 'category',
  jc: 'jc',
  job: 'jc',
  status: 'status',
  vehicle: 'vehicle',
  visit: 'visit',
  diagnosis: 'diagnosis',
  notes: 'notes'
}

const FIELD_FILTER_PATTERN =
  /\b(site|location|loc|client|heading|title|technician|tech|category|cat|jc|job|status|vehicle|visit|diagnosis|notes)\s*[:=]\s*("([^"]+)"|'([^']+)'|([^\s]+))/gi

/**
 * @param {string} raw
 * @returns {{ fieldFilters: Record<string, string[]>, freeTokens: string[] }}
 */
export function parseJobCardListSearchQuery(raw) {
  const input = String(raw || '').trim()
  if (!input) {
    return { fieldFilters: {}, freeTokens: [] }
  }

  const fieldFilters = {}
  let remainder = input

  let match
  const re = new RegExp(FIELD_FILTER_PATTERN.source, 'gi')
  while ((match = re.exec(input)) !== null) {
    const alias = String(match[1] || '').toLowerCase()
    const key = FIELD_ALIASES[alias]
    if (!key) continue
    const value = String(match[3] ?? match[4] ?? match[5] ?? '').trim()
    if (!value) continue
    if (!fieldFilters[key]) fieldFilters[key] = []
    fieldFilters[key].push(value)
    remainder = remainder.replace(match[0], ' ')
  }

  const freeTokens = remainder
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  return { fieldFilters, freeTokens }
}

function containsInsensitive(value) {
  return { contains: value, mode: 'insensitive' }
}

function orAcrossFields(fields, value) {
  const v = String(value || '').trim()
  if (!v) return null
  const clauses = fields
    .map((field) => {
      if (field === 'heading') {
        return {
          OR: [
            { otherComments: containsInsensitive(`${HEADING_PREFIX}${v}`) },
            { otherComments: containsInsensitive(v) },
            { reasonForVisit: containsInsensitive(v) }
          ]
        }
      }
      if (field === 'jc') {
        return { jobCardNumber: containsInsensitive(v) }
      }
      if (field === 'site') {
        return {
          OR: [{ siteName: containsInsensitive(v) }, { siteId: containsInsensitive(v) }]
        }
      }
      if (field === 'location') {
        return {
          OR: [
            { location: containsInsensitive(v) },
            { locationLatitude: containsInsensitive(v) },
            { locationLongitude: containsInsensitive(v) }
          ]
        }
      }
      if (field === 'client') {
        return {
          OR: [{ clientName: containsInsensitive(v) }, { clientId: containsInsensitive(v) }]
        }
      }
      if (field === 'technician') {
        return {
          OR: [
            { agentName: containsInsensitive(v) },
            { otherTechnicians: containsInsensitive(v) },
            { completedByName: containsInsensitive(v) }
          ]
        }
      }
      if (field === 'category') {
        return { callOutCategory: containsInsensitive(v) }
      }
      if (field === 'status') {
        return { status: containsInsensitive(v) }
      }
      if (field === 'vehicle') {
        return { vehicleUsed: containsInsensitive(v) }
      }
      if (field === 'visit') {
        return { reasonForVisit: containsInsensitive(v) }
      }
      if (field === 'diagnosis') {
        return { diagnosis: containsInsensitive(v) }
      }
      if (field === 'notes') {
        return {
          OR: [
            { otherComments: containsInsensitive(v) },
            { actionsTaken: containsInsensitive(v) },
            { diagnosis: containsInsensitive(v) },
            { futureWorkRequired: containsInsensitive(v) }
          ]
        }
      }
      return { [field]: containsInsensitive(v) }
    })
    .filter(Boolean)

  if (!clauses.length) return null
  if (clauses.length === 1) return clauses[0]
  return { OR: clauses }
}

function freeTokenOrClause(token) {
  const v = String(token || '').trim()
  if (!v) return null
  return {
    OR: JOB_CARD_LIST_FREE_TEXT_FIELDS.map((field) => ({
      [field]: containsInsensitive(v)
    }))
  }
}

/**
 * Build Prisma where fragment for list text search (field tokens + free words).
 * @param {string} searchQ
 * @returns {object|null}
 */
export function buildJobCardListSearchOr(searchQ) {
  const { fieldFilters, freeTokens } = parseJobCardListSearchQuery(searchQ)
  const andParts = []

  for (const [key, values] of Object.entries(fieldFilters)) {
    for (const value of values) {
      const clause = orAcrossFields([key], value)
      if (clause) andParts.push(clause)
    }
  }

  for (const token of freeTokens) {
    const clause = freeTokenOrClause(token)
    if (clause) andParts.push(clause)
  }

  if (!andParts.length) return null
  if (andParts.length === 1) return andParts[0]
  return { AND: andParts }
}

/**
 * Dedicated dropdown / filter params (contains, case-insensitive).
 * @param {{ site?: string, location?: string, agentName?: string }} filters
 * @returns {object|null}
 */
export function buildJobCardListFacetFilters(filters = {}) {
  const andParts = []
  const site = String(filters.site || '').trim()
  const location = String(filters.location || '').trim()
  const agentName = String(filters.agentName || '').trim()

  if (site) {
    andParts.push({
      OR: [{ siteName: containsInsensitive(site) }, { siteId: containsInsensitive(site) }]
    })
  }
  if (location) {
    andParts.push({
      OR: [
        { location: containsInsensitive(location) },
        { locationLatitude: containsInsensitive(location) },
        { locationLongitude: containsInsensitive(location) }
      ]
    })
  }
  if (agentName) {
    andParts.push({
      OR: [
        { agentName: containsInsensitive(agentName) },
        { otherTechnicians: containsInsensitive(agentName) },
        { completedByName: containsInsensitive(agentName) }
      ]
    })
  }

  if (!andParts.length) return null
  if (andParts.length === 1) return andParts[0]
  return { AND: andParts }
}

/**
 * Merge base filters, facet filters, and q search into one Prisma where.
 */
export function buildJobCardListWhereClause(baseFilters, { searchQ, site, location, agentName } = {}) {
  const parts = []
  if (baseFilters && Object.keys(baseFilters).length > 0) {
    parts.push(baseFilters)
  }
  const facet = buildJobCardListFacetFilters({ site, location, agentName })
  if (facet) parts.push(facet)
  const searchOr = searchQ ? buildJobCardListSearchOr(searchQ) : null
  if (searchOr) parts.push(searchOr)

  if (!parts.length) return {}
  if (parts.length === 1) return parts[0]
  return { AND: parts }
}
