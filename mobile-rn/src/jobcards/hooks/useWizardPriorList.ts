import { useCallback, useEffect, useRef, useState } from 'react'
import { buildMergedWizardJobCardRows } from '../../../../src/jobCardWizard/index.js'
import { jobcardsApi } from '../api'
import { getOfflineStore } from '../offlineStore'
import type { PriorListRow, WizardFlow } from '../types'

export function useWizardPriorList(opts: {
  accessToken: string | null
  isOnline: boolean
  wizardFlow: WizardFlow
  pendingAutoSync: boolean
}) {
  const { accessToken, isOnline, wizardFlow, pendingAutoSync } = opts
  const [priorRows, setPriorRows] = useState<PriorListRow[]>([])
  const [priorLoading, setPriorLoading] = useState(false)
  const [priorSearch, setPriorSearch] = useState('')
  const [priorClientId, setPriorClientId] = useState('')
  const priorAutoSyncRefreshRef = useRef(false)

  const refreshPriorList = useCallback(async () => {
    setPriorLoading(true)
    try {
      let serverList: PriorListRow[] = []
      if (accessToken && isOnline) {
        const res = await jobcardsApi.list(accessToken, {
          search: priorSearch || undefined,
          clientId: priorClientId || undefined
        })
        serverList = res.jobCards || []
      }
      const offlineStore = await getOfflineStore()
      const local = await offlineStore.readLocalPendingJobCardsAsync()
      setPriorRows(buildMergedWizardJobCardRows(serverList, local, Boolean(accessToken)))
    } catch {
      const offlineStore = await getOfflineStore()
      const local = await offlineStore.readLocalPendingJobCardsAsync()
      setPriorRows(buildMergedWizardJobCardRows([], local, Boolean(accessToken)))
    } finally {
      setPriorLoading(false)
    }
  }, [accessToken, isOnline, priorSearch, priorClientId])

  useEffect(() => {
    if (pendingAutoSync) {
      priorAutoSyncRefreshRef.current = true
      return
    }
    if (priorAutoSyncRefreshRef.current && wizardFlow === 'prior_list') {
      priorAutoSyncRefreshRef.current = false
      void refreshPriorList()
    }
  }, [pendingAutoSync, wizardFlow, refreshPriorList])

  return {
    priorRows,
    priorLoading,
    priorSearch,
    setPriorSearch,
    priorClientId,
    setPriorClientId,
    refreshPriorList
  }
}
