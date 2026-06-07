import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  STEP_IDS,
  NO_CLIENT_ID,
  REFERENCE_CACHE_KEYS,
  buildNewJobCardEditingMeta,
  createEmptyFormData,
  createStockEntryRow,
  emptySectionWorkMedia,
  buildJobCardSavePayload,
  validateWizardStep,
  buildMergedWizardJobCardRows,
  toDatetimeLocalInput
} from '../../../src/jobCardWizard/index.js'
import { useNetwork } from '../hooks/useNetwork'
import { useAuth } from '../state/AuthContext'
import { API_BASE_URL } from '../config'
import { isAdmin } from '../utils/menuAccess'
import { jobcardsApi } from './api'
import { applyPhotosPayloadToWizardState } from './media/photoHydration'
import { voiceClipToPayloadUrl } from './media/mediaUri'
import { getOfflineStore } from './offlineStore'
import { useJobCardSync } from './JobCardSyncContext'
import type {
  ProjectOption,
  ClientOption,
  EditingMeta,
  InventoryItem,
  JobCardFormData,
  PriorListRow,
  SectionWorkMedia,
  ServiceFormTemplate,
  StockEntryRow,
  StockLocation,
  UserOption,
  VoiceClip,
  WizardFlow,
  MediaItem
} from './types'

type WizardContextValue = {
  loading: boolean
  referenceRefreshing: boolean
  ensureReferenceDataLoaded: () => Promise<void>
  wizardFlow: WizardFlow
  setWizardFlow: (f: WizardFlow) => void
  currentStep: number
  setCurrentStep: (n: number) => void
  formData: JobCardFormData
  setFormData: React.Dispatch<React.SetStateAction<JobCardFormData>>
  editingMeta: EditingMeta | null
  stepError: string
  setStepError: (s: string) => void
  isSubmitting: boolean
  clients: ClientOption[]
  users: UserOption[]
  projects: ProjectOption[]
  inventoryLoading: boolean
  ensureInventoryLoaded: () => Promise<void>
  inventory: InventoryItem[]
  stockLocations: StockLocation[]
  formTemplates: ServiceFormTemplate[]
  stockEntryRows: StockEntryRow[]
  setStockEntryRows: React.Dispatch<React.SetStateAction<StockEntryRow[]>>
  sectionWorkMedia: SectionWorkMedia
  setSectionWorkMedia: React.Dispatch<React.SetStateAction<SectionWorkMedia>>
  voiceAttachments: VoiceClip[]
  setVoiceAttachments: React.Dispatch<React.SetStateAction<VoiceClip[]>>
  selectedPhotos: MediaItem[]
  setSelectedPhotos: React.Dispatch<React.SetStateAction<MediaItem[]>>
  signatureLocked: boolean
  setSignatureLocked: React.Dispatch<React.SetStateAction<boolean>>
  unsyncedCount: number
  pendingAutoSync: boolean
  priorRows: PriorListRow[]
  priorLoading: boolean
  priorSearch: string
  setPriorSearch: (s: string) => void
  priorClientId: string
  setPriorClientId: (s: string) => void
  startNewJobCard: () => void
  openPriorList: () => void
  openStockTake: () => void
  goToStep: (index: number) => void
  handleNext: () => void
  handlePrevious: () => void
  handleSave: (opts?: { forceDraft?: boolean; forceSubmitted?: boolean }) => Promise<void>
  runSyncNow: () => Promise<{ synced: number; failed: number }>
  openJobCard: (row: PriorListRow) => Promise<void>
  openJobCardById: (jobCardId: string) => Promise<void>
  syncOneCard: (row: PriorListRow) => Promise<void>
  refreshPriorList: () => Promise<void>
  canDeleteJobCards: boolean
  deletingJobCardId: string | null
  deleteJobCard: (row: PriorListRow) => Promise<void>
  openingCardId: string | null
  photosLoading: boolean
  arrivalConfirmOpen: boolean
  setArrivalConfirmOpen: (v: boolean) => void
  departureConfirmOpen: boolean
  setDepartureConfirmOpen: (v: boolean) => void
}

