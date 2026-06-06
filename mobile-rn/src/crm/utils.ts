import type {
  CrmActivityItem,
  CrmClient,
  CrmContract,
  CrmEntityBase,
  CrmFilterKey,
  CrmFollowUp,
  CrmLead,
  CrmProject,
  CrmProposal,
  CrmService,
  CrmTab
} from './types'

export function entitySites(entity: CrmEntityBase) {
  const sites = entity.sites || entity.clientSites || []
  return Array.isArray(sites) ? sites : []
}

export function entityContacts(entity: CrmEntityBase) {
  return Array.isArray(entity.contacts) ? entity.contacts : []
}

export function entityComments(entity: CrmEntityBase) {
  return Array.isArray(entity.comments) ? entity.comments : []
}

export function entityFollowUps(entity: CrmEntityBase): CrmFollowUp[] {
  return Array.isArray(entity.followUps) ? entity.followUps : []
}

export function entityContracts(entity: CrmEntityBase): CrmContract[] {
  return Array.isArray(entity.contracts) ? entity.contracts : []
}

export function entityProposals(entity: CrmEntityBase): CrmProposal[] {
  return Array.isArray(entity.proposals) ? entity.proposals : []
}

export function entityServices(entity: CrmEntityBase): CrmService[] {
  return Array.isArray(entity.services) ? entity.services : []
}

export function entityProjects(entity: CrmEntityBase): CrmProject[] {
  if (Array.isArray(entity.projects) && entity.projects.length) return entity.projects
  return []
}

export function entityActivityLog(entity: CrmEntityBase): CrmActivityItem[] {
  return Array.isArray(entity.activityLog) ? entity.activityLog : []
}

export function formatCommentAuthor(c: {
  author?: string | { name?: string; email?: string }
  userName?: string
}) {
  if (typeof c.author === 'string') return c.author
  if (c.author && typeof c.author === 'object') return c.author.name || c.author.email || ''
  return c.userName || ''
}

function normalizeFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
}

/** Match web ERP starred-client resolution (per-user StarredClient table). */
export function resolveStarredState(entity: CrmEntityBase): boolean {
  if (normalizeFlag(entity.isStarred)) return true
  if (normalizeFlag((entity as { starred?: unknown }).starred)) return true
  const starredBy = (entity as { starredBy?: unknown[] }).starredBy
  if (Array.isArray(starredBy) && starredBy.length > 0) return true
  return false
}

export function normalizeEntity<T extends CrmEntityBase>(entity: T): T {
  return { ...entity, isStarred: resolveStarredState(entity) }
}

export function displayClientStatus(entity: CrmEntityBase): string {
  const raw = String(entity.status || entity.engagementStage || '').trim()
  if (!raw) return 'Active'
  const lower = raw.toLowerCase()
  if (lower === 'inactive') return 'Inactive'
  if (lower === 'active') return 'Active'
  return raw
}

export function displayLeadStage(entity: CrmEntityBase): string {
  return String(entity.engagementStage || entity.stage || entity.status || 'Potential').trim()
}

export function displayStage(entity: CrmEntityBase, kind?: CrmTab | 'client' | 'lead'): string {
  const isLead = kind === 'leads' || kind === 'lead' || entity.type === 'lead'
  return isLead ? displayLeadStage(entity) : displayClientStatus(entity)
}

export function sortByName<T extends CrmEntityBase>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  )
}

export function statusTint(status: string) {
  const s = status.toLowerCase()
  if (s.includes('active') || s.includes('won') || s.includes('customer')) return '#16a34a'
  if (s.includes('potential') || s.includes('qualified') || s.includes('interest')) return '#0284c7'
  if (s.includes('hold') || s.includes('pending') || s.includes('new')) return '#d97706'
  if (s.includes('lost') || s.includes('inactive') || s.includes('closed')) return '#64748b'
  return '#6366f1'
}

export function formatMoney(value?: number) {
  if (value == null || !Number.isFinite(value)) return ''
  return `R ${value.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}

export function formatDate(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function filterEntities<T extends CrmEntityBase>(
  items: T[],
  query: string,
  filter: CrmFilterKey,
  industry: string
) {
  const q = query.trim().toLowerCase()
  return items.filter((item) => {
    const starred = resolveStarredState(item)
    if (filter === 'starred' && !starred) return false
    if (filter === 'active') {
      const st = String(item.status || item.engagementStage || '').toLowerCase()
      if (st && st !== 'active' && !st.includes('potential')) return false
    }
    if (industry && industry !== 'all') {
      if (String(item.industry || '').toLowerCase() !== industry.toLowerCase()) return false
    }
    if (!q) return true
    const hay = [
      item.name,
      item.industry,
      item.status,
      displayStage(item),
      item.address,
      item.website
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function uniqueIndustries(items: Array<CrmClient | CrmLead>) {
  const set = new Set<string>()
  for (const item of items) {
    const ind = String(item.industry || '').trim()
    if (ind) set.add(ind)
  }
  return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
}

export function tabCounts(clients: CrmClient[], leads: CrmLead[]) {
  return {
    clients: clients.length,
    leads: leads.length
  }
}

export function entityKindLabel(tab: CrmTab) {
  return tab === 'clients' ? 'Client' : 'Lead'
}

export function newLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
