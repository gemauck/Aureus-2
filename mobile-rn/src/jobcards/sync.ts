import { API_BASE_URL } from '../config'
import { createSyncEngine } from '../../../src/jobCardWizard/syncEngine.js'
import { offlineStore } from './offlineStore'

export function createMobileSyncEngine(getToken: () => string | null, isOnline: () => boolean) {
  return createSyncEngine({
    apiBase: API_BASE_URL,
    getToken,
    isOnline,
    removeLocalPending: (id) => {
      void offlineStore.removeLocalPendingJobCardAsync(id)
    },
    rememberPriorId: (id) => offlineStore.rememberPublicPriorJobCardId(id),
    flushActivity: async (serverId, events) => {
      const token = getToken()
      if (!token) return
      await fetch(`${API_BASE_URL}/api/jobcards/${encodeURIComponent(serverId)}/activity/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          events: events.map((e: { action: string; metadata?: unknown; source?: string }) => ({
            action: e.action,
            metadata: e.metadata,
            source: e.source || 'mobile'
          }))
        })
      })
    }
  })
}
