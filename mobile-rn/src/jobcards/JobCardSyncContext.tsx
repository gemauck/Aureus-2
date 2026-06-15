import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useNetwork } from '../hooks/useNetwork'
import { useAuth } from '../state/AuthContext'
import { getOfflineStore, migrateLegacyOfflineQueue } from './offlineStore'
import {
  isJobCardSyncConflict,
  promptJobCardConflictChoice,
  resolveJobCardConflict
} from './jobCardConflict'
import { listUnsyncedPendingIncidents } from './incidents/incidentOfflineStore'
import { syncAllPendingIncidents } from './incidents/incidentSync'
import { getPendingIncident } from './incidents/incidentOfflineStore'
import { syncOnePendingIncident } from './incidents/incidentSync'
import { listPendingSubmits } from './stockTake/stockTakeOfflineStore'
import { syncAllPendingStockTakeSubmits, syncOnePendingStockTakeSubmit } from './stockTake/stockTakeSync'
import { listPendingUploadItems, type PendingUploadItem } from './pendingUploads'

type SyncEngine = Awaited<ReturnType<typeof getSyncEngine>>

type SyncOneResult = Awaited<ReturnType<SyncEngine['syncOneLocalPendingJobCardToServer']>>

type RetryResult = { ok: boolean; errorText?: string }

type JobCardSyncContextValue = {
  unsyncedCount: number
  pendingUploads: PendingUploadItem[]
  pendingAutoSync: boolean
  refreshUnsyncedCount: () => Promise<void>
  refreshPendingUploads: () => Promise<void>
  bumpLocalDrafts: () => void
  runSyncNow: () => Promise<{ synced: number; failed: number }>
  syncOnePendingCard: (card: Record<string, unknown>) => Promise<SyncOneResult>
  retryPendingUpload: (item: PendingUploadItem) => Promise<RetryResult>
}

const JobCardSyncContext = createContext<JobCardSyncContextValue | undefined>(undefined)

async function getSyncEngine(
  getToken: () => string | null,
  isOnline: () => boolean
) {
  const { createMobileSyncEngine } = await import('./sync')
  return createMobileSyncEngine(getToken, isOnline)
}

