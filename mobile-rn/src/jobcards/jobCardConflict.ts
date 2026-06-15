import { Alert } from 'react-native'
import { cacheJobCard } from './jobCardCache'
import { getOfflineStore } from './offlineStore'

export type JobCardSyncConflictResult = {
  ok: false
  serverId: string | null
  conflict?: boolean
  serverJobCard?: Record<string, unknown>
  errorText?: string
}

export type JobCardConflictChoice = 'keep_mine' | 'use_server' | 'cancel'

export function isJobCardSyncConflict(
  result: { ok: boolean; conflict?: boolean }
): result is JobCardSyncConflictResult {
  return !result.ok && Boolean((result as JobCardSyncConflictResult).conflict)
}

export function promptJobCardConflictChoice(): Promise<JobCardConflictChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      'Sync conflict',
      'This job card was changed on the server after you opened it on this device. Which copy should we keep?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Use server copy', onPress: () => resolve('use_server') },
        { text: 'Keep my changes', onPress: () => resolve('keep_mine') }
      ]
    )
  })
}

export async function resolveJobCardConflict(
  localCard: Record<string, unknown>,
  serverJobCard: Record<string, unknown> | undefined,
  choice: JobCardConflictChoice
): Promise<Record<string, unknown> | null> {
  const localId = String(localCard.id || '')
  if (!localId || choice === 'cancel') return null

  const offlineStore = await getOfflineStore()

  if (choice === 'use_server' && serverJobCard) {
    await offlineStore.removeLocalPendingJobCardAsync(localId)
    void cacheJobCard(serverJobCard)
    return null
  }

  if (choice === 'keep_mine') {
    const next = {
      ...localCard,
      forceOverwrite: true,
      syncConflict: false
    }
    await offlineStore.upsertLocalPendingJobCardAsync({ ...next, synced: false })
    return next
  }

  return null
}
