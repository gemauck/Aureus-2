import AsyncStorage from '@react-native-async-storage/async-storage'
import { createOfflineStore, JOB_CARD_LOCAL_PENDING_KEY } from '../../../src/jobCardWizard/offlineStore.js'

const asyncStorageBackend = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key)
}

export const offlineStore = createOfflineStore(asyncStorageBackend)

export { JOB_CARD_LOCAL_PENDING_KEY }

const LEGACY_KEY = 'mobile_rn_pending_jobcards_v1'

/** One-time migration from old RN-only queue key. */
export async function migrateLegacyOfflineQueue() {
  try {
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
