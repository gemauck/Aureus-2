import AsyncStorage from '@react-native-async-storage/async-storage'

const asyncStorageBackend = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key)
}

type OfflineStore = ReturnType<
  typeof import('../../../src/jobCardWizard/offlineStore.js').createOfflineStore
>

let storePromise: Promise<{
  offlineStore: OfflineStore
  JOB_CARD_LOCAL_PENDING_KEY: string
}> | null = null

function loadOfflineStoreModule() {
  if (!storePromise) {
    storePromise = import('../../../src/jobCardWizard/offlineStore.js').then((mod) => ({
      offlineStore: mod.createOfflineStore(asyncStorageBackend),
      JOB_CARD_LOCAL_PENDING_KEY: mod.JOB_CARD_LOCAL_PENDING_KEY
    }))
  }
  return storePromise
}

/** Lazy init — avoids loading the shared web job-card bundle during app cold start. */
export async function getOfflineStore() {
  const { offlineStore } = await loadOfflineStoreModule()
  return offlineStore
}

export async function getJobCardLocalPendingKey() {
  const { JOB_CARD_LOCAL_PENDING_KEY } = await loadOfflineStoreModule()
  return JOB_CARD_LOCAL_PENDING_KEY
}

const LEGACY_KEY = 'mobile_rn_pending_jobcards_v1'

/** One-time migration from old RN-only queue key. */
export async function migrateLegacyOfflineQueue() {
  try {
    const offlineStore = await getOfflineStore()
    const legacyRaw = await AsyncStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return
    const legacy = JSON.parse(legacyRaw)
    if (!Array.isArray(legacy) || legacy.length === 0) {
      await AsyncStorage.removeItem(LEGACY_KEY)
      return
    }
    const current = await offlineStore.readLocalPendingJobCardsAsync()
    for (const record of legacy) {
      if (!record?.payload) continue
      const p = record.payload
      await offlineStore.upsertLocalPendingJobCardAsync({
        ...p,
        id: record.id || p.clientDraftId,
        synced: false
      })
    }
    if (current.length === 0 && legacy.length > 0) {
      /* merged above */
    }
    await AsyncStorage.removeItem(LEGACY_KEY)
  } catch {
    /* non-fatal */
  }
}
