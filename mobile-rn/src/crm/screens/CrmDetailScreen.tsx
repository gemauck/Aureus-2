import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useAuth } from '../../state/AuthContext'
import { erp } from '../../theme/appTheme'
import { crmApi } from '../api'
import { CrmStatusBadge } from '../components/CrmStatusBadge'
import type { CrmClient, CrmDetailTab, CrmEntityBase, CrmLead } from '../types'
import {
  displayStage,
  entityComments,
  entityContacts,
  entitySites,
  formatDate,
  formatMoney
} from '../utils'
import type { CrmStackParamList } from '../navigation'

type Props = NativeStackScreenProps<CrmStackParamList, 'CrmDetail'>

const DETAIL_TABS: { key: CrmDetailTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'info-circle' },
  { key: 'contacts', label: 'Contacts', icon: 'address-book' },
  { key: 'sites', label: 'Sites', icon: 'map-marker-alt' },
  { key: 'notes', label: 'Notes', icon: 'sticky-note' }
]

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

export function CrmDetailScreen({ route, navigation }: Props) {
  const { entityType, entityId } = route.params
  const { accessToken } = useAuth()
  const [entity, setEntity] = useState<CrmEntityBase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<CrmDetailTab>('overview')
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const data =
        entityType === 'client'
          ? await crmApi.getClient(accessToken, entityId)
          : await crmApi.getLead(accessToken, entityId)
      setEntity(data)
      setNotesDraft(String(data.notes || ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load record')
    } finally {
      setLoading(false)
    }
  }, [accessToken, entityId, entityType])

  useEffect(() => {
    void load()
  }, [load])

  const saveNotes = async () => {
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
  const contacts = entityContacts(entity)
  const sites = entitySites(entity)
  const comments = entityComments(entity)
  const leadValue = entityType === 'lead' ? (entity as CrmLead).value : undefined
  const clientRevenue = entityType === 'client' ? (entity as CrmClient).revenue : undefined

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>CRM</Text>
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.title} numberOfLines={3}>
            {entity.name || 'Unnamed'}
          </Text>
          <View style={styles.headerMeta}>
            {stage ? <CrmStatusBadge label={stage} /> : null}
            {entity.industry ? <Text style={styles.industry}>{entity.industry}</Text> : null}
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {DETAIL_TABS.map((t) => {
          const active = tab === t.key
          return (
            <Pressable key={t.key} style={[styles.detailTab, active && styles.detailTabActive]} onPress={() => setTab(t.key)}>
              <FontAwesome5 name={t.icon} size={12} color={active ? erp.primary : erp.textMuted} />
              <Text style={[styles.detailTabText, active && styles.detailTabTextActive]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body}>
        {tab === 'overview' ? (
          <View style={styles.section}>
            {leadValue != null && leadValue > 0 ? (
              <View style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>Lead value</Text>
                <Text style={styles.highlightValue}>{formatMoney(leadValue)}</Text>
              </View>
            ) : null}
            {clientRevenue != null && clientRevenue > 0 ? (
              <View style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>Revenue</Text>
                <Text style={styles.highlightValue}>{formatMoney(clientRevenue)}</Text>
              </View>
            ) : null}
            <InfoRow label="Status" value={entity.status} />
            <InfoRow label="Stage" value={stage} />
            <InfoRow label="AIDA" value={entity.aidaStatus || undefined} />
            <InfoRow label="Last contact" value={formatDate(entity.lastContact)} />
            <InfoRow label="Address" value={entity.address} />
            {entity.website ? (
              <Pressable onPress={() => void Linking.openURL(entity.website!.startsWith('http') ? entity.website! : `https://${entity.website}`)}>
                <InfoRow label="Website" value={entity.website} />
              </Pressable>
            ) : null}
            {entity.externalAgent?.name ? (
              <InfoRow label="External agent" value={entity.externalAgent.name} />
            ) : null}
            {Array.isArray(entity.opportunities) && entity.opportunities.length > 0 ? (
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>Opportunities ({entity.opportunities.length})</Text>
                {entity.opportunities.slice(0, 6).map((opp, idx) => (
                  <View key={opp.id || idx} style={styles.miniCard}>
                    <Text style={styles.miniTitle}>{opp.name || 'Opportunity'}</Text>
                    {opp.status ? <CrmStatusBadge label={opp.status} compact /> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'contacts' ? (
          <View style={styles.section}>
            {contacts.length === 0 ? (
              <Text style={styles.empty}>No contacts on file.</Text>
            ) : (
              contacts.map((c, idx) => (
                <View key={c.id || idx} style={styles.miniCard}>
                  <View style={styles.contactTop}>
                    <Text style={styles.miniTitle}>{c.name || 'Contact'}</Text>
                    {c.isPrimary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
                  </View>
                  {c.role || c.title ? (
                    <Text style={styles.miniSub}>{c.role || c.title}</Text>
                  ) : null}
                  {c.email ? (
                    <Pressable onPress={() => void Linking.openURL(`mailto:${c.email}`)}>
                      <Text style={styles.link}>{c.email}</Text>
                    </Pressable>
                  ) : null}
                  {c.phone || c.mobile ? (
                    <Pressable onPress={() => void Linking.openURL(`tel:${c.phone || c.mobile}`)}>
                      <Text style={styles.link}>{c.phone || c.mobile}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'sites' ? (
          <View style={styles.section}>
            {sites.length === 0 ? (
              <Text style={styles.empty}>No sites linked.</Text>
            ) : (
              sites.map((s, idx) => (
                <View key={s.id || idx} style={styles.miniCard}>
                  <Text style={styles.miniTitle}>{s.name || s.siteName || 'Site'}</Text>
                  {s.address ? <Text style={styles.miniSub}>{s.address}</Text> : null}
                  {s.engagementStage || s.aidaStatus ? (
                    <View style={{ marginTop: 8 }}>
                      <CrmStatusBadge label={String(s.engagementStage || s.aidaStatus || '')} compact />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'notes' ? (
          <View style={styles.section}>
            <Text style={styles.subTitle}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              multiline
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="Add notes…"
              placeholderTextColor={erp.textSubtle}
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.saveBtn, savingNotes && styles.saveBtnDisabled]}
              disabled={savingNotes}
              onPress={() => void saveNotes()}
            >
              {savingNotes ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save notes</Text>
              )}
            </Pressable>
            {comments.length > 0 ? (
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>Activity</Text>
                {comments.map((c, idx) => (
                  <View key={c.id || idx} style={styles.commentCard}>
                    <Text style={styles.commentText}>{c.text || c.content || '—'}</Text>
                    <Text style={styles.commentMeta}>
                      {[c.author, formatDate(c.createdAt || c.timestamp)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
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
  title: { fontSize: 24, fontWeight: '800', color: erp.text, lineHeight: 30 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  industry: { fontSize: 13, color: erp.textMuted, fontWeight: '600' },
  tabBar: {
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border,
    maxHeight: 48
  },
  detailTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  detailTabActive: { borderBottomWidth: 2, borderBottomColor: erp.primary },
  detailTabText: { fontSize: 13, fontWeight: '700', color: erp.textMuted },
  detailTabTextActive: { color: erp.primary },
  body: { padding: erp.space.lg, paddingBottom: 40 },
  section: { gap: 12 },
  highlightCard: {
    backgroundColor: erp.primarySoft,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  highlightLabel: { fontSize: 12, fontWeight: '700', color: erp.primary, textTransform: 'uppercase' },
  highlightValue: { fontSize: 24, fontWeight: '800', color: erp.text, marginTop: 4 },
  infoRow: { backgroundColor: erp.surface, borderRadius: erp.radius.md, padding: 14, borderWidth: 1, borderColor: erp.border },
  infoLabel: { fontSize: 11, fontWeight: '700', color: erp.textSubtle, textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { fontSize: 15, color: erp.text, lineHeight: 21 },
  subSection: { marginTop: 8, gap: 8 },
  subTitle: { fontSize: 14, fontWeight: '800', color: erp.text, marginBottom: 4 },
  miniCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 8
  },
  miniTitle: { fontSize: 15, fontWeight: '800', color: erp.text },
  miniSub: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
  contactTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryBadge: { fontSize: 11, fontWeight: '800', color: erp.success },
  link: { color: erp.primary, fontWeight: '600', marginTop: 6, fontSize: 14 },
  empty: { color: erp.textMuted, textAlign: 'center', padding: 24 },
  notesInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    padding: 12,
    backgroundColor: erp.surface,
    color: erp.text,
    fontSize: 15
  },
  saveBtn: {
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingVertical: 12,
    alignItems: 'center'
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  commentCard: {
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.md,
    padding: 12
  },
  commentText: { color: erp.text, fontSize: 14, lineHeight: 20 },
  commentMeta: { fontSize: 11, color: erp.textSubtle, marginTop: 6 }
})
