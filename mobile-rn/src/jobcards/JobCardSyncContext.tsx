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

type JobCardSyncContextValue = {
  unsyncedCount: number
  pendingAutoSync: boolean
  refreshUnsyncedCount: () => Promise<void>
  bumpLocalDrafts: () => void
  runSyncNow: () => Promise<{ synced: number; failed: number }>
  syncEngineRef: React.MutableRefObject<SyncEngine>
}

const JobCardSyncContext = createContext<JobCardSyncContextValue | undefined>(undefined)

export function JobCardSyncProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [pendingAutoSync, setPendingAutoSync] = useState(false)
  const [localDraftsTick, setLocalDraftsTick] = useState(0)
  const inFlightRef = useRef(false)

  const syncEngineRef = useRef<SyncEngine>(
    createMobileSyncEngine(
      () => accessToken,
      () => isOnline
    )
  )

  useEffect(() => {
    syncEngineRef.current = createMobileSyncEngine(
      () => accessToken,
      () => isOnline
    )
  }, [accessToken, isOnline])

  const refreshUnsyncedCount = useCallback(async () => {
    const list = await offlineStore.listUnsyncedLocalPendingJobCardsAsync()
    setUnsyncedCount(list.length)
  }, [])

  const bumpLocalDrafts = useCallback(() => {
    setLocalDraftsTick((t) => t + 1)
  }, [])

  const runAutoSyncPendingJobCards = useCallback(async () => {
    if (inFlightRef.current) return { synced: 0, failed: 0 }
    if (!accessToken || !isOnline) return { synced: 0, failed: 0 }

    const pending = await offlineStore.listUnsyncedLocalPendingJobCardsAsync()
    if (!pending.length) return { synced: 0, failed: 0 }

    inFlightRef.current = true
    setPendingAutoSync(true)
    try {
      const result = await syncEngineRef.current.runAutoSyncPendingJobCards(pending)
      await refreshUnsyncedCount()
      if (result.synced > 0) setLocalDraftsTick((t) => t + 1)
      return result
    } finally {
      inFlightRef.current = false
      setPendingAutoSync(false)
    }
  }, [accessToken, isOnline, refreshUnsyncedCount])

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
        if (isOnline && accessToken) void runAutoSyncPendingJobCards()
      })
    }
    const sub = AppState.addEventListener('change', onAppStateChange)
    return () => sub.remove()
  }, [isOnline, accessToken, refreshUnsyncedCount, runAutoSyncPendingJobCards])

  const value = useMemo<JobCardSyncContextValue>(
    () => ({
      unsyncedCount,
      pendingAutoSync,
      refreshUnsyncedCount,
      bumpLocalDrafts,
      runSyncNow: runAutoSyncPendingJobCards,
      syncEngineRef
    }),
    [
      unsyncedCount,
      pendingAutoSync,
      refreshUnsyncedCount,
      bumpLocalDrafts,
      runAutoSyncPendingJobCards
    ]
  )

  return <JobCardSyncContext.Provider value={value}>{children}</JobCardSyncContext.Provider>
}

export function useJobCardSync() {
  const ctx = useContext(JobCardSyncContext)
  if (!ctx) throw new Error('useJobCardSync must be used within JobCardSyncProvider')
  return ctx
}
