import { AIDA_STAGES, ENGAGEMENT_STAGES } from './constants'
import type { PipelineFilters, PipelineItem, PipelineListRow } from './types'
import type { CrmClient, CrmLead, CrmOpportunity } from '../types'
import { entitySites, resolveStarredState } from '../utils'

export function normalizeStageToAida(rawStage?: string | null): string {
  const fallbackStage = 'Awareness'
  if (rawStage == null) return fallbackStage
  const normalized = String(rawStage).trim()
  if (!normalized) return fallbackStage
  const lower = normalized.toLowerCase()
  if (lower === 'prospect' || lower === 'new') return fallbackStage
  const exact = AIDA_STAGES.find((s) => s.toLowerCase() === lower)
  if (exact) return exact
  const ids = ['no engagement', 'awareness', 'interest', 'desire', 'action']
  const idx = ids.indexOf(lower)
  if (idx !== -1) return AIDA_STAGES[idx]
  return fallbackStage
}

export function normalizeLifecycleStage(value?: string | null): string {
  switch (String(value || '').toLowerCase()) {
    case 'active':
      return 'Active'
    case 'proposal':
      return 'Proposal'
    case 'tender':
      return 'Tender'
    case 'disinterested':
      return 'Disinterested'
    case 'potential':
    default:
      return 'Potential'
  }
}

function leadHasPipelineSites(lead: CrmLead): boolean {
  return entitySites(lead).some((site) => site && typeof site === 'object' && site.siteType !== 'client')
}

export function buildPipelineItems(clients: CrmClient[], leads: CrmLead[]): PipelineItem[] {
  const leadItems: PipelineItem[] = leads.map((lead) => {
    const hasAida =
      (lead.aidaStatus != null && String(lead.aidaStatus).trim() !== '') ||
      (lead.stage != null && String(lead.stage).trim() !== '')
    const originalStage = hasAida ? (lead.aidaStatus ?? lead.stage) : null
    const mappedStage =
      originalStage != null && String(originalStage).trim() !== ''
        ? normalizeStageToAida(originalStage)
        : null
    const hasEng =
      (lead.engagementStage != null && String(lead.engagementStage).trim() !== '') ||
      (lead.status != null && String(lead.status).trim() !== '')
    const engagementStageVal = hasEng
      ? normalizeLifecycleStage(lead.engagementStage ?? lead.status)
      : null

    return {
      id: String(lead.id),
      type: 'lead',
      itemType: 'New Lead',
      name: lead.name || lead.company || 'Unnamed Lead',
      stage: mappedStage,
      aidaStatus: mappedStage,
      status: engagementStageVal,
      engagementStage: engagementStageVal,
      isStarred: resolveStarredState(lead),
      value: Number(lead.value) || 0,
      industry: lead.industry,
      company: lead.company,
      createdDate: lead.createdAt || new Date().toISOString(),
      raw: lead
    }
  })

  const siteItems: PipelineItem[] = []

  leads.forEach((lead) => {
    entitySites(lead).forEach((site, idx) => {
      if (!site || typeof site !== 'object') return
      if (site.siteType === 'client') return
      const siteAida = site.aidaStatus ?? site.stage ?? lead.aidaStatus ?? lead.stage
      const mappedStage = normalizeStageToAida(siteAida)
      const siteEngagement = normalizeLifecycleStage(
        site.engagementStage ?? site.stage ?? lead.engagementStage ?? lead.status
      )
      const siteId = site.id || `site-${lead.id}-${idx}`
      const leadName = lead.name || lead.company || 'Lead'
      const siteName = site.name || site.siteName || 'Unnamed site'
      siteItems.push({
        id: `lead-${lead.id}-site-${siteId}`,
        type: 'site',
        itemType: 'Site',
        name: `${leadName} · ${siteName}`,
        stage: mappedStage,
        aidaStatus: mappedStage,
        status: siteEngagement,
        engagementStage: siteEngagement,
        isStarred: resolveStarredState(lead),
        value: 0,
        industry: lead.industry || 'Other',
        leadId: lead.id,
        lead,
        site,
        siteId: site.id || null,
        siteIndex: idx,
        createdDate: site.createdAt || lead.createdAt || new Date().toISOString(),
        raw: { site, lead }
      })
    })
  })

  clients.forEach((client) => {
    entitySites(client).forEach((site, idx) => {
      if (!site || typeof site !== 'object') return
      if (site.siteType === 'client') return
      const siteAida = site.aidaStatus ?? site.stage ?? 'Awareness'
      const mappedStage = normalizeStageToAida(siteAida)
      const siteEngagement = normalizeLifecycleStage(site.engagementStage ?? site.stage ?? 'Potential')
      const siteId = site.id || `site-${client.id}-${idx}`
      const clientName = client.name || 'Client'
      const siteName = site.name || site.siteName || 'Unnamed site'
      siteItems.push({
        id: `client-${client.id}-site-${siteId}`,
        type: 'site',
        itemType: 'Site',
        name: `${clientName} · ${siteName}`,
        stage: mappedStage,
        aidaStatus: mappedStage,
        status: siteEngagement,
        engagementStage: siteEngagement,
        isStarred: resolveStarredState(client),
        value: 0,
        industry: client.industry || 'Other',
        clientId: client.id,
        client,
        site,
        siteId: site.id || null,
        siteIndex: idx,
        createdDate: site.createdAt || client.createdAt || new Date().toISOString(),
        raw: { site, client }
      })
    })
  })

  const opportunityItems: PipelineItem[] = []
  clients.forEach((client) => {
    const opps = Array.isArray(client.opportunities) ? client.opportunities : []
    opps.forEach((opp: CrmOpportunity) => {
      if (!opp || typeof opp !== 'object') return
      const mappedStage = normalizeStageToAida(opp.aidaStatus ?? opp.stage)
      const oppEngagement = normalizeLifecycleStage(opp.engagementStage ?? opp.status)
      opportunityItems.push({
        id: String(opp.id),
        type: 'opportunity',
        itemType: 'Expansion',
        name: opp.title || opp.name || 'Untitled Opportunity',
        stage: mappedStage,
        aidaStatus: mappedStage,
        status: oppEngagement,
        engagementStage: oppEngagement,
        isStarred: Boolean(opp.isStarred),
        value: Number(opp.value) || 0,
        clientId: client.id,
        clientName: client.name || 'Unknown Client',
        industry: client.industry || 'Other',
        createdDate: opp.createdAt || new Date().toISOString(),
        raw: { ...opp, client }
      })
    })
  })

  return [...leadItems, ...siteItems, ...opportunityItems]
}