export function JobCardSyncProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([])
  const [pendingAutoSync, setPendingAutoSync] = useState(false)
  const [localDraftsTick, setLocalDraftsTick] = useState(0)
  const syncInFlightRef = useRef(false)
  const accessTokenRef = useRef(accessToken)
  const isOnlineRef = useRef(isOnline)

  useEffect(() => {
    accessTokenRef.current = accessToken
  }, [accessToken])

  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  const syncEngineRef = useRef<SyncEngine | null>(null)

  const ensureSyncEngine = useCallback(async () => {
    if (!syncEngineRef.current) {
      syncEngineRef.current = await getSyncEngine(
        () => accessTokenRef.current,
        () => isOnlineRef.current
      )
    }
    return syncEngineRef.current
  }, [])

  const refreshPendingUploads = useCallback(async () => {
    const items = await listPendingUploadItems()
    setPendingUploads(items)
    setUnsyncedCount(items.length)
  }, [])

  const refreshUnsyncedCount = useCallback(async () => {
    await refreshPendingUploads()
  }, [refreshPendingUploads])

  const bumpLocalDrafts = useCallback(() => {
    setLocalDraftsTick((t) => t + 1)
  }, [])

  const withSyncLock = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (syncInFlightRef.current) return null
      syncInFlightRef.current = true
      setPendingAutoSync(true)
      try {
        return await fn()
      } finally {
        syncInFlightRef.current = false
        setPendingAutoSync(false)
      }
    },
    []
  )

  const syncOnePendingCard = useCallback(
    async (card: Record<string, unknown>): Promise<SyncOneResult> => {
      if (!accessTokenRef.current || !isOnlineRef.current) {
        return { ok: false, serverId: null, errorText: 'Offline' }
      }
      const engine = await ensureSyncEngine()
      const result = await withSyncLock(() =>
        engine.syncOneLocalPendingJobCardToServer(card as never)
      )
      if (result === null) {
        return { ok: false, serverId: null, errorText: 'Sync already in progress' }
      }
      if (isJobCardSyncConflict(result)) {
        const offlineStore = await getOfflineStore()
        await offlineStore.upsertLocalPendingJobCardAsync({
          ...card,
          synced: false,
          syncConflict: true
        })
      }
      await refreshUnsyncedCount()
      if (result.ok) bumpLocalDrafts()
      return result
    },
    [withSyncLock, refreshUnsyncedCount, bumpLocalDrafts, ensureSyncEngine]
  )

  const retryPendingUpload = useCallback(
    async (item: PendingUploadItem): Promise<RetryResult> => {
      if (!accessTokenRef.current || !isOnlineRef.current) {
        return { ok: false, errorText: 'Offline' }
      }
      const token = accessTokenRef.current
      if (item.kind === 'job_card') {
        const offlineStore = await getOfflineStore()
        const cards = await offlineStore.readLocalPendingJobCardsAsync()
        const card = cards.find((row) => row && String(row.id) === String(item.id))
        if (!card) return { ok: false, errorText: 'Job card not found on device' }
        let payload = card as Record<string, unknown>
        let result = await syncOnePendingCard(payload)
        if (isJobCardSyncConflict(result)) {
          const choice = await promptJobCardConflictChoice()
          const resolved = await resolveJobCardConflict(payload, result.serverJobCard, choice)
          if (choice === 'cancel') {
            return { ok: false, errorText: 'Sync cancelled' }
          }
          if (choice === 'use_server') {
            await refreshPendingUploads()
            bumpLocalDrafts()
            return { ok: true }
          }
          if (resolved) {
            payload = resolved
            result = await syncOnePendingCard(resolved)
          }
        }
        await refreshPendingUploads()
        return result.ok
          ? { ok: true }
          : { ok: false, errorText: result.errorText || 'Sync failed' }
      }
      if (item.kind === 'incident') {
        const pending = await getPendingIncident(item.id)
        if (!pending) return { ok: false, errorText: 'Incident not found on device' }
        const result = await withSyncLock(() => syncOnePendingIncident(token, pending))
        if (result === null) return { ok: false, errorText: 'Sync already in progress' }
        await refreshPendingUploads()
        if (result.ok) bumpLocalDrafts()
        return result.ok
          ? { ok: true }
          : { ok: false, errorText: result.errorText || 'Sync failed' }
      }
      const stockTakes = await listPendingSubmits()
      const stockTake = stockTakes.find((row) => row && String(row.id) === String(item.id))
      if (!stockTake) return { ok: false, errorText: 'Stock-take not found on device' }
      const result = await withSyncLock(() =>
        syncOnePendingStockTakeSubmit(token, stockTake, { submitForReview: true })
      )
      if (result === null) return { ok: false, errorText: 'Sync already in progress' }
      await refreshPendingUploads()
      if (result.ok) bumpLocalDrafts()
      return result.ok ? { ok: true } : { ok: false, errorText: result.errorText || 'Sync failed' }
    },
    [syncOnePendingCard, withSyncLock, refreshPendingUploads, bumpLocalDrafts]
  )

  const runAutoSyncPendingJobCards = useCallback(async () => {
    if (!accessTokenRef.current || !isOnlineRef.current) return { synced: 0, failed: 0 }

    const token = accessTokenRef.current
    const offlineStore = await getOfflineStore()
    const [pendingCards, pendingIncidents, pendingStockTakes] = await Promise.all([
      offlineStore.listUnsyncedLocalPendingJobCardsAsync(),
      listUnsyncedPendingIncidents(),
      listPendingSubmits()
    ])
    if (!pendingCards.length && !pendingIncidents.length && !pendingStockTakes.length) {
      return { synced: 0, failed: 0 }
    }

    const result = await withSyncLock(async () => {
      let synced = 0
      let failed = 0
      if (pendingCards.length) {
        const engine = await ensureSyncEngine()
        const batch = await engine.runAutoSyncPendingJobCards(pendingCards)
        synced += batch.synced
        failed += batch.failed
      }
      if (pendingIncidents.length) {
        const batch = await syncAllPendingIncidents(token, pendingIncidents)
        synced += batch.synced
        failed += batch.failed
      }
      if (pendingStockTakes.length) {
        const batch = await syncAllPendingStockTakeSubmits(token)
        synced += batch.synced
        failed += batch.failed
      }
      await refreshUnsyncedCount()
      return { synced, failed }
    })
    if (!result) {
      // Another sync (e.g. immediate save) holds the lock — retry shortly.
      setTimeout(() => bumpLocalDrafts(), 2000)
      return { synced: 0, failed: 0 }
    }
    if (result.synced > 0) bumpLocalDrafts()
    else if (result.failed > 0) {
      // Transient failures (network blip, expired token): retry after a pause.
      setTimeout(() => bumpLocalDrafts(), 8000)
    }
    return result
  }, [withSyncLock, refreshUnsyncedCount, bumpLocalDrafts, ensureSyncEngine])

  useEffect(() => {
    migrateLegacyOfflineQueue().then(() => refreshUnsyncedCount())
  }, [refreshUnsyncedCount])

  useEffect(() => {
    if (!isOnline || !accessToken) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      void (async () => {
        const offlineStore = await getOfflineStore()
        const [pendingCards, pendingIncidents, pendingStockTakes] = await Promise.all([
          offlineStore.listUnsyncedLocalPendingJobCardsAsync(),
          listUnsyncedPendingIncidents(),
          listPendingSubmits()
        ])
        if (
          (!pendingCards.length && !pendingIncidents.length && !pendingStockTakes.length) ||
          cancelled
        ) {
          return
        }
        await runAutoSyncPendingJobCards()
      })()
    }, 1200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOnline, accessToken, localDraftsTick, runAutoSyncPendingJobCards])

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active') return
      void refreshUnsyncedCount().then(() => {
        if (isOnlineRef.current && accessTokenRef.current) void runAutoSyncPendingJobCards()
      })
    }
    const sub = AppState.addEventListener('change', onAppStateChange)
    return () => sub.remove()
  }, [refreshUnsyncedCount, runAutoSyncPendingJobCards])

  const value = useMemo<JobCardSyncContextValue>(
    () => ({
      unsyncedCount,
      pendingUploads,
      pendingAutoSync,
      refreshUnsyncedCount,
      refreshPendingUploads,
      bumpLocalDrafts,
      runSyncNow: runAutoSyncPendingJobCards,
      syncOnePendingCard,
      retryPendingUpload
    }),
    [
      unsyncedCount,
      pendingUploads,
      pendingAutoSync,
      refreshUnsyncedCount,
      refreshPendingUploads,
      bumpLocalDrafts,
      runAutoSyncPendingJobCards,
      syncOnePendingCard,
      retryPendingUpload
    ]
  )

  return <JobCardSyncContext.Provider value={value}>{children}</JobCardSyncContext.Provider>
}

export function useJobCardSync() {
  const ctx = useContext(JobCardSyncContext)
  if (!ctx) throw new Error('useJobCardSync must be used within JobCardSyncProvider')
  return ctx
}
