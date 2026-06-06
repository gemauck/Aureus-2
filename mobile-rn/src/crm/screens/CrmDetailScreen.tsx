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
import { useAuth } from '../../state/AuthContext'
import { erp } from '../../theme/appTheme'
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
  CrmJobCard,
  CrmOpportunity,
  CrmTag
} from '../types'
import { displayStage } from '../utils'

type Props = NativeStackScreenProps<CrmStackParamList, 'CrmDetail'>

export function CrmDetailScreen({ route, navigation }: Props) {
  const { entityType, entityId } = route.params
  const { accessToken } = useAuth()
  const [entity, setEntity] = useState<CrmEntityBase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<CrmDetailTab>('overview')
  const [notesDraft, setNotesDraft] = useState('')
  const [newNoteDraft, setNewNoteDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingNewNote, setSavingNewNote] = useState(false)
  const [tags, setTags] = useState<CrmTag[]>([])
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([])
  const [jobCards, setJobCards] = useState<CrmJobCard[]>([])
  const [clientNotes, setClientNotes] = useState<CrmClientNote[]>([])
  const [loadingExtras, setLoadingExtras] = useState(false)
  const [notesFeedback, setNotesFeedback] = useState('')
  const loadedExtrasRef = useRef<Set<string>>(new Set())

  const tabs = useMemo(() => detailTabsFor(entityType), [entityType])

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    loadedExtrasRef.current = new Set()
    setTags([])
    setOpportunities([])
    setJobCards([])
    setClientNotes([])
    try {
      const data =
        entityType === 'client'
          ? await crmApi.getClient(accessToken, entityId)
          : await crmApi.getLead(accessToken, entityId)
      setEntity(data)
      setNotesDraft(String(data.notes || ''))

      if (entityType === 'client') {
        const [clientTags, notes] = await Promise.all([
          crmApi.getClientTags(accessToken, entityId).catch(() => [] as CrmTag[]),
          crmApi.getClientNotes(accessToken, entityId).catch(() => [] as CrmClientNote[])
        ])
        setTags(clientTags)
        setClientNotes(notes)
        loadedExtrasRef.current.add('tags')
        loadedExtrasRef.current.add('notes')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load record')
    } finally {
      setLoading(false)
    }
  }, [accessToken, entityId, entityType])

  useEffect(() => {
    void load()
  }, [load])

  const loadExtrasForTab = useCallback(
    async (activeTab: CrmDetailTab) => {
      if (!accessToken || !entity) return
      const key = `${activeTab}`
      if (loadedExtrasRef.current.has(key)) return

      setLoadingExtras(true)
      try {
        if (activeTab === 'opportunities' && entityType === 'client') {
          const opps = await crmApi.getOpportunitiesForClient(accessToken, entityId)
          setOpportunities(opps)
        }
        if (activeTab === 'jobcards' && entityType === 'client') {
          const cards = await crmApi.getJobCardsForClient(accessToken, entityId)
          setJobCards(cards)
        }
        if (activeTab === 'notes' && entityType === 'client') {
          const notes = await crmApi.getClientNotes(accessToken, entityId)
          setClientNotes(notes)
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
    [accessToken, entity, entityId, entityType]
  )

  useEffect(() => {
    void loadExtrasForTab(tab)
  }, [tab, loadExtrasForTab])

  useEffect(() => {
    if (!notesFeedback) return
    const t = setTimeout(() => setNotesFeedback(''), 2500)
    return () => clearTimeout(t)
  }, [notesFeedback])

  const saveSummaryNotes = async () => {
    if (!accessToken || !entity) return
    setSavingNotes(true)
    setError('')
    try {
      const updated =
        entityType === 'client'
          ? await crmApi.patchClient(accessToken, entityId, { notes: notesDraft })
          : await crmApi.patchLead(accessToken, entityId, { notes: notesDraft })
      setEntity(updated)
      setNotesFeedback('Summary saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const saveNewNote = async () => {
    if (!accessToken || entityType !== 'client' || !newNoteDraft.trim()) return
    setSavingNewNote(true)
    setError('')
    try {
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

  const stage = displayStage(entity)
  const onNotesTab = tab === 'notes'

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
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
            {entity.isStarred ? (
              <FontAwesome5 name="star" solid size={16} color="#fbbf24" style={{ marginTop: 4 }} />
            ) : null}
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.entityKind}>{entityType === 'client' ? 'Client' : 'Lead'}</Text>
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
          clientNotes: clientNotes.length
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
            clientNotes={clientNotes}
            notesDraft={notesDraft}
            newNoteDraft={newNoteDraft}
            loadingExtras={loadingExtras}
            onNotesDraftChange={setNotesDraft}
            onNewNoteDraftChange={setNewNoteDraft}
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
            {entityType === 'client' && newNoteDraft.trim() ? (
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
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
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
