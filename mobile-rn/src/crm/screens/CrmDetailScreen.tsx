import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
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
  const [loadedExtras, setLoadedExtras] = useState<Set<string>>(new Set())

  const tabs = useMemo(() => detailTabsFor(entityType), [entityType])

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    setLoadedExtras(new Set())
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
        const clientTags = await crmApi.getClientTags(accessToken, entityId).catch(() => [])
        setTags(clientTags)
        setLoadedExtras(new Set(['tags']))
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
      if (loadedExtras.has(key)) return

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
        setLoadedExtras((prev) => new Set(prev).add(key))
      } catch {
        /* non-fatal */
      } finally {
        setLoadingExtras(false)
      }
    },
    [accessToken, entity, entityId, entityType, loadedExtras]
  )

  useEffect(() => {
    void loadExtrasForTab(tab)
  }, [tab, loadExtrasForTab])

  const saveSummaryNotes = async () => {
    if (!accessToken || !entity) return
    setSavingNotes(true)
    try {
      const updated =
        entityType === 'client'
          ? await crmApi.patchClient(accessToken, entityId, { notes: notesDraft })
          : await crmApi.patchLead(accessToken, entityId, { notes: notesDraft })
      setEntity(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const saveNewNote = async () => {
    if (!accessToken || entityType !== 'client' || !newNoteDraft.trim()) return
    setSavingNewNote(true)
    try {
      const note = await crmApi.createClientNote(accessToken, entityId, {
        content: newNoteDraft.trim(),
        title: newNoteDraft.trim().slice(0, 60)
      })
      setClientNotes((prev) => [note, ...prev])
      setNewNoteDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add note')
    } finally {
      setSavingNewNote(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={erp.primary} />
      </View>
    )
  }

  if (error && !entity) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (!entity) return null

  const stage = displayStage(entity)

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>CRM</Text>
        </Pressable>
        <View style={styles.headerBody}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={3}>
              {entity.name || 'Unnamed'}
            </Text>
            {entity.isStarred ? (
              <FontAwesome5 name="star" solid size={16} color="#f59e0b" style={{ marginTop: 4 }} />
            ) : null}
          </View>
          <View style={styles.headerMeta}>
            {stage ? <CrmStatusBadge label={stage} /> : null}
            {entity.industry ? <Text style={styles.industry}>{entity.industry}</Text> : null}
            <Text style={styles.entityKind}>{entityType === 'client' ? 'Client' : 'Lead'}</Text>
          </View>
        </View>
      </View>

      <CrmDetailTabBar
        tabs={tabs}
        active={tab}
        entity={entity}
        onSelect={setTab}
        extras={{
          opportunities: opportunities.length,
          jobCards: jobCards.length,
          clientNotes: clientNotes.length
        }}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
          savingNotes={savingNotes}
          savingNewNote={savingNewNote}
          loadingExtras={loadingExtras}
          onNotesDraftChange={setNotesDraft}
          onNewNoteDraftChange={setNewNoteDraft}
          onSaveSummaryNotes={() => void saveSummaryNotes()}
          onSaveNewNote={() => void saveNewNote()}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: erp.danger, fontWeight: '700', textAlign: 'center' },
  backLink: { color: erp.primary, fontWeight: '700', marginTop: 8 },
  header: {
    paddingTop: 12,
    paddingHorizontal: erp.space.lg,
    paddingBottom: 12,
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  backText: { color: erp.primary, fontWeight: '700', fontSize: 15 },
  headerBody: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: erp.text, lineHeight: 28 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  industry: { fontSize: 13, color: erp.textMuted, fontWeight: '600' },
  entityKind: {
    fontSize: 11,
    fontWeight: '800',
    color: erp.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  errorBanner: {
    backgroundColor: erp.dangerSoft,
    paddingHorizontal: erp.space.lg,
    paddingVertical: 8
  },
  errorBannerText: { color: erp.danger, fontWeight: '600', fontSize: 13 },
  body: { padding: erp.space.lg, paddingBottom: 48 }
})
