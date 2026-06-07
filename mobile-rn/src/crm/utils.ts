import type {
  CrmActivityItem,
  CrmClient,
  CrmContract,
  CrmEntityBase,
  CrmFilterKey,
  CrmFollowUp,
  CrmGroup,
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
  createdBy?: string
}) {
  if (typeof c.author === 'string') return c.author
  if (c.author && typeof c.author === 'object') return c.author.name || c.author.email || ''
  return c.createdBy || c.userName || ''
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

/** Match web CRM: only type client or legacy null/undefined/empty — not group or lead. */
export function isCrmClient(entity: Pick<CrmEntityBase, 'type'>): boolean {
  const t = entity.type
  return t === 'client' || t === null || t === undefined || t === ''
}

export function isCrmGroup(entity: Pick<CrmEntityBase, 'type'>): boolean {
  return entity.type === 'group'
}

export function isCrmLead(entity: Pick<CrmEntityBase, 'type'>): boolean {
  return entity.type === 'lead'
}

/** Clients list — exclude groups and leads (matches web Clients.jsx filteredClients). */
export function filterClientsList(clients: CrmClient[]): CrmClient[] {
  return clients.filter((c) => isCrmClient(c) && !isCrmGroup(c))
}

export function groupMemberCount(group: CrmGroup): number {
  const count = group._count
  if (!count) return 0
  return (count.groupChildren ?? 0) + (count.childCompanies ?? 0)
}

/** Client account status (Active/Inactive) — not lead pipeline stages. */
export function normalizeClientAccountStatus(statusOrStage?: string | null): 'Active' | 'Inactive' {
  const s = String(statusOrStage ?? 'Active').trim().toLowerCase()
  return s === 'inactive' ? 'Inactive' : 'Active'
}

/** Match web Clients.jsx — engagementStage is authoritative over legacy status. */
export function resolveClientAccountRawStage(entity: Pick<CrmEntityBase, 'engagementStage' | 'status'>): string {
  return String(entity.engagementStage ?? entity.status ?? 'Active').trim()
}

/** Match web processClientData client account status derivation. */
export function displayClientStatus(entity: CrmEntityBase): 'Active' | 'Inactive' {
  const rawStage = resolveClientAccountRawStage(entity)
  const rawLower = rawStage.toLowerCase()
  if (rawLower === 'inactive') return 'Inactive'
  return 'Active'
}

export function isClientAccountInactive(entity: CrmEntityBase): boolean {
  return displayClientStatus(entity) === 'Inactive'
}

/** Match web clientEngagementStageFromAccountStatus when saving. */
export function clientEngagementStageFromAccountStatus(statusOrStage?: string | null): string {
  return normalizeClientAccountStatus(statusOrStage) === 'Inactive' ? 'inactive' : 'Active'
}

export function displayLeadStage(entity: CrmEntityBase): string {
  return String(entity.engagementStage ?? entity.stage ?? entity.status ?? 'Potential').trim()
}

export function displayStage(
  entity: CrmEntityBase,
  kind?: CrmTab | 'client' | 'lead' | 'group'
): string {
  if (kind === 'groups' || kind === 'group' || isCrmGroup(entity)) return ''
  const isLead = kind === 'leads' || kind === 'lead' || isCrmLead(entity)
  return isLead ? displayLeadStage(entity) : displayClientStatus(entity)
}

export function sortByName<T extends CrmEntityBase>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  )
}

export function statusTint(status: string) {
  const s = status.toLowerCase()
  if (s === 'no engagement') return '#64748b'
  if (s === 'awareness') return '#6b7280'
  if (s === 'interest') return '#0284c7'
  if (s === 'desire') return '#ca8a04'
  if (s === 'action') return '#16a34a'
  if (s === 'disinterested') return '#94a3b8'
  if (s === 'potential') return '#0284c7'
  if (s === 'proposal') return '#d97706'
  if (s === 'tender') return '#7c3aed'
  if (s.includes('active') || s.includes('won') || s.includes('customer')) return '#16a34a'
  if (s.includes('qualified') || s.includes('interest')) return '#0284c7'
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
  industry: string,
  kind?: CrmTab
) {
  const q = query.trim().toLowerCase()
  const isClientList = kind === 'clients'
  const isGroupList = kind === 'groups'
  return items.filter((item) => {
    if (isGroupList) {
      // Groups tab: search + industry only (no starred/active lead filters)
      if (industry && industry !== 'all') {
        if (String(item.industry || '').toLowerCase() !== industry.toLowerCase()) return false
      }
      if (!q) return true
      const hay = [item.name, item.industry].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    }

    const starred = resolveStarredState(item)
    if (filter === 'starred' && !starred) return false
    if (filter === 'active') {
      if (isClientList) {
        if (isClientAccountInactive(item)) return false
      } else {
        const st = String(item.engagementStage ?? item.stage ?? item.status ?? '').toLowerCase()
        if (st === 'disinterested' || st === 'inactive') return false
      }
    }
    if (industry && industry !== 'all') {
      if (String(item.industry || '').toLowerCase() !== industry.toLowerCase()) return false
    }
    if (!q) return true
    const hay = [
      item.name,
      item.industry,
      isClientList ? displayClientStatus(item) : displayLeadStage(item),
      item.address,
      item.website
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function uniqueIndustries(items: Array<CrmClient | CrmLead | CrmGroup>) {
  const set = new Set<string>()
  for (const item of items) {
    const ind = String(item.industry || '').trim()
    if (ind) set.add(ind)
  }
  return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
}

export function tabCounts(clients: CrmClient[], leads: CrmLead[], groups: CrmGroup[] = []) {
  return {
    clients: clients.length,
    leads: leads.length,
    groups: groups.length
  }
}

export function entityKindLabel(tab: CrmTab) {
  if (tab === 'pipeline') return 'Pipeline item'
  if (tab === 'groups') return 'Group'
  return tab === 'clients' ? 'Client' : 'Lead'
}

export function detailEntityKindLabel(entityType: 'client' | 'lead' | 'group') {
  if (entityType === 'group') return 'Group'
  return entityType === 'client' ? 'Client' : 'Lead'
}

export function newLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