export function filterPipelineItems(items: PipelineItem[], filters: PipelineFilters): PipelineItem[] {
  let result = [...items]
  const q = filters.search.trim().toLowerCase()

  if (q) {
    result = result.filter((item) => {
      const raw = (item.raw || {}) as Record<string, unknown>
      const clientData = (raw.client || {}) as Record<string, unknown>
      const hay = [
        item.name,
        item.clientName,
        item.company,
        item.industry,
        raw.notes,
        raw.website,
        raw.address,
        clientData.notes,
        clientData.website,
        clientData.address
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  if (filters.starredOnly) {
    result = result.filter((item) => item.isStarred)
  }

  if (filters.industry && filters.industry !== 'all') {
    result = result.filter(
      (item) => String(item.industry || '').toLowerCase() === filters.industry.toLowerCase()
    )
  }

  if (filters.engagementStage && filters.engagementStage !== 'all') {
    result = result.filter((item) => {
      const normalized = normalizeLifecycleStage(item.engagementStage ?? item.status ?? 'Potential')
      return normalized === filters.engagementStage
    })
  }

  if (filters.aidaStatus && filters.aidaStatus !== 'all') {
    result = result.filter((item) => {
      const normalized = normalizeStageToAida(item.aidaStatus ?? item.stage)
      return normalized === filters.aidaStatus
    })
  }

  if (filters.type && filters.type !== 'all') {
    result = result.filter((item) => item.type === filters.type)
  }

  result.sort((a, b) => {
    const starDiff = (b.isStarred ? 1 : 0) - (a.isStarred ? 1 : 0)
    if (starDiff !== 0) return starDiff
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  })

  return result
}

export function itemsForKanban(items: PipelineItem[]): PipelineItem[] {
  return items.filter((item) => item.type !== 'lead' || !leadHasPipelineSites(item.raw as CrmLead))
}

export function buildNestedListRows(
  items: PipelineItem[],
  clients: CrmClient[],
  starredOnly: boolean
): PipelineListRow[] {
  const leads = items.filter((i) => i.type === 'lead')
  const siteItems = items.filter((i) => i.type === 'site')
  const opportunities = items.filter((i) => i.type === 'opportunity')
  const nameKey = (item: PipelineItem) => String(item.name || '').toLowerCase().trim()
  const cmp = (a: PipelineItem, b: PipelineItem) =>
    nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' })

  const leadBlocks = leads
    .slice()
    .sort(cmp)
    .map((lead) => {
      const leadRow: PipelineListRow = {
        item: lead,
        isNested: false,
        parentName: null,
        parentLabel: null
      }
      const leadSites = siteItems
        .filter((s) => String(s.leadId || s.lead?.id) === String(lead.id))
        .slice()
        .sort((a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }))
      const siteRows: PipelineListRow[] = leadSites.map((site) => ({
        item: site,
        isNested: true,
        parentName: lead.name || 'Lead',
        parentLabel: 'Lead'
      }))
      return [leadRow, ...siteRows]
    })

  const clientSites = siteItems.filter((s) => s.clientId && !s.leadId)
  const clientIdsFromSites = new Set(clientSites.map((s) => s.clientId).filter(Boolean))
  const clientIdsFromOpps = new Set(opportunities.map((o) => o.clientId).filter(Boolean))
  const allClientIds = [...new Set([...clientIdsFromSites, ...clientIdsFromOpps])]

  let clientBlocks = allClientIds.map((clientId) => {
    const sites = clientSites.filter((s) => String(s.clientId) === String(clientId))
    const clientOpps = opportunities
      .filter((o) => String(o.clientId) === String(clientId))
      .slice()
      .sort((a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }))
    const firstSite = sites[0]
    const firstOpp = clientOpps[0]
    const client =
      firstSite?.client ||
      (firstOpp?.raw as { client?: CrmClient })?.client ||
      clients.find((c) => String(c.id) === String(clientId)) ||
      ({ id: clientId, name: firstOpp?.clientName || 'Client' } as CrmClient)
    const parentName = client.name || 'Client'
    const clientRowItem: PipelineItem = {
      type: 'client',
      id: String(clientId),
      name: parentName,
      itemType: 'Client',
      stage: normalizeStageToAida(client.aidaStatus ?? client.stage),
      aidaStatus: normalizeStageToAida(client.aidaStatus ?? client.stage),
      status: normalizeLifecycleStage(client.engagementStage ?? client.status ?? 'Potential'),
      engagementStage: normalizeLifecycleStage(client.engagementStage ?? client.status ?? 'Potential'),
      isStarred: resolveStarredState(client),
      value: 0,
      client
    }
    const clientRow: PipelineListRow = {
      item: clientRowItem,
      isNested: false,
      parentName: null,
      parentLabel: null
    }
    const siteRows: PipelineListRow[] = sites
      .slice()
      .sort((a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }))
      .map((site) => ({
        item: site,
        isNested: true,
        parentName,
        parentLabel: 'Client'
      }))
    const oppRows: PipelineListRow[] = clientOpps.map((opp) => ({
      item: opp,
      isNested: true,
      parentName,
      parentLabel: 'Client'
    }))
    return [clientRow, ...siteRows, ...oppRows]
  })

  if (starredOnly && clients.length) {
    const alreadyInBlocks = new Set(allClientIds.map((id) => String(id)))
    clients
      .filter((c) => resolveStarredState(c))
      .forEach((client) => {
        if (alreadyInBlocks.has(String(client.id))) return
        const clientRowItem: PipelineItem = {
          type: 'client',
          id: String(client.id),
          name: client.name || 'Client',
          itemType: 'Client',
          stage: normalizeStageToAida(client.aidaStatus ?? client.stage),
          aidaStatus: normalizeStageToAida(client.aidaStatus ?? client.stage),
          status: normalizeLifecycleStage(client.engagementStage ?? client.status ?? 'Potential'),
          engagementStage: normalizeLifecycleStage(client.engagementStage ?? client.status ?? 'Potential'),
          isStarred: true,
          value: 0,
          client
        }
        clientBlocks.push([
          { item: clientRowItem, isNested: false, parentName: null, parentLabel: null }
        ])
      })
  }

  clientBlocks.sort((a, b) => cmp(a[0].item, b[0].item))
  const allBlocks = [...leadBlocks, ...clientBlocks]
  allBlocks.sort((a, b) => cmp(a[0].item, b[0].item))
  return allBlocks.flat()
}

export function uniquePipelineIndustries(items: PipelineItem[]) {
  const set = new Set<string>()
  for (const item of items) {
    const ind = String(item.industry || '').trim()
    if (ind) set.add(ind)
  }
  return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
}

export function pipelineMetrics(items: PipelineItem[]) {
  const totalValue = items.reduce((sum, item) => sum + (item.value || 0), 0)
  const byAida = AIDA_STAGES.map((stage) => ({
    stage,
    count: items.filter((i) => normalizeStageToAida(i.aidaStatus ?? i.stage) === stage).length
  }))
  return { totalValue, totalCount: items.length, byAida }
}

export { AIDA_STAGES, ENGAGEMENT_STAGES }
