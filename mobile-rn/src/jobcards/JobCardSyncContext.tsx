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
import { offlineStore, migrateLegacyOfflineQueue } from './offlineStore'
import { createMobileSyncEngine } from './sync'

type SyncEngine = ReturnType<typeof createMobileSyncEngine>

type SyncOneResult = Awaited<ReturnType<SyncEngine['syncOneLocalPendingJobCardToServer']>>

type JobCardSyncContextValue = {
  unsyncedCount: number
  pendingAutoSync: boolean
  refreshUnsyncedCount: () => Promise<void>
  bumpLocalDrafts: () => void
  runSyncNow: () => Promise<{ synced: number; failed: number }>
  syncOnePendingCard: (card: Record<string, unknown>) => Promise<SyncOneResult>
}

const JobCardSyncContext = createContext<JobCardSyncContextValue | undefined>(undefined)

export function JobCardSyncProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [unsyncedCount, setUnsyncedCount] = useState(0)
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

  const syncEngineRef = useRef<SyncEngine>(
    createMobileSyncEngine(
      () => accessTokenRef.current,
      () => isOnlineRef.current
    )
  )

  const refreshUnsyncedCount = useCallback(async () => {
    const list = await offlineStore.listUnsyncedLocalPendingJobCardsAsync()
    setUnsyncedCount(list.length)
  }, [])

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
      const result = await withSyncLock(() =>
        syncEngineRef.current.syncOneLocalPendingJobCardToServer(card as never)
      )
      if (result === null) {
        return { ok: false, serverId: null, errorText: 'Sync already in progress' }
      }
      await refreshUnsyncedCount()
      if (result.ok) bumpLocalDrafts()
      return result
    },
    [withSyncLock, refreshUnsyncedCount, bumpLocalDrafts]
  )

  const runAutoSyncPendingJobCards = useCallback(async () => {
    if (!accessTokenRef.current || !isOnlineRef.current) return { synced: 0, failed: 0 }

    const pending = await offlineStore.listUnsyncedLocalPendingJobCardsAsync()
    if (!pending.length) return { synced: 0, failed: 0 }

    const result = await withSyncLock(async () => {
      const batch = await syncEngineRef.current.runAutoSyncPendingJobCards(pending)
      await refreshUnsyncedCount()
      return batch
    })
    if (!result) return { synced: 0, failed: 0 }
    if (result.synced > 0) bumpLocalDrafts()
    return result
  }, [withSyncLock, refreshUnsyncedCount, bumpLocalDrafts])

  useEffect(() => {
    migrateLegacyOfflineQueue().then(() => refreshUnsyncedCount())
  }, [refreshUnsyncedCount])

  useEffect(() => {
    if (!isOnline || !accessToken) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      void (async () => {
        const pending = await offlineStore.listUnsyncedLocalPendingJobCardsAsync()
        if (!pending.length || cancelled) return
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
      pendingAutoSync,
      refreshUnsyncedCount,
      bumpLocalDrafts,
      runSyncNow: runAutoSyncPendingJobCards,
      syncOnePendingCard
    }),
    [
      unsyncedCount,
      pendingAutoSync,
      refreshUnsyncedCount,
      bumpLocalDrafts,
      runAutoSyncPendingJobCards,
      syncOnePendingCard
    ]
  )

  return <JobCardSyncContext.Provider value={value}>{children}</JobCardSyncContext.Provider>
}

export function useJobCardSync() {
  const ctx = useContext(JobCardSyncContext)
  if (!ctx) throw new Error('useJobCardSync must be used within JobCardSyncProvider')
  return ctx
}
