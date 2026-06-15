import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../../state/AuthContext'

import { openProject } from '../../dashboard/dashboardNavigation'
import { navigateIncidentReport } from '../../navigation/navigationHelpers'
import type { RootStackParamList } from '../../navigation/types'

import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheEntityDetail,
  crmDetailCacheKey,
  readEntityDetail
} from '../../offline/entityDetailCache'
import { offlineListMessage, rememberRecentCrmEntity } from '../../offline/erpReadCaches'
import { crmApi } from '../api'
import { CrmDetailPanelContent } from '../components/CrmDetailPanels'
import { CrmDetailTabBar } from '../components/CrmDetailTabBar'
import { CrmStatusBadge } from '../components/CrmStatusBadge'
import { detailTabsFor } from '../detailTabs'
import type { CrmStackParamList } from '../navigation'
import type {
  CrmClientNote,
  CrmDetailTab,
  CrmEntityBase,
  CrmGroupMember,
  CrmJobCard,
  CrmOpportunity,
  CrmTag
} from '../types'
import {
  detailEntityKindLabel,
  displayClientStatus,
  displayLeadStage,
  entityComments,
  newLocalId,
  normalizeEntity,
  resolveStarredState
} from '../utils'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<CrmStackParamList, 'CrmDetail'>

export function CrmDetailScreen({ route, navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { entityType, entityId, initialTab } = route.params
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()
  const [readOnlyOffline, setReadOnlyOffline] = useState(false)
  const [entity, setEntity] = useState<CrmEntityBase | null>(null)
  const [groupMembers, setGroupMembers] = useState<CrmGroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<CrmDetailTab>(initialTab || 'overview')
  const [notesDraft, setNotesDraft] = useState('')
  const [newNoteDraft, setNewNoteDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingNewNote, setSavingNewNote] = useState(false)
  const [tags, setTags] = useState<CrmTag[]>([])
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([])
  const [jobCards, setJobCards] = useState<CrmJobCard[]>([])
  const [incidentReports, setIncidentReports] = useState<Array<Record<string, unknown>>>([])
  const [clientNotes, setClientNotes] = useState<CrmClientNote[]>([])
  const [loadingExtras, setLoadingExtras] = useState(false)
  const [patchBusy, setPatchBusy] = useState(false)
  const [starBusy, setStarBusy] = useState(false)
  const [notesFeedback, setNotesFeedback] = useState('')
  const loadedExtrasRef = useRef<Set<string>>(new Set())

  const tabs = useMemo(() => detailTabsFor(entityType), [entityType])

  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab, entityId])

  useEffect(() => {
    void rememberRecentCrmEntity(entityType, entityId)
  }, [entityType, entityId])

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    setReadOnlyOffline(false)
    loadedExtrasRef.current = new Set()
    setTags([])
    setOpportunities([])
    setJobCards([])
    setIncidentReports([])
    setClientNotes([])
    setGroupMembers([])

    type CrmDetailCache = {
      entity: CrmEntityBase
      notesDraft: string
      tags: CrmTag[]
      clientNotes: CrmClientNote[]
      groupMembers: CrmGroupMember[]
    }

    const applyCached = async () => {
      const cached = await readEntityDetail<CrmDetailCache>(
        crmDetailCacheKey(entityType, entityId)
      )
      if (cached?.entity) {
        setEntity(cached.entity)
        setNotesDraft(cached.notesDraft || '')
        setTags(cached.tags || [])
        setClientNotes(cached.clientNotes || [])
        setGroupMembers(cached.groupMembers || [])
        if (cached.tags?.length) loadedExtrasRef.current.add('tags')
        if (cached.clientNotes?.length) loadedExtrasRef.current.add('notes')
        if (cached.groupMembers?.length) loadedExtrasRef.current.add('members')
        setReadOnlyOffline(true)
        return true
      }
      setError(offlineListMessage(false))
      return false
    }

    if (!isOnline) {
      await applyCached()
      setLoading(false)
      return
    }

    try {
      const data =
        entityType === 'lead'
          ? await crmApi.getLead(accessToken, entityId)
          : await crmApi.getClient(accessToken, entityId)
      const entity = normalizeEntity(data)
      setEntity(entity)
      setNotesDraft(String(data.notes || ''))

      let clientTags: CrmTag[] = []
      let notes: CrmClientNote[] = []
      let members: CrmGroupMember[] = []

      if (entityType === 'client' || entityType === 'group') {
        const notePromise = crmApi.getClientNotes(accessToken, entityId).catch(() => [] as CrmClientNote[])
        if (entityType === 'client') {
          const [tagsResult, notesResult] = await Promise.all([
            crmApi.getClientTags(accessToken, entityId).catch(() => [] as CrmTag[]),
            notePromise
          ])
          clientTags = tagsResult
          notes = notesResult
          setTags(clientTags)
          setClientNotes(notes)
          loadedExtrasRef.current.add('tags')
        } else {
          notes = await notePromise
          setClientNotes(notes)
        }
        loadedExtrasRef.current.add('notes')
      }

      if (entityType === 'group') {
        members = await crmApi.getGroupMembers(accessToken, entityId).catch(() => [] as CrmGroupMember[])
        setGroupMembers(members)
        loadedExtrasRef.current.add('members')
      }

      await cacheEntityDetail(crmDetailCacheKey(entityType, entityId), {
        entity,
        notesDraft: String(data.notes || ''),
        tags: clientTags,
        clientNotes: notes,
        groupMembers: members
      })
    } catch (e) {
      const hadCache = await applyCached()
      if (!hadCache) {
        setError(e instanceof Error ? e.message : 'Could not load record')
      }
    } finally {
      setLoading(false)
    }
  }, [accessToken, entityId, entityType, isOnline])

  useEffect(() => {
    void load()
  }, [load])

  const loadExtrasForTab = useCallback(
    async (activeTab: CrmDetailTab) => {
      if (!accessToken || !entity || readOnlyOffline) return
      const key = `${activeTab}`
      if (loadedExtrasRef.current.has(key)) return

      setLoadingExtras(true)
      try {
        if (activeTab === 'opportunities' && entityType === 'client') {
          const opps = await crmApi.getOpportunitiesForClient(accessToken, entityId)
          setOpportunities(opps)
        }
        if (activeTab === 'services' && entityType === 'client') {
          const [cards, incidents] = await Promise.all([
            crmApi.getJobCardsForClient(accessToken, entityId),
            crmApi.getIncidentReportsForClient(accessToken, entityId)
          ])
          setJobCards(cards)
          setIncidentReports(incidents)
        }
        if (activeTab === 'notes' && (entityType === 'client' || entityType === 'group')) {
          const notes = await crmApi.getClientNotes(accessToken, entityId)
          setClientNotes(notes)
        }
        if (activeTab === 'members' && entityType === 'group') {
          const members = await crmApi.getGroupMembers(accessToken, entityId)
          setGroupMembers(members)
        }
        loadedExtrasRef.current.add(key)
      } catch (e) {
        if (activeTab === 'notes') {
          setError(e instanceof Error ? e.message : 'Could not load notes')
        }
      } finally {
        setLoadingExtras(false)
      }
    },
    [accessToken, entity, entityId, entityType, readOnlyOffline]
  )

  useEffect(() => {
    void loadExtrasForTab(tab)
  }, [tab, loadExtrasForTab])

  useEffect(() => {
    if (!notesFeedback) return
    const t = setTimeout(() => setNotesFeedback(''), 2500)
    return () => clearTimeout(t)
  }, [notesFeedback])

  const patchEntity = async (body: Record<string, unknown>) => {
    if (!accessToken || !entity || readOnlyOffline) return
    setPatchBusy(true)
    setError('')
    try {
      const updated =
        entityType === 'lead'
          ? await crmApi.patchLead(accessToken, entityId, body)
          : await crmApi.patchClient(accessToken, entityId, body)
      setEntity(normalizeEntity(updated))
      setNotesFeedback('Saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes')
      throw e
    } finally {
      setPatchBusy(false)
    }
  }

  const createOpportunity = async (body: { title: string; value?: number }) => {
    if (!accessToken || entityType !== 'client' || readOnlyOffline) return
    setPatchBusy(true)
    setError('')
    try {
      const opp = await crmApi.createOpportunity(accessToken, {
        title: body.title,
        clientId: entityId,
        value: body.value
      })
      setOpportunities((prev) => [opp, ...prev])
      loadedExtrasRef.current.add('opportunities')
      setNotesFeedback('Opportunity added')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add opportunity')
      throw e
    } finally {
      setPatchBusy(false)
    }
  }

  const toggleStar = async () => {
    if (!accessToken || !entity || readOnlyOffline) return
    setStarBusy(true)
    try {
      const result = await crmApi.toggleStar(accessToken, entityId)
      setEntity((prev) => (prev ? { ...prev, isStarred: result.starred } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update star')
    } finally {
      setStarBusy(false)
    }
  }

  const saveSummaryNotes = async () => {
    if (!accessToken || !entity || readOnlyOffline) return
    setSavingNotes(true)
    setError('')
    try {
      const updated =
        entityType === 'lead'
          ? await crmApi.patchLead(accessToken, entityId, { notes: notesDraft })
          : await crmApi.patchClient(accessToken, entityId, { notes: notesDraft })
      setEntity(normalizeEntity(updated))
      setNotesFeedback('Summary saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const saveNewNote = async () => {
    if (!accessToken || !newNoteDraft.trim() || readOnlyOffline) return
    setSavingNewNote(true)
    setError('')
    try {
      if (entityType === 'lead') {
        if (!entity) return
        const comments = entityComments(entity)
        const authorName = user?.name || user?.email || 'Mobile user'
        const note = await crmApi.patchLead(accessToken, entityId, {
          comments: [
            ...comments,
            {
              id: newLocalId('comment'),
              text: newNoteDraft.trim(),
              content: newNoteDraft.trim(),
              createdAt: new Date().toISOString(),
              author: authorName,
              userName: authorName,
              createdBy: authorName,
              createdByEmail: user?.email,
              createdById: user?.id
            }
          ]
        })
        setEntity(normalizeEntity(note))
        setNewNoteDraft('')
        setNotesFeedback('Note added')
        return
      }

      if (entityType !== 'client' && entityType !== 'group') return
      const note = await crmApi.createClientNote(accessToken, entityId, {
        content: newNoteDraft.trim(),
        title: newNoteDraft.trim().slice(0, 60)
      })
      setClientNotes((prev) => [note, ...prev])
      setNewNoteDraft('')
      setNotesFeedback('Note added')
      loadedExtrasRef.current.add('notes')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add note')
    } finally {
      setSavingNewNote(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color={erp.primary} />
      </SafeAreaView>
    )
  }

  if (error && !entity) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!entity) return null

  const stage =
    entityType === 'lead'
      ? displayLeadStage(entity)
      : entityType === 'client'
        ? displayClientStatus(entity)
        : ''
  const starred = resolveStarredState(entity)
  const onNotesTab = tab === 'notes'

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <OfflineBanner visible={readOnlyOffline} variant="read" />
      <View style={styles.hero}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={14} color="#fff" />
          <Text style={styles.backText}>CRM</Text>
        </Pressable>
        <View style={styles.heroBody}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={3}>
              {entity.name || 'Unnamed'}
            </Text>
            <Pressable
              onPress={() => void toggleStar()}
              disabled={starBusy}
              hitSlop={8}
              style={{ marginTop: 4 }}
            >
              <FontAwesome5
                name="star"
                solid={starred}
                size={16}
                color={starred ? '#fbbf24' : 'rgba(255,255,255,0.35)'}
              />
            </Pressable>
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.entityKind}>{detailEntityKindLabel(entityType)}</Text>
            {entity.industry ? <Text style={styles.industry}>{entity.industry}</Text> : null}
          </View>
          {stage ? (
            <View style={styles.heroBadgeWrap}>
              <CrmStatusBadge label={stage} />
            </View>
          ) : null}
        </View>
      </View>

      <CrmDetailTabBar
        tabs={tabs}
        active={tab}
        entity={entity}
        onSelect={(next) => {
          setError('')
          setTab(next)
        }}
        extras={{
          opportunities: opportunities.length,
          jobCards: jobCards.length,
          clientNotes: clientNotes.length,
          groupMembers: groupMembers.length
        }}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <FontAwesome5 name="exclamation-circle" size={14} color={erp.danger} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <Pressable onPress={() => setError('')} hitSlop={8}>
            <FontAwesome5 name="times" size={14} color={erp.danger} />
          </Pressable>
        </View>
      ) : null}

      {notesFeedback ? (
        <View style={styles.successBanner}>
          <FontAwesome5 name="check-circle" size={14} color={erp.success} />
          <Text style={styles.successBannerText}>{notesFeedback}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.body, onNotesTab && styles.bodyWithFooter]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <CrmDetailPanelContent
            tab={tab}
            entity={entity}
            entityType={entityType}
            tags={tags}
            opportunities={opportunities}
            jobCards={jobCards}
            incidentReports={incidentReports}
            clientNotes={clientNotes}
            groupMembers={groupMembers}
            notesDraft={notesDraft}
            newNoteDraft={newNoteDraft}
            loadingExtras={loadingExtras}
            patchBusy={patchBusy}
            onNotesDraftChange={setNotesDraft}
            onNewNoteDraftChange={setNewNoteDraft}
            onPatchEntity={patchEntity}
            onCreateOpportunity={entityType === 'client' ? createOpportunity : undefined}
            onOpenMember={(member) => {
              const memberType = member.type === 'lead' ? 'lead' : 'client'
              navigation.push('CrmDetail', { entityType: memberType, entityId: member.id })
            }}
            onOpenProject={(projectId) => openProject(rootNavigation, projectId)}
            onReportIncident={(prefill) => navigateIncidentReport(rootNavigation, { incidentPrefill: prefill })}
          />
        </ScrollView>

        {onNotesTab ? (
          <View style={styles.notesFooter}>
            <Pressable
              style={[styles.footerBtn, savingNotes && styles.footerBtnDisabled]}
              disabled={savingNotes}
              onPress={() => void saveSummaryNotes()}
            >
              {savingNotes ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FontAwesome5 name="save" size={14} color="#fff" />
                  <Text style={styles.footerBtnText}>Save summary</Text>
                </>
              )}
            </Pressable>
            {entityType === 'client' || entityType === 'group' || entityType === 'lead' ? (
              newNoteDraft.trim() ? (
              <Pressable
                style={[styles.footerBtn, styles.footerBtnSecondary, savingNewNote && styles.footerBtnDisabled]}
                disabled={savingNewNote}
                onPress={() => void saveNewNote()}
              >
                {savingNewNote ? (
                  <ActivityIndicator color={erp.primary} size="small" />
                ) : (
                  <>
                    <FontAwesome5 name="plus" size={14} color={erp.primary} />
                    <Text style={[styles.footerBtnText, styles.footerBtnTextSecondary]}>Add note</Text>
                  </>
                )}
              </Pressable>
              ) : null
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: erp.bg },
  error: { color: erp.danger, fontWeight: '700', textAlign: 'center' },
  backLink: { color: erp.primary, fontWeight: '700', marginTop: 8 },
  hero: {
    backgroundColor: erp.sidebar,
    paddingHorizontal: erp.space.lg,
    paddingTop: 8,
    paddingBottom: 16
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  backText: { color: erp.primaryLight, fontWeight: '700', fontSize: 15 },
  heroBody: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 28 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  industry: { fontSize: 13, color: erp.sidebarTextMuted, fontWeight: '600' },
  entityKind: {
    fontSize: 11,
    fontWeight: '800',
    color: '#93c5fd',
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  heroBadgeWrap: { alignSelf: 'flex-start' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: erp.dangerSoft,
    paddingHorizontal: erp.space.lg,
    paddingVertical: 10
  },
  errorBannerText: { flex: 1, color: erp.danger, fontWeight: '600', fontSize: 13 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: erp.successSoft,
    paddingHorizontal: erp.space.lg,
    paddingVertical: 10
  },
  successBannerText: { color: erp.success, fontWeight: '700', fontSize: 13 },
  body: { padding: erp.space.lg, paddingBottom: 24 },
  bodyWithFooter: { paddingBottom: 100 },
  notesFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: erp.space.lg,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: erp.border,
    backgroundColor: erp.surface,
    ...erp.shadowSm
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: erp.primary,
    paddingVertical: 14,
    borderRadius: erp.radius.md
  },
  footerBtnSecondary: {
    backgroundColor: erp.primarySoft,
    borderWidth: 1,
    borderColor: erp.primary
  },
  footerBtnDisabled: { opacity: 0.65 },
  footerBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  footerBtnTextSecondary: { color: erp.primary }
  })
}