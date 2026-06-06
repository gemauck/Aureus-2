import React from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import { CrmStatusBadge } from './CrmStatusBadge'
import type {
  CrmClientNote,
  CrmDetailTab,
  CrmEntityBase,
  CrmJobCard,
  CrmLead,
  CrmOpportunity,
  CrmTag
} from '../types'
import {
  displayStage,
  entityActivityLog,
  entityComments,
  entityContacts,
  entityContracts,
  entityFollowUps,
  entityProjects,
  entityProposals,
  entityServices,
  entitySites,
  formatCommentAuthor,
  formatDate,
  formatMoney
} from '../utils'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const styles = useThemedStyles(createStyles)
  if (!value) return null
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function EmptyState({ icon, title }: { icon: string; title: string }) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.emptyWrap}>
      <FontAwesome5 name={icon} size={28} color={erp.textSubtle} />
      <Text style={styles.emptyTitle}>{title}</Text>
    </View>
  )
}

type PanelProps = {
  tab: CrmDetailTab
  entity: CrmEntityBase
  entityType: 'client' | 'lead'
  tags: CrmTag[]
  opportunities: CrmOpportunity[]
  jobCards: CrmJobCard[]
  clientNotes: CrmClientNote[]
  notesDraft: string
  newNoteDraft: string
  loadingExtras: boolean
  onNotesDraftChange: (v: string) => void
  onNewNoteDraftChange: (v: string) => void
}

