import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { REFERENCE_CACHE_KEYS } from '../../../../src/jobCardWizard/index.js'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import type { ClientOption, InventoryItem, ProjectOption, ServiceFormTemplate, StockLocation, UserOption } from '../types'

function activeTechnicianUsers(list: UserOption[]) {
  return list.filter((x) => {
    const status = (x.status || 'active').toLowerCase()
    return status !== 'inactive' && status !== 'suspended'
  })
}

export function useWizardReferenceData(accessToken: string | null) {
  const { isOnline } = useNetwork()
  const [loading, setLoading] = useState(true)
  const [referenceRefreshing, setReferenceRefreshing] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const inventoryLoadedRef = useRef(false)
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([])
  const [formTemplates, setFormTemplates] = useState<ServiceFormTemplate[]>([])

  const loadReferenceData = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const silent = Boolean(opts.silent)
      if (!silent) setLoading(true)
      else setReferenceRefreshing(true)

      try {
        const [cachedClientsRaw, cachedProjectsRaw, cachedUsersRaw] = await Promise.all([
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.clients),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.projects),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.users)
        ])
        const cachedClients = JSON.parse(cachedClientsRaw || '[]')
        if (Array.isArray(cachedClients) && cachedClients.length) setClients(cachedClients)
        const cachedUsers = JSON.parse(cachedUsersRaw || '[]')
        if (Array.isArray(cachedUsers) && cachedUsers.length) {
          setUsers(activeTechnicianUsers(cachedUsers))
        }
        const cachedProjects = JSON.parse(cachedProjectsRaw || '[]')
        if (Array.isArray(cachedProjects) && cachedProjects.length) {
          setProjects(
            cachedProjects.map(
              (p: { id: string; name?: string; clientId?: string; clientName?: string; status?: string }) => ({
                id: String(p.id),
                name: p.name || String(p.id),
                clientId: p.clientId ? String(p.clientId) : undefined,
                clientName: p.clientName,
                status: p.status
              })
            )
          )
        }

        if (!isOnline) return

        const [c, u, proj] = await Promise.all([
          jobcardsApi.loadClients(accessToken || undefined),
          jobcardsApi.getUsers(accessToken || undefined),
          accessToken ? jobcardsApi.getProjects(accessToken) : Promise.resolve([])
        ])

        if (Array.isArray(c)) {
          setClients(c)
          if (c.length) {
            await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.clients, JSON.stringify(c))
          }
        }

        const technicians = activeTechnicianUsers(Array.isArray(u) ? u : [])
        setUsers(technicians)
        if (technicians.length) {
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.users, JSON.stringify(technicians))
        }

        if (Array.isArray(proj)) {
          const normalized = proj.map((p) => ({
            id: String(p.id),
            name: p.name || String(p.id),
            clientId: p.clientId ? String(p.clientId) : undefined,
            clientName: p.clientName,
            status: p.status
          }))
          setProjects(normalized)
          if (normalized.length) {
            await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.projects, JSON.stringify(normalized))
          }
        }
      } catch {
        /* cache / network optional */
      } finally {
        if (!silent) setLoading(false)
        else setReferenceRefreshing(false)
      }
    },
    [accessToken, isOnline]
  )

  const ensureReferenceDataLoaded = useCallback(async () => {
    if (users.length && clients.length) return
    await loadReferenceData({ silent: true })
  }, [users.length, clients.length, loadReferenceData])

  const ensureInventoryLoaded = useCallback(async () => {
    if (inventoryLoadedRef.current && inventory.length) return
    setInventoryLoading(true)
    try {
      if (isOnline) {
        const inv = await jobcardsApi.getPublicInventory().catch(() => [])
        const locs = await jobcardsApi.getPublicLocations().catch(() => [])
        const tpl = await jobcardsApi.getServiceFormTemplates().catch(() => [])
        if (inv.length) {
          setInventory(inv)
          inventoryLoadedRef.current = true
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.inventory, JSON.stringify(inv))
        }
        if (locs.length) {
          setStockLocations(locs)
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.locations, JSON.stringify(locs))
        }
        if (tpl.length) {
          setFormTemplates(tpl)
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.serviceFormTemplates, JSON.stringify(tpl))
        }
      } else {
        const [invRaw, locsRaw, tplRaw] = await Promise.all([
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.inventory),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.locations),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.serviceFormTemplates)
        ])
        const inv = JSON.parse(invRaw || '[]')
        const locs = JSON.parse(locsRaw || '[]')
        const tpl = JSON.parse(tplRaw || '[]')
        if (Array.isArray(inv) && inv.length) {
          setInventory(inv)
          inventoryLoadedRef.current = true
        }
        if (Array.isArray(locs)) setStockLocations(locs)
        if (Array.isArray(tpl)) setFormTemplates(tpl)
      }
    } finally {
      setInventoryLoading(false)
    }
  }, [isOnline, inventory.length])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  return {
    loading,
    referenceRefreshing,
    clients,
    users,
    projects,
    inventory,
    inventoryLoading,
    stockLocations,
    formTemplates,
    ensureReferenceDataLoaded,
    ensureInventoryLoaded
  }
}
