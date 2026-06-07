import { API_BASE_URL } from '../config'
import { createSyncEngine } from '../../../src/jobCardWizard/syncEngine.js'
import { fetchWithTokenRefresh } from '../services/apiClient'
import { getOfflineStore } from './offlineStore'

export function createMobileSyncEngine(getToken: () => string | null, isOnline: () => boolean) {
  const authedFetch: typeof fetch = (url, options = {}) => {
    const token = getToken()
    return fetchWithTokenRefresh(String(url), { ...options, token })
  }

  return createSyncEngine({
    apiBase: API_BASE_URL,
    getToken,
    isOnline,
    fetchRetryConfig: { fetchFn: authedFetch },
    removeLocalPending: async (id) => {
      const offlineStore = await getOfflineStore()
      return offlineStore.removeLocalPendingJobCardAsync(id)
    },
    rememberPriorId: async (id) => {
      const offlineStore = await getOfflineStore()
      return offlineStore.rememberPublicPriorJobCardId(id)
    },
    flushActivity: async (serverId, events) => {
      const token = getToken()
      if (!token) return
      await fetchWithTokenRefresh(
        `${API_BASE_URL}/api/jobcards/${encodeURIComponent(serverId)}/activity/sync`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: events.map((e: { action: string; metadata?: unknown; source?: string }) => ({
              action: e.action,
              metadata: e.metadata,
              source: e.source || 'mobile'
            }))
          }),
          token
        }
      )
    }
  })
}