const WizardContext = createContext<WizardContextValue | undefined>(undefined)

function activeTechnicianUsers(list: UserOption[]) {
  return list.filter((x) => {
    const status = (x.status || 'active').toLowerCase()
    return status !== 'inactive' && status !== 'suspended'
  })
}

export function JobCardWizardProvider({
  children,
  initialJobCardId,
  initialFlow
}: {
  children: React.ReactNode
  initialJobCardId?: string
  initialFlow?: WizardFlow
}) {
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()
  const {
    unsyncedCount,
    pendingAutoSync,
    refreshUnsyncedCount,
    bumpLocalDrafts,
    runSyncNow,
    syncOnePendingCard
  } = useJobCardSync()

  const [loading, setLoading] = useState(true)
  const [referenceRefreshing, setReferenceRefreshing] = useState(false)
  const [wizardFlow, setWizardFlow] = useState<WizardFlow>(initialFlow || 'landing')
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<JobCardFormData>(createEmptyFormData())
  const [editingMeta, setEditingMeta] = useState<EditingMeta | null>(null)
  const [stepError, setStepError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const inventoryLoadedRef = useRef(false)
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([])
  const [formTemplates, setFormTemplates] = useState<ServiceFormTemplate[]>([])
  const [stockEntryRows, setStockEntryRows] = useState<StockEntryRow[]>([createStockEntryRow()])
  const [sectionWorkMedia, setSectionWorkMedia] = useState<SectionWorkMedia>({
    diagnosis: [],
    actionsTaken: [],
    futureWorkRequired: []
  })
  const [voiceAttachments, setVoiceAttachments] = useState<VoiceClip[]>([])
  const [selectedPhotos, setSelectedPhotos] = useState<MediaItem[]>([])
  const [signatureLocked, setSignatureLocked] = useState(false)
  const [priorRows, setPriorRows] = useState<PriorListRow[]>([])
  const [priorLoading, setPriorLoading] = useState(false)
  const [priorSearch, setPriorSearch] = useState('')
  const [priorClientId, setPriorClientId] = useState('')
  const [openingCardId, setOpeningCardId] = useState<string | null>(null)
  const [deletingJobCardId, setDeletingJobCardId] = useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = useState(false)
  const [arrivalConfirmOpen, setArrivalConfirmOpen] = useState(false)
  const [departureConfirmOpen, setDepartureConfirmOpen] = useState(false)

  const loadReferenceData = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const silent = Boolean(opts.silent)
      if (!silent) setLoading(true)
      else setReferenceRefreshing(true)

      try {
        const [cachedClientsRaw, cachedProjectsRaw, cachedUsersRaw] = await Promise.all([
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.clients),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.projects),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.users)
        ])
        const cachedClients = JSON.parse(cachedClientsRaw || '[]')
        if (Array.isArray(cachedClients) && cachedClients.length) setClients(cachedClients)
        const cachedUsers = JSON.parse(cachedUsersRaw || '[]')
        if (Array.isArray(cachedUsers) && cachedUsers.length) {
          setUsers(activeTechnicianUsers(cachedUsers))
        }
        const cachedProjects = JSON.parse(cachedProjectsRaw || '[]')
        if (Array.isArray(cachedProjects) && cachedProjects.length) {
          setProjects(
            cachedProjects.map(
              (p: { id: string; name?: string; clientId?: string; clientName?: string; status?: string }) => ({
                id: String(p.id),
                name: p.name || String(p.id),
                clientId: p.clientId ? String(p.clientId) : undefined,
                clientName: p.clientName,
                status: p.status
              })
            )
          )
        }

        if (!isOnline) return

        const [c, u, proj] = await Promise.all([
          jobcardsApi.loadClients(accessToken || undefined),
          jobcardsApi.getUsers(accessToken || undefined),
          accessToken ? jobcardsApi.getProjects(accessToken) : Promise.resolve([])
        ])

        if (Array.isArray(c)) {
          setClients(c)
          if (c.length) {
            await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.clients, JSON.stringify(c))
          }
        }

        const technicians = activeTechnicianUsers(Array.isArray(u) ? u : [])
        setUsers(technicians)
        if (technicians.length) {
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.users, JSON.stringify(technicians))
        }

        if (Array.isArray(proj)) {
          const normalized = proj.map((p) => ({
            id: String(p.id),
            name: p.name || String(p.id),
            clientId: p.clientId ? String(p.clientId) : undefined,
            clientName: p.clientName,
            status: p.status
          }))
          setProjects(normalized)
          if (normalized.length) {
            await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.projects, JSON.stringify(normalized))
          }
        }
      } catch {
        /* cache / network optional */
      } finally {
        if (!silent) setLoading(false)
        else setReferenceRefreshing(false)
      }
    },
    [accessToken, isOnline]
  )

  const ensureReferenceDataLoaded = useCallback(async () => {
    if (users.length && clients.length) return
    await loadReferenceData({ silent: true })
  }, [users.length, clients.length, loadReferenceData])

  const ensureInventoryLoaded = useCallback(async () => {
    if (inventoryLoadedRef.current && inventory.length) return
    setInventoryLoading(true)
    try {
      if (isOnline) {
        const inv = await jobcardsApi.getPublicInventory().catch(() => [])
        const locs = await jobcardsApi.getPublicLocations().catch(() => [])
        const tpl = await jobcardsApi.getServiceFormTemplates().catch(() => [])
        if (inv.length) {
          setInventory(inv)
          inventoryLoadedRef.current = true
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.inventory, JSON.stringify(inv))
        }
        if (locs.length) {
          setStockLocations(locs)
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.locations, JSON.stringify(locs))
        }
        if (tpl.length) {
          setFormTemplates(tpl)
          await AsyncStorage.setItem(REFERENCE_CACHE_KEYS.serviceFormTemplates, JSON.stringify(tpl))
        }
      } else {
        const [invRaw, locsRaw, tplRaw] = await Promise.all([
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.inventory),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.locations),
          AsyncStorage.getItem(REFERENCE_CACHE_KEYS.serviceFormTemplates)
        ])
        const inv = JSON.parse(invRaw || '[]')
        const locs = JSON.parse(locsRaw || '[]')
        const tpl = JSON.parse(tplRaw || '[]')
        if (Array.isArray(inv) && inv.length) {
          setInventory(inv)
          inventoryLoadedRef.current = true
        }
        if (Array.isArray(locs)) setStockLocations(locs)
        if (Array.isArray(tpl)) setFormTemplates(tpl)
      }
    } finally {
      setInventoryLoading(false)
    }
  }, [isOnline, inventory.length])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  const startNewJobCard = useCallback(() => {
    void ensureReferenceDataLoaded()
    const now = new Date().toISOString()
    const meta = buildNewJobCardEditingMeta(now)
    const agent = user?.name || user?.email || ''
    setEditingMeta(meta)
    setFormData({
      ...createEmptyFormData(),
      agentName: agent,
      timeOfArrival: toDatetimeLocalInput(now),
      status: 'draft'
    })
    setCurrentStep(0)
    setStockEntryRows([createStockEntryRow()])
    setSectionWorkMedia(emptySectionWorkMedia() as SectionWorkMedia)
    setVoiceAttachments([])
    setSelectedPhotos([])
    setSignatureLocked(false)
    setStepError('')
    setArrivalConfirmOpen(true)
    setWizardFlow('form')
  }, [user, ensureReferenceDataLoaded])

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

  const openPriorList = useCallback(() => {
    void ensureReferenceDataLoaded()
    setWizardFlow('prior_list')
    void refreshPriorList()
  }, [refreshPriorList, ensureReferenceDataLoaded])

  const openStockTake = useCallback(() => {
    setWizardFlow('stock_take')
    void ensureInventoryLoaded()
  }, [ensureInventoryLoaded])

  const initialFlowBootstrappedRef = useRef(false)
  useEffect(() => {
    if (initialFlowBootstrappedRef.current || initialJobCardId) return
    if (initialFlow === 'stock_take') {
      initialFlowBootstrappedRef.current = true
      openStockTake()
    } else if (initialFlow === 'prior_list') {
      initialFlowBootstrappedRef.current = true
      openPriorList()
    }
  }, [initialFlow, initialJobCardId, openStockTake, openPriorList])

  const priorAutoSyncRefreshRef = useRef(false)
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

  const validateStep = useCallback(
    (stepIndex: number) =>
      validateWizardStep(stepIndex, formData, {
        useNewJobTimeFlow: editingMeta?.useNewJobTimeFlow,
        arrivalConfirmOpen,
        departureConfirmOpen
      }),
    [formData, editingMeta, arrivalConfirmOpen, departureConfirmOpen]
  )

  const canDeleteJobCards = isAdmin(user)

  const applyMediaAndStockFromCard = useCallback((card: JobCardFormData & { photos?: unknown }) => {
    const media = applyPhotosPayloadToWizardState(card.photos, API_BASE_URL)
    setSelectedPhotos(media.selectedPhotos)
    setSectionWorkMedia(media.sectionWorkMedia)
    setVoiceAttachments(media.voiceAttachments)
    if (media.customerSignature) {
      setFormData((f) => ({ ...f, customerSignature: media.customerSignature }))
      setSignatureLocked(true)
    } else {
      setSignatureLocked(Boolean(card.customerSignature))
    }
    if (card.stockUsed?.length) {
      setStockEntryRows(
        card.stockUsed.map((line, i) =>
          createStockEntryRow({
            id: line.id || `stock-restore-${i}`,
            locationId: line.locationId || '',
            sku: line.sku || '',
            quantity: line.quantity || 0
          })
        )
      )
    } else {
      setStockEntryRows([createStockEntryRow()])
    }
  }, [])

  const hydratePhotosForCard = useCallback(
    async (serverId: string, localId: string) => {
      if (!accessToken) return
      setPhotosLoading(true)
      try {
        const res = await jobcardsApi.getPhotos(accessToken, serverId)
        const photos = res.photos
        applyMediaAndStockFromCard({ ...createEmptyFormData(), photos } as JobCardFormData)
      } catch {
        /* keep whatever local/slim payload had */
      } finally {
        setPhotosLoading(false)
      }
    },
    [accessToken, applyMediaAndStockFromCard]
  )

  const persistLocal = useCallback(
    async (payload: Record<string, unknown>, opts: { scheduleAutoSync?: boolean } = {}) => {
      const scheduleAutoSync = opts.scheduleAutoSync !== false
      const offlineStore = await getOfflineStore()
      await offlineStore.upsertLocalPendingJobCardAsync({ ...payload, synced: false })
      await refreshUnsyncedCount()
      if (scheduleAutoSync) bumpLocalDrafts()
    },
    [refreshUnsyncedCount, bumpLocalDrafts]
  )

  const persistDraftQuiet = useCallback(
    async (opts: { forceDraft?: boolean; forceSubmitted?: boolean } = { forceDraft: true }) => {
      if (!editingMeta) return
      try {
        const normalizedStatus = opts.forceSubmitted
          ? 'submitted'
          : opts.forceDraft
            ? 'draft'
            : formData.status || 'draft'

        const sectionPhotoEntries = (['diagnosis', 'actionsTaken', 'futureWorkRequired'] as const).flatMap(
          (sec) =>
            (sectionWorkMedia[sec] || []).map((item) => ({
              kind: 'sectionMedia',
              section: sec,
              url: item.url,
              name: item.name || '',
              thumbUrl: item.thumbUrl || ''
            }))
        )

        const voicePhotoEntries = await Promise.all(
          voiceAttachments.map(async (v) => ({
            kind: 'voice' as const,
            section: v.section,
            url: await voiceClipToPayloadUrl(v),
            name: v.name || 'Voice note'
          }))
        )

        const jobCardData = buildJobCardSavePayload({
          formData: {
            ...formData,
            photos: selectedPhotos.length ? (selectedPhotos as JobCardFormData['photos']) : formData.photos,
            stockUsed: formData.stockUsed
          },
          editingMeta,
          editingId: editingMeta.localId,
          signatureDataUrl: formData.customerSignature,
          sectionPhotoEntries,
          voicePhotoEntries,
          normalizedStatus
        }) as Record<string, unknown>

        jobCardData.id = editingMeta.localId
        const tryImmediateSync = Boolean(isOnline && accessToken)
        await persistLocal(jobCardData, { scheduleAutoSync: !tryImmediateSync })

        if (tryImmediateSync) {
          const result = await syncOnePendingCard(jobCardData)
          if (result.ok && result.serverId) {
            setEditingMeta((m) =>
              m
                ? {
                    ...m,
                    serverJobCardId: result.serverId,
                    synced: true
                  }
                : m
            )
          } else if (!result.ok) {
            bumpLocalDrafts()
          }
        }
        setFormData((f) => ({ ...f, status: normalizedStatus }))
      } catch {
        /* best-effort on step change */
      }
    },
    [
      editingMeta,
      formData,
      sectionWorkMedia,
      voiceAttachments,
      persistLocal,
      isOnline,
      accessToken,
      selectedPhotos,
      syncOnePendingCard,
      bumpLocalDrafts
    ]
  )

  const handleSave = useCallback(
    async (opts: { forceDraft?: boolean; forceSubmitted?: boolean } = {}) => {
      if (!editingMeta) return
      setIsSubmitting(true)
      try {
        await persistDraftQuiet(opts)
      } finally {
        setIsSubmitting(false)
      }
    },
    [editingMeta, persistDraftQuiet]
  )

  const goToStep = useCallback(
    (stepIndex: number) => {
      if (stepIndex === currentStep) return
      if (stepIndex > currentStep && !editingMeta?.synced) {
        const err = validateStep(currentStep)
        if (err) {
          setStepError(err)
          return
        }
      }
      setStepError('')
      void persistDraftQuiet({ forceDraft: true })
      setCurrentStep(stepIndex)
    },
    [currentStep, editingMeta, validateStep, persistDraftQuiet]
  )

  const handleNext = useCallback(() => {
    if (!editingMeta?.synced) {
      const err = validateStep(currentStep)
      if (err) {
        setStepError(err)
        return
      }
    }
    setStepError('')
    void persistDraftQuiet({ forceDraft: true })
    setCurrentStep((s) => Math.min(s + 1, STEP_IDS.length - 1))
  }, [currentStep, editingMeta, validateStep, persistDraftQuiet])

  const handlePrevious = useCallback(() => {
    setStepError('')
    setCurrentStep((s) => Math.max(s - 1, 0))
  }, [])

  const openJobCard = useCallback(
    async (row: PriorListRow) => {
      const rowId = String(row.id)
      setPhotosLoading(false)
      setSignatureLocked(false)
      setSelectedPhotos([])
      setSectionWorkMedia(emptySectionWorkMedia() as SectionWorkMedia)
      setVoiceAttachments([])

      if (row.source === 'local' || row.synced === false) {
        const merged = { ...createEmptyFormData(), ...row } as JobCardFormData
        setEditingMeta({
          localId: rowId,
          serverJobCardId: row.serverJobCardId || null,
          startedAt: row.startedAt || row.createdAt || new Date().toISOString(),
          createdAt: row.createdAt || new Date().toISOString(),
          synced: false,
          jobCardNumber: row.jobCardNumber || '',
          useNewJobTimeFlow: row.useNewJobTimeFlow !== false
        })
        setFormData(merged)
        applyMediaAndStockFromCard(merged)
        setWizardFlow('form')
        setCurrentStep(0)
        return
      }
      if (!accessToken) return
      setOpeningCardId(rowId)
      try {
        const res = await jobcardsApi.get(accessToken, rowId)
        const jc = res.jobCard
        const merged = { ...createEmptyFormData(), ...jc } as JobCardFormData
        setEditingMeta({
          localId: String(jc.id),
          serverJobCardId: String(jc.id),
          startedAt: jc.startedAt || jc.createdAt || new Date().toISOString(),
          createdAt: jc.createdAt || new Date().toISOString(),
          synced: true,
          jobCardNumber: jc.jobCardNumber || '',
          useNewJobTimeFlow: false
        })
        setFormData(merged)
        applyMediaAndStockFromCard(merged)
        setWizardFlow('form')
        setCurrentStep(0)
        void hydratePhotosForCard(String(jc.id), rowId)
      } finally {
        setOpeningCardId(null)
      }
    },
    [accessToken, applyMediaAndStockFromCard, hydratePhotosForCard]
  )

  const openJobCardById = useCallback(
    async (jobCardId: string) => {
      const rowId = String(jobCardId)
      if (!rowId) return

      const offlineStore = await getOfflineStore()
      const localRows = await offlineStore.readLocalPendingJobCardsAsync()
      const localMatch = localRows.find(
        (row) =>
          String(row.id) === rowId ||
          String(row.clientDraftId || '') === rowId ||
          String(row.serverJobCardId || '') === rowId
      )
      if (localMatch) {
        await openJobCard(localMatch as PriorListRow)
        return
      }

      const priorMatch = priorRows.find(
        (row) => String(row.id) === rowId || String(row.serverJobCardId || '') === rowId
      )
      if (priorMatch) {
        await openJobCard(priorMatch)
        return
      }

      if (!accessToken) return
      setOpeningCardId(rowId)
      setPhotosLoading(false)
      setSignatureLocked(false)
      setSelectedPhotos([])
      setSectionWorkMedia(emptySectionWorkMedia() as SectionWorkMedia)
      setVoiceAttachments([])
      try {
        const res = await jobcardsApi.get(accessToken, rowId)
        const jc = res.jobCard
        const merged = { ...createEmptyFormData(), ...jc } as JobCardFormData
        setEditingMeta({
          localId: String(jc.id),
          serverJobCardId: String(jc.id),
          startedAt: jc.startedAt || jc.createdAt || new Date().toISOString(),
          createdAt: jc.createdAt || new Date().toISOString(),
          synced: true,
          jobCardNumber: jc.jobCardNumber || '',
          useNewJobTimeFlow: false
        })
        setFormData(merged)
        applyMediaAndStockFromCard(merged)
        setWizardFlow('form')
        setCurrentStep(0)
        void hydratePhotosForCard(String(jc.id), rowId)
      } catch (e) {
        setStepError(e instanceof Error ? e.message : 'Could not open job card')
        setWizardFlow('landing')
      } finally {
        setOpeningCardId(null)
      }
    },
    [accessToken, priorRows, openJobCard, applyMediaAndStockFromCard, hydratePhotosForCard]
  )

  const deleteJobCard = useCallback(
    async (row: PriorListRow) => {
      if (!canDeleteJobCards || !row?.id) return
      if (deletingJobCardId) return

      const label = row.jobCardNumber || row.heading || 'this job card'
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Delete job card',
          `Delete ${label}? This action cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        )
      })
      if (!confirmed) return

      const rowId = String(row.id)
      const isLocal = row.source === 'local' || row.synced === false

      try {
        setDeletingJobCardId(rowId)
        if (isLocal) {
          const offlineStore = await getOfflineStore()
          await offlineStore.removeLocalPendingJobCardAsync(rowId)
          void refreshUnsyncedCount()
        } else {
          if (!accessToken) return
          await jobcardsApi.delete(accessToken, rowId)
        }

        if (editingMeta?.localId === rowId || editingMeta?.serverJobCardId === rowId) {
          setEditingMeta(null)
          setFormData(createEmptyFormData())
          setWizardFlow(wizardFlow === 'form' ? 'prior_list' : wizardFlow)
        }

        await refreshPriorList()
      } catch (e) {
        Alert.alert('Delete failed', e instanceof Error ? e.message : 'Could not delete job card')
      } finally {
        setDeletingJobCardId(null)
      }
    },
    [
      canDeleteJobCards,
      deletingJobCardId,
      accessToken,
      editingMeta,
      wizardFlow,
      refreshPriorList,
      refreshUnsyncedCount
    ]
  )

  const initialOpenRef = useRef<string | null>(null)
  useEffect(() => {
    const targetId = initialJobCardId ? String(initialJobCardId) : ''
    if (!targetId || loading || !accessToken) return
    if (initialOpenRef.current === targetId) return
    initialOpenRef.current = targetId
    void openJobCardById(targetId)
  }, [initialJobCardId, loading, accessToken, openJobCardById])

  const syncOneCard = useCallback(
    async (row: PriorListRow) => {
      if (!accessToken || !isOnline) return
      const result = await syncOnePendingCard(row as Record<string, unknown>)
      if (!result.ok) bumpLocalDrafts()
      await refreshPriorList()
    },
    [accessToken, isOnline, syncOnePendingCard, bumpLocalDrafts, refreshPriorList]
  )

  const value = useMemo<WizardContextValue>(
    () => ({
      loading,
      referenceRefreshing,
      ensureReferenceDataLoaded,
      wizardFlow,
      setWizardFlow,
      currentStep,
      setCurrentStep,
      formData,
      setFormData,
      editingMeta,
      stepError,
      setStepError,
      isSubmitting,
      clients,
      users,
      projects,
      inventoryLoading,
      ensureInventoryLoaded,
      inventory,
      stockLocations,
      formTemplates,
      stockEntryRows,
      setStockEntryRows,
      sectionWorkMedia,
      setSectionWorkMedia,
      voiceAttachments,
      setVoiceAttachments,
      selectedPhotos,
      setSelectedPhotos,
      signatureLocked,
      setSignatureLocked,
      unsyncedCount,
      pendingAutoSync,
      priorRows,
      priorLoading,
      priorSearch,
      setPriorSearch,
      priorClientId,
      setPriorClientId,
      startNewJobCard,
      openPriorList,
      openStockTake,
      goToStep,
      handleNext,
      handlePrevious,
      handleSave,
      runSyncNow,
      openJobCard,
      openJobCardById,
      syncOneCard,
      refreshPriorList,
      canDeleteJobCards,
      deletingJobCardId,
      deleteJobCard,
      openingCardId,
      photosLoading,
      arrivalConfirmOpen,
      setArrivalConfirmOpen,
      departureConfirmOpen,
      setDepartureConfirmOpen
    }),
    [
      loading,
      referenceRefreshing,
      ensureReferenceDataLoaded,
      wizardFlow,
      currentStep,
      formData,
      editingMeta,
      stepError,
      isSubmitting,
      clients,
      users,
      projects,
      inventoryLoading,
      ensureInventoryLoaded,
      inventory,
      stockLocations,
      formTemplates,
      stockEntryRows,
      sectionWorkMedia,
      voiceAttachments,
      selectedPhotos,
      signatureLocked,
      unsyncedCount,
      pendingAutoSync,
      priorRows,
      priorLoading,
      priorSearch,
      priorClientId,
      startNewJobCard,
      openPriorList,
      openStockTake,
      goToStep,
      handleNext,
      handlePrevious,
      handleSave,
      runSyncNow,
      openJobCard,
      openJobCardById,
      syncOneCard,
      refreshPriorList,
      canDeleteJobCards,
      deletingJobCardId,
      deleteJobCard,
      openingCardId,
      photosLoading,
      arrivalConfirmOpen,
      departureConfirmOpen
    ]
  )

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
}

export function useJobCardWizard() {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useJobCardWizard must be used within JobCardWizardProvider')
  return ctx
}

export { STEP_IDS, NO_CLIENT_ID, STEP_META } from '../../../src/jobCardWizard/constants.js'