export function CrmDetailPanelContent(props: PanelProps) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const {
    tab,
    entity,
    entityType,
    tags,
    opportunities,
    jobCards,
    clientNotes,
    notesDraft,
    newNoteDraft,
    loadingExtras,
    onNotesDraftChange,
    onNewNoteDraftChange
  } = props

  const stage = displayStage(entity)
  const lead = entityType === 'lead' ? (entity as CrmLead) : null

  if (tab === 'overview') {
    return (
      <View style={styles.section}>
        {(lead?.value ?? 0) > 0 ? (
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>Lead value</Text>
            <Text style={styles.highlightValue}>{formatMoney(lead?.value)}</Text>
            {lead?.probability != null ? (
              <Text style={styles.highlightSub}>{lead.probability}% probability</Text>
            ) : null}
          </View>
        ) : null}
        {(entity.revenue ?? 0) > 0 ? (
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>Revenue</Text>
            <Text style={styles.highlightValue}>{formatMoney(entity.revenue)}</Text>
          </View>
        ) : null}
        {tags.length > 0 ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag.id} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag.name || 'Tag'}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <InfoRow label="Status" value={entity.status} />
        <InfoRow label="Engagement stage" value={stage} />
        <InfoRow label="AIDA status" value={entity.aidaStatus || undefined} />
        <InfoRow label="Industry" value={entity.industry} />
        <InfoRow label="Last contact" value={formatDate(entity.lastContact)} />
        <InfoRow label="Address" value={entity.address} />
        {entity.website ? (
          <Pressable
            onPress={() =>
              void Linking.openURL(
                entity.website!.startsWith('http') ? entity.website! : `https://${entity.website}`
              )
            }
          >
            <InfoRow label="Website" value={entity.website} />
          </Pressable>
        ) : null}
        {entity.externalAgent?.name ? (
          <InfoRow label="External agent" value={entity.externalAgent.name} />
        ) : null}
        {entity.billingTerms ? (
          <View style={styles.groupCard}>
            <Text style={styles.groupTitle}>Billing terms</Text>
            <InfoRow label="Payment" value={entity.billingTerms.paymentTerms} />
            <InfoRow label="Frequency" value={entity.billingTerms.billingFrequency} />
            <InfoRow label="Currency" value={entity.billingTerms.currency} />
          </View>
        ) : null}
        {entity.groupMemberships?.length ? (
          <View style={styles.groupCard}>
            <Text style={styles.groupTitle}>Company groups</Text>
            {entity.groupMemberships.map((m, i) => (
              <Text key={m.group?.id || i} style={styles.groupItem}>
                {m.group?.name || 'Group'}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    )
  }

  if (tab === 'contacts') {
    const contacts = entityContacts(entity)
    if (!contacts.length) return <EmptyState icon="address-book" title="No contacts on file" />
    return (
      <View style={styles.section}>
        {contacts.map((c, idx) => (
          <View key={c.id || idx} style={styles.miniCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.miniTitle}>{c.name || 'Contact'}</Text>
              {c.isPrimary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
            </View>
            {c.role || c.title ? <Text style={styles.miniSub}>{c.role || c.title}</Text> : null}
            {c.notes ? <Text style={styles.miniSub}>{c.notes}</Text> : null}
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
        ))}
      </View>
    )
  }

  if (tab === 'sites') {
    const sites = entitySites(entity)
    if (!sites.length) return <EmptyState icon="map-marker-alt" title="No sites linked" />
    return (
      <View style={styles.section}>
        {sites.map((s, idx) => (
          <View key={s.id || idx} style={styles.miniCard}>
            <Text style={styles.miniTitle}>{s.name || s.siteName || 'Site'}</Text>
            {s.address ? <Text style={styles.miniSub}>{s.address}</Text> : null}
            {s.contactPerson ? (
              <Text style={styles.miniSub}>
                {s.contactPerson}
                {s.contactPhone ? ` · ${s.contactPhone}` : ''}
              </Text>
            ) : null}
            {s.contactEmail ? (
              <Pressable onPress={() => void Linking.openURL(`mailto:${s.contactEmail}`)}>
                <Text style={styles.link}>{s.contactEmail}</Text>
              </Pressable>
            ) : null}
            <View style={styles.badgeRow}>
              {s.engagementStage ? <CrmStatusBadge label={s.engagementStage} compact /> : null}
              {s.aidaStatus ? <CrmStatusBadge label={s.aidaStatus} compact /> : null}
            </View>
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'calendar') {
    const followUps = entityFollowUps(entity)
    if (!followUps.length) return <EmptyState icon="calendar-alt" title="No follow-ups scheduled" />
    return (
      <View style={styles.section}>
        {followUps.map((f, idx) => (
          <View key={f.id || idx} style={[styles.miniCard, f.completed && styles.completedCard]}>
            <View style={styles.rowBetween}>
              <Text style={styles.miniTitle}>{f.type || 'Follow-up'}</Text>
              {f.completed ? (
                <FontAwesome5 name="check-circle" size={14} color={erp.success} />
              ) : (
                <FontAwesome5 name="clock" size={14} color={erp.warning} />
              )}
            </View>
            <Text style={styles.miniSub}>
              {[formatDate(f.date), f.time].filter(Boolean).join(' at ')}
            </Text>
            {f.description ? <Text style={styles.bodyText}>{f.description}</Text> : null}
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'activity') {
    const log = entityActivityLog(entity)
    const comments = entityComments(entity)
    if (!log.length && !comments.length) {
      return <EmptyState icon="history" title="No activity yet" />
    }
    return (
      <View style={styles.section}>
        {log.map((item, idx) => (
          <View key={item.id || `log-${idx}`} style={styles.timelineCard}>
            <View style={styles.timelineDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineType}>{item.type || 'Activity'}</Text>
              <Text style={styles.bodyText}>{item.description || '—'}</Text>
              <Text style={styles.timelineMeta}>
                {[item.user || item.userName, formatDate(item.timestamp)].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        ))}
        {comments.map((c, idx) => (
          <View key={c.id || `c-${idx}`} style={styles.commentCard}>
            <Text style={styles.bodyText}>{c.text || c.content || '—'}</Text>
            <Text style={styles.timelineMeta}>
              {[formatCommentAuthor(c), formatDate(c.createdAt || c.timestamp)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'opportunities') {
    if (loadingExtras) return <ActivityIndicator color={erp.primary} style={{ marginTop: 24 }} />
    if (!opportunities.length) return <EmptyState icon="bullseye" title="No opportunities" />
    return (
      <View style={styles.section}>
        {opportunities.map((opp) => (
          <View key={opp.id} style={styles.miniCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.miniTitle}>{opp.name || opp.title || 'Opportunity'}</Text>
              {opp.isStarred ? <FontAwesome5 name="star" solid size={12} color="#f59e0b" /> : null}
            </View>
            {(opp.value ?? 0) > 0 ? (
              <Text style={styles.valueText}>{formatMoney(opp.value)}</Text>
            ) : null}
            <View style={styles.badgeRow}>
              {opp.status ? <CrmStatusBadge label={opp.status} compact /> : null}
              {opp.engagementStage ? <CrmStatusBadge label={opp.engagementStage} compact /> : null}
            </View>
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'projects') {
    const projects = entityProjects(entity)
    if (!projects.length) return <EmptyState icon="folder-open" title="No linked projects" />
    return (
      <View style={styles.section}>
        {projects.map((p) => (
          <View key={p.id} style={styles.miniCard}>
            <Text style={styles.miniTitle}>{p.name || p.id}</Text>
            {p.status ? <CrmStatusBadge label={p.status} compact /> : null}
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'proposals') {
    const proposals = entityProposals(entity)
    if (!proposals.length) return <EmptyState icon="clipboard-list" title="No proposals" />
    return (
      <View style={styles.section}>
        {proposals.map((p, idx) => (
          <View key={p.id || idx} style={styles.miniCard}>
            <Text style={styles.miniTitle}>{p.title || 'Proposal'}</Text>
            {(p.amount ?? 0) > 0 ? <Text style={styles.valueText}>{formatMoney(p.amount)}</Text> : null}
            {p.status ? <CrmStatusBadge label={p.status} compact /> : null}
            {p.expiryDate ? (
              <Text style={styles.miniSub}>Expires {formatDate(p.expiryDate)}</Text>
            ) : null}
            {p.workingDocumentLink ? (
              <Pressable onPress={() => void Linking.openURL(p.workingDocumentLink!)}>
                <Text style={styles.link}>Open document</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'contracts') {
    const contracts = entityContracts(entity)
    if (!contracts.length) return <EmptyState icon="file-contract" title="No contracts" />
    return (
      <View style={styles.section}>
        {contracts.map((c, idx) => (
          <View key={c.id || idx} style={styles.miniCard}>
            <Text style={styles.miniTitle}>{c.name || 'Contract'}</Text>
            {c.type ? <Text style={styles.miniSub}>{c.type}</Text> : null}
            {c.uploadDate ? <Text style={styles.miniSub}>Uploaded {formatDate(c.uploadDate)}</Text> : null}
            {c.url ? (
              <Pressable onPress={() => void Linking.openURL(c.url!)}>
                <Text style={styles.link}>View file</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'services') {
    const services = entityServices(entity)
    if (!services.length) return <EmptyState icon="wrench" title="No service records" />
    return (
      <View style={styles.section}>
        {services.map((s, idx) => (
          <View key={s.id || idx} style={styles.miniCard}>
            <Text style={styles.miniTitle}>{s.name || 'Service'}</Text>
            {s.description ? <Text style={styles.miniSub}>{s.description}</Text> : null}
            {(s.price ?? 0) > 0 ? <Text style={styles.valueText}>{formatMoney(s.price)}</Text> : null}
            {s.status ? <CrmStatusBadge label={s.status} compact /> : null}
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'jobcards') {
    if (loadingExtras) return <ActivityIndicator color={erp.primary} style={{ marginTop: 24 }} />
    if (!jobCards.length) return <EmptyState icon="clipboard-list" title="No job cards" />
    return (
      <View style={styles.section}>
        {jobCards.map((jc) => (
          <View key={jc.id} style={styles.miniCard}>
            <Text style={styles.miniTitle}>{jc.jobCardNumber || jc.id}</Text>
            <Text style={styles.miniSub}>
              {[jc.siteName, jc.reasonForVisit].filter(Boolean).join(' · ') || jc.agentName || '—'}
            </Text>
            {jc.status ? <CrmStatusBadge label={jc.status} compact /> : null}
            {jc.createdAt ? <Text style={styles.miniSub}>{formatDate(jc.createdAt)}</Text> : null}
          </View>
        ))}
      </View>
    )
  }

  if (tab === 'kyc') {
    const kyc = entity.kyc
    if (!kyc) return <EmptyState icon="id-card" title="No KYC on file" />
    return (
      <View style={styles.section}>
        <InfoRow label="Client type" value={kyc.clientType} />
        <InfoRow label="Legal name" value={kyc.legalEntity?.registeredLegalName} />
        <InfoRow label="Trading name" value={kyc.legalEntity?.tradingName} />
        <InfoRow label="Registration no." value={kyc.legalEntity?.registrationNumber} />
        <InfoRow label="VAT no." value={kyc.legalEntity?.vatNumber} />
        <InfoRow label="Registered address" value={kyc.legalEntity?.registeredAddress} />
        <InfoRow label="Industry sector" value={kyc.businessProfile?.industrySector} />
        <InfoRow label="Activities" value={kyc.businessProfile?.coreBusinessActivities} />
        {kyc.directorsNotes ? <InfoRow label="Directors notes" value={kyc.directorsNotes} /> : null}
        {kyc.ubosNotes ? <InfoRow label="UBO notes" value={kyc.ubosNotes} /> : null}
      </View>
    )
  }

  if (tab === 'notes') {
    const comments = entityComments(entity)
    return (
      <View style={styles.section}>
        <View style={styles.panelCard}>
          <View style={styles.panelHeader}>
            <FontAwesome5 name="sticky-note" size={14} color={erp.primary} />
            <Text style={styles.panelTitle}>Summary notes</Text>
          </View>
          <Text style={styles.panelHint}>
            Edit below, then tap Save summary in the bar at the bottom.
          </Text>
          <TextInput
            style={styles.notesInput}
            multiline
            value={notesDraft}
            onChangeText={onNotesDraftChange}
            placeholder="General notes about this record…"
            placeholderTextColor={erp.textSubtle}
            textAlignVertical="top"
          />
        </View>

        {entityType === 'client' ? (
          <>
            <View style={styles.panelCard}>
              <View style={styles.panelHeader}>
                <FontAwesome5 name="list-alt" size={14} color={erp.primary} />
                <Text style={styles.panelTitle}>Client notes</Text>
                {clientNotes.length > 0 ? (
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{clientNotes.length}</Text>
                  </View>
                ) : null}
              </View>
              {loadingExtras ? (
                <ActivityIndicator color={erp.primary} style={{ marginVertical: 12 }} />
              ) : clientNotes.length ? (
                clientNotes.map((note) => (
                  <View key={note.id} style={styles.noteCard}>
                    <Text style={styles.miniTitle}>{note.title || 'Note'}</Text>
                    <Text style={styles.bodyText}>{note.content || '—'}</Text>
                    <Text style={styles.timelineMeta}>
                      {[note.author?.name, formatDate(note.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.miniSub}>No structured notes yet — add one below.</Text>
              )}
              <TextInput
                style={[styles.notesInput, { marginTop: 12 }]}
                multiline
                value={newNoteDraft}
                onChangeText={onNewNoteDraftChange}
                placeholder="Add a new client note…"
                placeholderTextColor={erp.textSubtle}
                textAlignVertical="top"
              />
              {newNoteDraft.trim() ? (
                <Text style={styles.panelHint}>Tap Add note in the bottom bar when ready.</Text>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.panelCard}>
            <View style={styles.panelHeader}>
              <FontAwesome5 name="comments" size={14} color={erp.primary} />
              <Text style={styles.panelTitle}>Discussion</Text>
            </View>
            {comments.length ? (
              comments.map((c, idx) => (
                <View key={c.id || `lead-c-${idx}`} style={styles.noteCard}>
                  <Text style={styles.bodyText}>{c.text || c.content || '—'}</Text>
                  <Text style={styles.timelineMeta}>
                    {[formatCommentAuthor(c), formatDate(c.createdAt || c.timestamp)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.miniSub}>
                No discussion comments yet. Use summary notes above for lead notes — they sync with the web CRM.
              </Text>
            )}
          </View>
        )}
      </View>
    )
  }

  return null
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  section: { gap: 10 },
  highlightCard: {
    backgroundColor: erp.primarySoft,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.primaryMuted
  },
  highlightLabel: { fontSize: 11, fontWeight: '700', color: erp.primary, textTransform: 'uppercase' },
  highlightValue: { fontSize: 24, fontWeight: '800', color: erp.text, marginTop: 4 },
  highlightSub: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    borderWidth: 1,
    borderColor: erp.border
  },
  tagText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  infoRow: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: erp.textSubtle,
    textTransform: 'uppercase',
    marginBottom: 4
  },
  infoValue: { fontSize: 15, color: erp.text, lineHeight: 21 },
  groupCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border,
    gap: 8
  },
  groupTitle: { fontSize: 14, fontWeight: '800', color: erp.text },
  groupItem: { fontSize: 14, color: erp.textMuted, fontWeight: '600' },
  miniCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 4,
    gap: 4,
    ...erp.shadowSm
  },
  panelCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    gap: 10,
    ...erp.shadowSm
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: erp.text },
  panelHint: { fontSize: 12, color: erp.textSubtle, lineHeight: 17 },
  countPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  countPillText: { fontSize: 11, fontWeight: '800', color: erp.primary },
  noteCard: {
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.md,
    padding: 12,
    gap: 4,
    marginTop: 4
  },
  completedCard: { opacity: 0.72 },
  miniTitle: { fontSize: 15, fontWeight: '800', color: erp.text },
  miniSub: { fontSize: 13, color: erp.textMuted },
  bodyText: { fontSize: 14, color: erp.text, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryBadge: { fontSize: 11, fontWeight: '800', color: erp.success },
  link: { color: erp.primary, fontWeight: '600', fontSize: 14, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  valueText: { fontSize: 14, fontWeight: '800', color: erp.success },
  timelineCard: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: erp.primary,
    marginTop: 5
  },
  timelineType: { fontSize: 12, fontWeight: '800', color: erp.primary, textTransform: 'uppercase' },
  timelineMeta: { fontSize: 11, color: erp.textSubtle, marginTop: 4 },
  commentCard: {
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.md,
    padding: 12,
    marginBottom: 6
  },
  emptyWrap: { alignItems: 'center', padding: 36, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: erp.textMuted, textAlign: 'center' },
  notesInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    padding: 12,
    backgroundColor: erp.surfaceMuted,
    color: erp.text,
    fontSize: 15,
    lineHeight: 22
  }
  })
}