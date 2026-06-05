import type { CrmClient, CrmEntityBase, CrmFilterKey, CrmLead, CrmTab } from './types'

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

export function displayStage(entity: CrmEntityBase) {
  const v =
    entity.engagementStage ||
    entity.stage ||
    entity.status ||
    entity.aidaStatus ||
    ''
  return String(v || '').trim()
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
    if (filter === 'starred' && !item.isStarred) return false
    if (filter === 'active') {
      const st = String(item.status || '').toLowerCase()
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
