import {
  JOB_CARD_LOCAL_PENDING_KEY,
  MAX_LOCAL_PENDING_JOB_CARDS,
  JOB_CARD_PUBLIC_PRIOR_IDS_KEY,
  MAX_PUBLIC_PRIOR_IDS
} from './constants.js';

/**
 * @typedef {{ getItem: (key: string) => Promise<string|null>|string|null, setItem: (key: string, value: string) => Promise<void>|void, removeItem?: (key: string) => Promise<void>|void }} StorageBackend
 */

export function createOfflineStore(storage) {
  function readLocalPendingJobCards() {
    try {
      const raw = storage.getItem(JOB_CARD_LOCAL_PENDING_KEY);
      const resolved = raw && typeof raw.then === 'function' ? null : raw;
      if (resolved != null) {
        const arr = JSON.parse(resolved || '[]');
        return Array.isArray(arr) ? arr : [];
      }
    } catch {
      /* sync read failed */
    }
    return [];
  }

  async function readLocalPendingJobCardsAsync() {
    try {
      const raw = await storage.getItem(JOB_CARD_LOCAL_PENDING_KEY);
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeLocalPendingJobCards(cards) {
    try {
      storage.setItem(
        JOB_CARD_LOCAL_PENDING_KEY,
        JSON.stringify(cards.slice(0, MAX_LOCAL_PENDING_JOB_CARDS))
      );
    } catch (e) {
      console.warn('jobCardWizard: could not persist local job cards', e);
    }
  }

  async function writeLocalPendingJobCardsAsync(cards) {
    try {
      await storage.setItem(
        JOB_CARD_LOCAL_PENDING_KEY,
        JSON.stringify(cards.slice(0, MAX_LOCAL_PENDING_JOB_CARDS))
      );
    } catch (e) {
      console.warn('jobCardWizard: could not persist local job cards', e);
    }
  }

  function upsertLocalPendingJobCard(card) {
    if (!card || card.id == null) return;
    const list = readLocalPendingJobCards();
    const id = String(card.id);
    const next = [{ ...card, synced: false }, ...list.filter((c) => c && String(c.id) !== id)].slice(
      0,
      MAX_LOCAL_PENDING_JOB_CARDS
    );
    writeLocalPendingJobCards(next);
  }

  async function upsertLocalPendingJobCardAsync(card) {
    if (!card || card.id == null) return;
    const list = await readLocalPendingJobCardsAsync();
    const id = String(card.id);
    const next = [{ ...card, synced: false }, ...list.filter((c) => c && String(c.id) !== id)].slice(
      0,
      MAX_LOCAL_PENDING_JOB_CARDS
    );
    await writeLocalPendingJobCardsAsync(next);
  }

  function removeLocalPendingJobCard(id) {
    if (id == null) return;
    const sid = String(id);
    writeLocalPendingJobCards(
      readLocalPendingJobCards().filter((c) => c && String(c.id) !== sid)
    );
  }

  async function removeLocalPendingJobCardAsync(id) {
    if (id == null) return;
    const sid = String(id);
    const list = await readLocalPendingJobCardsAsync();
    await writeLocalPendingJobCardsAsync(list.filter((c) => c && String(c.id) !== sid));
  }

  function listUnsyncedLocalPendingJobCards() {
    return readLocalPendingJobCards().filter((j) => j && j.synced === false);
  }

  async function listUnsyncedLocalPendingJobCardsAsync() {
    const list = await readLocalPendingJobCardsAsync();
    return list.filter((j) => j && j.synced === false);
  }

  function readPublicPriorJobCardIds() {
    try {
      const raw = storage.getItem(JOB_CARD_PUBLIC_PRIOR_IDS_KEY);
      const resolved = raw && typeof raw.then === 'function' ? null : raw;
      if (resolved == null && raw && typeof raw.then === 'function') return [];
      const arr = JSON.parse(resolved || '[]');
      return Array.isArray(arr)
        ? arr.filter((id) => typeof id === 'string' && id.length > 0).slice(0, MAX_PUBLIC_PRIOR_IDS)
        : [];
    } catch {
      return [];
    }
  }

  function rememberPublicPriorJobCardId(id) {
    if (!id || typeof id !== 'string') return;
    try {
      const existing = readPublicPriorJobCardIds();
      const next = [id, ...existing.filter((x) => x !== id)].slice(0, MAX_PUBLIC_PRIOR_IDS);
      storage.setItem(JOB_CARD_PUBLIC_PRIOR_IDS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return {
    readLocalPendingJobCards,
    readLocalPendingJobCardsAsync,
    writeLocalPendingJobCards,
    writeLocalPendingJobCardsAsync,
    upsertLocalPendingJobCard,
    upsertLocalPendingJobCardAsync,
    removeLocalPendingJobCard,
    removeLocalPendingJobCardAsync,
    listUnsyncedLocalPendingJobCards,
    listUnsyncedLocalPendingJobCardsAsync,
    readPublicPriorJobCardIds,
    rememberPublicPriorJobCardId
  };
}

/** Browser localStorage adapter (sync getItem). */
export function createBrowserOfflineStore() {
  return createOfflineStore({
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('jobCardWizard: localStorage setItem failed', e);
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  });
}

export { JOB_CARD_LOCAL_PENDING_KEY };
