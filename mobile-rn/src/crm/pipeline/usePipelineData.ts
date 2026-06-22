import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { crmApi } from '../api'
import { ApiRequestError } from '../../services/apiClient'
import type { CrmClient, CrmLead, CrmOpportunity } from '../types'
import { filterClientsList, normalizeEntity } from '../utils'
import {
  buildNestedListRows,
  buildPipelineItems,
  filterPipelineItems,
  itemsForKanban,
  pipelineMetrics,
  uniquePipelineIndustries
} from './utils'
import type { PipelineFilters, PipelineItem, PipelineKanbanGroupBy, PipelineViewMode } from './types'

const DEFAULT_FILTERS: PipelineFilters = {
  search: '',
  industry: 'all',
  engagementStage: 'all',
  aidaStatus: 'all',
  type: 'all',
  starredOnly: false
}

export function usePipelineData(accessToken: string | null | undefined, active: boolean) {
  const [clients, setClients] = useState<CrmClient[]>([])
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS)
  const [viewMode, setViewMode] = useState<PipelineViewMode>('list')
  const [kanbanGroupBy, setKanbanGroupBy] = useState<PipelineKanbanGroupBy>('aidaStatus')
  const opportunitiesLoadedRef = useRef(false)

  const attachOpportunities = useCallback((baseClients: CrmClient[], opps: CrmOpportunity[]) => {
    const byClient: Record<string, CrmOpportunity[]> = {}
    for (const opp of opps) {
      const clientId = opp.clientId || (opp as { client?: { id?: string } }).client?.id
      if (!clientId) continue
      if (!byClient[clientId]) byClient[clientId] = []
      byClient[clientId].push(opp)
    }
    return baseClients.map((client) => ({
      ...client,
      opportunities: byClient[client.id] || []
    }))
  }, [])

  const load = useCallback(
    async (silent = false, reloadOpportunities = false) => {
      if (!accessToken) {
        setError('Please sign in again.')
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setError('')
      try {
        const [rawClients, rawLeads] = await Promise.all([
          crmApi.listClients(accessToken),
          crmApi.listLeads(accessToken)
        ])
        let nextClients = filterClientsList(rawClients.map(normalizeEntity))
        const nextLeads = rawLeads.map(normalizeEntity)

        if (active && (reloadOpportunities || !opportunitiesLoadedRef.current)) {
          try {
            const opps = await crmApi.listOpportunities(accessToken)
            nextClients = attachOpportunities(nextClients, opps)
            opportunitiesLoadedRef.current = true
          } catch {
            // Keep clients without opportunities if bulk fetch fails
          }
        }

        setClients(nextClients)
        setLeads(nextLeads)
      } catch (e) {
        if (e instanceof ApiRequestError && e.statusCode === 429) {
          setError('Too many requests. Wait a moment, then pull down to refresh.')
        } else {
          setError(e instanceof Error ? e.message : 'Could not load pipeline data')
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, active, attachOpportunities]
  )

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  const allItems = useMemo(() => buildPipelineItems(clients, leads), [clients, leads])
  const filteredItems = useMemo(() => filterPipelineItems(allItems, filters), [allItems, filters])
  const listRows = useMemo(
    () => buildNestedListRows(filteredItems, clients, filters.starredOnly),
    [filteredItems, clients, filters.starredOnly]
  )
  const kanbanItems = useMemo(() => itemsForKanban(filteredItems), [filteredItems])
  const industries = useMemo(() => uniquePipelineIndustries(allItems), [allItems])
  const metrics = useMemo(() => pipelineMetrics(filteredItems), [filteredItems])

  const updateLocalLead = useCallback((leadId: string, patch: Partial<CrmLead>) => {
    setLeads((prev) =>
      prev.map((lead) => (String(lead.id) === String(leadId) ? { ...lead, ...patch } : lead))
    )
  }, [])

  const updateLocalOpportunity = useCallback(
    (clientId: string, opportunityId: string, patch: Partial<CrmOpportunity>) => {
      setClients((prev) =>
        prev.map((client) => {
          if (String(client.id) !== String(clientId)) return client
          const opps = (client.opportunities || []).map((opp) =>
            String(opp.id) === String(opportunityId) ? { ...opp, ...patch } : opp
          )
          return { ...client, opportunities: opps }
        })
      )
    },
    []
  )

  const updateLocalSiteOnParent = useCallback(
    (
      parentKind: 'lead' | 'client',
      parentId: string,
      siteIndex: number,
      patch: Record<string, unknown>
    ) => {
      const apply = <T extends CrmClient | CrmLead>(entity: T): T => {
        const sites = [...(entity.sites || entity.clientSites || [])]
        if (siteIndex < 0 || siteIndex >= sites.length) return entity
        sites[siteIndex] = { ...sites[siteIndex], ...patch }
        return { ...entity, sites, clientSites: sites }
      }
      if (parentKind === 'lead') {
        setLeads((prev) =>
          prev.map((lead) => (String(lead.id) === String(parentId) ? apply(lead) : lead))
        )
      } else {
        setClients((prev) =>
          prev.map((client) => (String(client.id) === String(parentId) ? apply(client) : client))
        )
      }
    },
    []
  )

  const saveAidaStage = useCallback(
    async (item: PipelineItem, newStage: string | null) => {
      if (!accessToken) throw new Error('Please sign in again.')
      const normalized = newStage && newStage.trim() ? newStage.trim() : null
      try {
        if (item.type === 'lead') {
          updateLocalLead(item.id, {
            aidaStatus: normalized ?? undefined,
            stage: normalized ?? undefined
          })
          await crmApi.patchLead(accessToken, item.id, { aidaStatus: normalized })
        } else if (item.type === 'site') {
          const parentLeadId = item.leadId ?? item.lead?.id
          const parentClientId = item.clientId
          const siteIndex = item.siteIndex ?? -1
          if (parentLeadId != null && siteIndex >= 0) {
            updateLocalSiteOnParent('lead', String(parentLeadId), siteIndex, { aidaStatus: normalized })
            const lead = leads.find((l) => String(l.id) === String(parentLeadId))
            if (lead && item.siteId) {
              await crmApi.patchSite(accessToken, String(parentLeadId), String(item.siteId), {
                aidaStatus: normalized,
                engagementStage: item.engagementStage ?? item.status ?? 'Potential'
              })
            } else if (lead) {
              const sites = [...(lead.sites || lead.clientSites || [])]
              if (siteIndex >= 0 && siteIndex < sites.length) {
                sites[siteIndex] = { ...sites[siteIndex], aidaStatus: normalized }
                await crmApi.patchLead(accessToken, String(parentLeadId), { sites })
              }
            }
          } else if (parentClientId && siteIndex >= 0) {
            updateLocalSiteOnParent('client', String(parentClientId), siteIndex, { aidaStatus: normalized })
            if (item.siteId) {
              await crmApi.patchSite(accessToken, String(parentClientId), String(item.siteId), {
                aidaStatus: normalized,
                engagementStage: item.engagementStage ?? item.status ?? 'Potential'
              })
            } else {
              const client = clients.find((c) => String(c.id) === String(parentClientId))
              const sites = [...(client?.sites || client?.clientSites || [])]
              if (client && siteIndex >= 0 && siteIndex < sites.length) {
                sites[siteIndex] = { ...sites[siteIndex], aidaStatus: normalized }
                await crmApi.patchClient(accessToken, String(parentClientId), { sites })
              }
            }
          }
        } else if (item.type === 'opportunity' && item.clientId) {
          updateLocalOpportunity(item.clientId, item.id, {
            aidaStatus: normalized ?? undefined,
            stage: normalized ?? undefined
          })
          await crmApi.patchOpportunity(accessToken, item.id, { aidaStatus: normalized })
        }
      } catch (e) {
        await load(true, true)
        throw e
      }
    },
    [accessToken, clients, leads, load, updateLocalLead, updateLocalOpportunity, updateLocalSiteOnParent]
  )

  const saveEngagementStage = useCallback(
    async (item: PipelineItem, newStatus: string | null) => {
      if (!accessToken) throw new Error('Please sign in again.')
      const normalized = newStatus && newStatus.trim() ? newStatus.trim() : null
      try {
        if (item.type === 'lead') {
          updateLocalLead(item.id, {
            engagementStage: normalized ?? undefined,
            status: normalized ?? undefined
          })
          await crmApi.patchLead(accessToken, item.id, { engagementStage: normalized })
        } else if (item.type === 'site') {
          const parentLeadId = item.leadId ?? item.lead?.id
          const parentClientId = item.clientId
          const siteIndex = item.siteIndex ?? -1
          if (parentLeadId != null && siteIndex >= 0) {
            updateLocalSiteOnParent('lead', String(parentLeadId), siteIndex, {
              engagementStage: normalized
            })
            if (item.siteId) {
              await crmApi.patchSite(accessToken, String(parentLeadId), String(item.siteId), {
                engagementStage: normalized,
                aidaStatus: item.aidaStatus ?? item.stage ?? 'Awareness'
              })
            } else {
              const lead = leads.find((l) => String(l.id) === String(parentLeadId))
              const sites = [...(lead?.sites || lead?.clientSites || [])]
              if (lead && siteIndex >= 0 && siteIndex < sites.length) {
                sites[siteIndex] = { ...sites[siteIndex], engagementStage: normalized }
                await crmApi.patchLead(accessToken, String(parentLeadId), { sites })
              }
            }
          } else if (parentClientId && siteIndex >= 0) {
            updateLocalSiteOnParent('client', String(parentClientId), siteIndex, {
              engagementStage: normalized
            })
            if (item.siteId) {
              await crmApi.patchSite(accessToken, String(parentClientId), String(item.siteId), {
                engagementStage: normalized,
                aidaStatus: item.aidaStatus ?? item.stage ?? 'Awareness'
              })
            } else {
              const client = clients.find((c) => String(c.id) === String(parentClientId))
              const sites = [...(client?.sites || client?.clientSites || [])]
              if (client && siteIndex >= 0 && siteIndex < sites.length) {
                sites[siteIndex] = { ...sites[siteIndex], engagementStage: normalized }
                await crmApi.patchClient(accessToken, String(parentClientId), { sites })
              }
            }
          }
        } else if (item.type === 'opportunity' && item.clientId) {
          updateLocalOpportunity(item.clientId, item.id, {
            engagementStage: normalized ?? undefined,
            status: normalized ?? undefined
          })
          await crmApi.patchOpportunity(accessToken, item.id, { engagementStage: normalized })
        }
      } catch (e) {
        await load(true, true)
        throw e
      }
    },
    [accessToken, clients, leads, load, updateLocalLead, updateLocalOpportunity, updateLocalSiteOnParent]
  )

  return {
    clients,
    leads,
    loading,
    refreshing,
    error,
    filters,
    setFilters,
    viewMode,
    setViewMode,
    kanbanGroupBy,
    setKanbanGroupBy,
    filteredItems,
    listRows,
    kanbanItems,
    industries,
    metrics,
    load,
    setRefreshing,
    saveAidaStage,
    saveEngagementStage
  }
}
