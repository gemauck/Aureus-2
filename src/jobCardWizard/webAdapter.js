import { createBrowserOfflineStore, createSyncEngine } from './index.js';

let _offline;
export function getWebOfflineStore() {
  if (!_offline) _offline = createBrowserOfflineStore();
  return _offline;
}

export function createWebSyncEngine(getToken, isOnline) {
  const offline = getWebOfflineStore();
  return createSyncEngine({
    getToken,
    isOnline,
    removeLocalPending: (id) => offline.removeLocalPendingJobCard(id),
    rememberPriorId: (id) => offline.rememberPublicPriorJobCardId(id),
    onSaved(id) {
      if (typeof window !== 'undefined' && id) {
        try {
          window.dispatchEvent(new CustomEvent('jobcards:saved', { detail: { id } }));
        } catch {
          /* non-fatal */
        }
      }
    }
  });
}
