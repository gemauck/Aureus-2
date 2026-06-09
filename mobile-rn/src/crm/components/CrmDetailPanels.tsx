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

import { CrmQuickAdd } from './CrmQuickAdd'
import { CrmStatusBadge } from './CrmStatusBadge'
import type {
  CrmClientNote,
  CrmDetailTab,
  CrmEntityBase,
  CrmGroup,
  CrmGroupMember,
  CrmJobCard,
  CrmLead,
  CrmOpportunity,
  CrmTag
} from '../types'
import {
  displayClientStatus,
  displayLeadStage,
  entityActivityLog,
  entityComments,
  entityContacts,
  entityFollowUps,
  entityProjects,
  entityProposals,
  entityServices,
  entitySites,
  formatCommentAuthor,
  formatDate,
  formatMoney,
  groupMemberCount,
  clientEngagementStageFromAccountStatus,
  isCrmLead,
  newLocalId
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
  entityType: 'client' | 'lead' | 'group'
  tags: CrmTag[]
  opportunities: CrmOpportunity[]
  jobCards: CrmJobCard[]
  incidentReports?: Array<Record<string, unknown>>
  clientNotes: CrmClientNote[]
  groupMembers?: CrmGroupMember[]
  notesDraft: string
  newNoteDraft: string
  loadingExtras: boolean
  patchBusy?: boolean
  onNotesDraftChange: (v: string) => void
  onNewNoteDraftChange: (v: string) => void
  onPatchEntity: (body: Record<string, unknown>) => Promise<void>
  onCreateOpportunity?: (body: { title: string; value?: number }) => Promise<void>
  onOpenMember?: (member: CrmGroupMember) => void
  onOpenProject?: (projectId: string, projectName?: string) => void
  onReportIncident?: (prefill: {
    clientId?: string
    clientName?: string
    siteId?: string
    siteName?: string
  }) => void
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
    groupMembers = [],
    notesDraft,
    newNoteDraft,
    loadingExtras,
    patchBusy,
    onNotesDraftChange,
    onNewNoteDraftChange,
    onPatchEntity,
    onCreateOpportunity,
    onOpenMember,
    onOpenProject
  } = props

  const isLead = entityType === 'lead'
  const isClient = entityType === 'client'
  const isGroup = entityType === 'group'
  const hasStructuredNotes = isClient || isGroup

  const clientStatus = displayClientStatus(entity)
  const leadStage = displayLeadStage(entity)

  if (tab === 'overview') {
    const lead = isLead ? (entity as CrmLead) : null
    return (
      <View style={styles.section}>
        {lead && (lead.value ?? 0) > 0 ? (
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>Lead value</Text>
            <Text style={styles.highlightValue}>{formatMoney(lead.value)}</Text>
            {lead.probability != null ? (
              <Text style={styles.highlightSub}>{lead.probability}% probability</Text>
            ) : null}
          </View>
        ) : null}
        {(entity.revenue ?? 0) > 0 && !isGroup ? (
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
        {isGroup ? (
          <>
            <InfoRow label="Industry" value={entity.industry} />
            <InfoRow
              label="Members"
              value={String(groupMembers.length || groupMemberCount(entity as CrmGroup))}
            />
            <InfoRow label="Created" value={formatDate(entity.createdAt)} />
          </>
        ) : isClient ? (
          <>
            <InfoRow label="Industry" value={entity.industry} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <View style={styles.statusRow}>
                {(['Active', 'Inactive'] as const).map((option) => {
                  const selected = clientStatus === option
                  return (
                    <Pressable
                      key={option}
                      style={[
                        styles.statusPill,
                        selected && styles.statusPillSelected,
                        patchBusy && styles.statusPillDisabled
                      ]}
                      disabled={patchBusy || selected}
                      onPress={() =>
                        void onPatchEntity({
                          status: option,
                          engagementStage: clientEngagementStageFromAccountStatus(option)
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          selected && styles.statusPillTextSelected
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
            <InfoRow label="Last contact" value={formatDate(entity.lastContact)} />
            <InfoRow label="Address" value={entity.address} />
          </>
        ) : (
          <>
            <InfoRow label="Industry" value={entity.industry} />
            <InfoRow label="Engagement stage" value={leadStage} />
            <InfoRow label="AIDA status" value={entity.aidaStatus || undefined} />
            <InfoRow label="Last contact" value={formatDate(entity.lastContact)} />
            <InfoRow label="Address" value={entity.address} />
          </>
        )}
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
        {entity.groupMemberships?.length && !isGroup ? (
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

  if (tab === 'members') {
    if (loadingExtras && !groupMembers.length) {
      return <ActivityIndicator color={erp.primary} style={{ marginTop: 24 }} />
    }
    if (!groupMembers.length) {
      return <EmptyState icon="users" title="No members in this group" />
    }
    return (
      <View style={styles.section}>
        {groupMembers.map((member) => {
          const memberIsLead = isCrmLead(member)
          return (
            <Pressable
              key={member.id}
              style={styles.miniCard}
              onPress={() => onOpenMember?.(member)}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.miniTitle}>{member.name || 'Unnamed'}</Text>
                <FontAwesome5 name="chevron-right" size={11} color={erp.textSubtle} />
              </View>
              <View style={styles.badgeRow}>
                <CrmStatusBadge label={memberIsLead ? 'Lead' : 'Client'} compact />
                {member.industry ? <CrmStatusBadge label={member.industry} compact /> : null}
              </View>
            </Pressable>
          )
        })}
      </View>
    )
  }

  if (tab === 'contacts') {
    const contacts = entityContacts(entity)
    return (
      <View style={styles.section}>
        <CrmQuickAdd
          label="Add contact"
          busy={patchBusy}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'email', label: 'Email', keyboardType: 'email-address' },
            { key: 'phone', label: 'Phone', keyboardType: 'phone-pad' },
            { key: 'role', label: 'Role' }
          ]}
          onSubmit={async (values) => {
            await onPatchEntity({
              contacts: [
                ...contacts,
                {
                  id: newLocalId('contact'),
                  name: values.name,
                  email: values.email || undefined,
                  phone: values.phone || undefined,
                  role: values.role || undefined
                }
              ]
            })
          }}
        />
        {!contacts.length ? (
          <EmptyState icon="address-book" title="No contacts on file" />
        ) : (
          contacts.map((c, idx) => (
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
          ))
        )}
      </View>
    )
  }

  if (tab === 'sites') {
    const sites = entitySites(entity)
    return (
      <View style={styles.section}>
        <CrmQuickAdd
          label="Add site"
          busy={patchBusy}
          fields={[
            { key: 'name', label: 'Site name', required: true },
            { key: 'address', label: 'Address', multiline: true },
            { key: 'contactPerson', label: 'Contact person' },
            { key: 'contactPhone', label: 'Contact phone', keyboardType: 'phone-pad' }
          ]}
          onSubmit={async (values) => {
            await onPatchEntity({
              sites: [
                ...sites,
                {
                  id: newLocalId('site'),
                  name: values.name,
                  siteName: values.name,
                  address: values.address || undefined,
                  contactPerson: values.contactPerson || undefined,
                  contactPhone: values.contactPhone || undefined,
                  aidaStatus: isLead ? 'Awareness' : undefined,
                  engagementStage: isLead ? 'Potential' : undefined
                }
              ]
            })
          }}
        />
        {!sites.length ? (
          <EmptyState icon="map-marker-alt" title="No sites linked" />
        ) : (
          sites.map((s, idx) => (
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
              {isLead ? (
                <View style={styles.badgeRow}>
                  {s.engagementStage ? <CrmStatusBadge label={s.engagementStage} compact /> : null}
                  {s.aidaStatus ? <CrmStatusBadge label={s.aidaStatus} compact /> : null}
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>
    )
  }

  if (tab === 'calendar') {
    const followUps = entityFollowUps(entity)
    const today = new Date().toISOString().slice(0, 10)
    return (
      <View style={styles.section}>
        <CrmQuickAdd
          label="Add follow-up"
          busy={patchBusy}
          fields={[
            { key: 'type', label: 'Type', placeholder: 'Call, meeting, email…' },
            { key: 'date', label: 'Date (YYYY-MM-DD)', placeholder: today, required: true },
            { key: 'description', label: 'Notes', multiline: true }
          ]}
          onSubmit={async (values) => {
            await onPatchEntity({
              followUps: [
                ...followUps,
                {
                  id: newLocalId('followup'),
                  type: values.type || 'Follow-up',
                  date: values.date,
                  description: values.description || undefined,
                  completed: false
                }
              ]
            })
          }}
        />
        {!followUps.length ? (
          <EmptyState icon="calendar-alt" title="No follow-ups scheduled" />
        ) : (
          followUps.map((f, idx) => (
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
          ))
        )}
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
    return (
      <View style={styles.section}>
        {onCreateOpportunity ? (
          <CrmQuickAdd
            label="Add opportunity"
            busy={patchBusy}
            fields={[
              { key: 'title', label: 'Title', required: true },
              { key: 'value', label: 'Value (ZAR)', keyboardType: 'numeric' }
            ]}
            onSubmit={async (values) => {
              const value = values.value ? parseFloat(values.value.replace(/[^\d.]/g, '')) : 0
              await onCreateOpportunity({
                title: values.title,
                value: Number.isFinite(value) ? value : 0
              })
            }}
          />
        ) : null}
        {!opportunities.length ? (
          <EmptyState icon="bullseye" title="No opportunities" />
        ) : (
          opportunities.map((opp) => (
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
          ))
        )}
      </View>
    )
  }

  if (tab === 'projects') {
    const projects = entityProjects(entity)
    if (!projects.length) return <EmptyState icon="folder-open" title="No linked projects" />
    return (
      <View style={styles.section}>
        {projects.map((p) => (
          <Pressable
            key={p.id}
            style={styles.miniCard}
            disabled={!onOpenProject}
            onPress={onOpenProject ? () => onOpenProject(p.id, p.name) : undefined}
          >
            <View style={styles.miniCardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniTitle}>{p.name || p.id}</Text>
                {p.status ? <CrmStatusBadge label={p.status} compact /> : null}
              </View>
              {onOpenProject ? (
                <FontAwesome5 name="chevron-right" size={12} color={erp.textSubtle} />
              ) : null}
            </View>
          </Pressable>
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

  if (tab === 'services') {
    const services = entityServices(entity)
    const incidents = props.incidentReports || []
    const hasJobCards = jobCards.length > 0
    const hasIncidents = incidents.length > 0
    const hasServices = services.length > 0
    if (loadingExtras && !hasJobCards && !hasIncidents && !hasServices) {
      return <ActivityIndicator color={erp.primary} style={{ marginTop: 24 }} />
    }
    if (!hasServices && !hasJobCards && !hasIncidents) {
      return <EmptyState icon="wrench" title="No service or job card records" />
    }
    return (
      <View style={styles.section}>
        {entityType === 'client' && props.onReportIncident ? (
          <Pressable
            style={styles.incidentAction}
            onPress={() =>
              props.onReportIncident?.({
                clientId: entity.id,
                clientName: entity.name || '',
                siteName: entitySites(entity)[0]?.name || ''
              })
            }
          >
            <FontAwesome5 name="exclamation-triangle" size={14} color={erp.warning} />
            <Text style={styles.incidentActionText}>Report incident for this client</Text>
          </Pressable>
        ) : null}
        {hasServices ? (
          <>
            <Text style={styles.sectionHeading}>Service records</Text>
            {services.map((s, idx) => (
              <View key={s.id || idx} style={styles.miniCard}>
                <Text style={styles.miniTitle}>{s.name || 'Service'}</Text>
                {s.description ? <Text style={styles.miniSub}>{s.description}</Text> : null}
                {(s.price ?? 0) > 0 ? <Text style={styles.valueText}>{formatMoney(s.price)}</Text> : null}
                {s.status ? <CrmStatusBadge label={s.status} compact /> : null}
              </View>
            ))}
          </>
        ) : null}
        {hasIncidents ? (
          <>
            <Text style={[styles.sectionHeading, (hasServices || hasJobCards) && styles.sectionHeadingSpaced]}>
              Incident reports
            </Text>
            {incidents.map((inc) => {
              const id = String(inc.id || '')
              return (
                <View key={id} style={styles.miniCard}>
                  <Text style={styles.miniTitle}>{String(inc.incidentNumber || id)}</Text>
                  <Text style={styles.miniSub}>
                    {[inc.incidentType, inc.siteName].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  {inc.status ? <CrmStatusBadge label={String(inc.status)} compact /> : null}
                  {inc.incidentAt || inc.createdAt ? (
                    <Text style={styles.miniSub}>{formatDate(String(inc.incidentAt || inc.createdAt))}</Text>
                  ) : null}
                </View>
              )
            })}
          </>
        ) : null}
        {hasJobCards ? (
          <>
            <Text style={[styles.sectionHeading, (hasServices || hasIncidents) && styles.sectionHeadingSpaced]}>
              Job cards
            </Text>
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
          </>
        ) : null}
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

        {hasStructuredNotes ? (
          <>
            <View style={styles.panelCard}>
              <View style={styles.panelHeader}>
                <FontAwesome5 name="list-alt" size={14} color={erp.primary} />
                <Text style={styles.panelTitle}>
                  {isGroup ? 'Group notes' : 'Client notes'}
                </Text>
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
                placeholder={isGroup ? 'Add a new group note…' : 'Add a new client note…'}
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
              <Text style={styles.panelTitle}>Lead notes</Text>
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
              <Text style={styles.miniSub}>No lead notes yet — add one below.</Text>
            )}
            <TextInput
              style={[styles.notesInput, { marginTop: 12 }]}
              multiline
              value={newNoteDraft}
              onChangeText={onNewNoteDraftChange}
              placeholder="Add a new lead note…"
              placeholderTextColor={erp.textSubtle}
              textAlignVertical="top"
            />
            {newNoteDraft.trim() ? (
              <Text style={styles.panelHint}>Tap Add note in the bottom bar when ready.</Text>
            ) : null}
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
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: erp.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  sectionHeadingSpaced: { marginTop: 8 },
  highlightCard: {
    backgroundColor: erp.primarySoft,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.primary
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
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  statusPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: erp.radius.md,
    borderWidth: 1,
    borderColor: erp.border,
    backgroundColor: erp.surfaceMuted
  },
  statusPillSelected: {
    borderColor: erp.primary,
    backgroundColor: erp.primarySoft
  },
  statusPillDisabled: { opacity: 0.7 },
  statusPillText: { fontSize: 14, fontWeight: '700', color: erp.textMuted },
  statusPillTextSelected: { color: erp.primary },
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
  incidentAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: erp.warningSoft,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.warning,
    marginBottom: 12
  },
  incidentActionText: { flex: 1, fontSize: 14, fontWeight: '700', color: erp.text },
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
  miniCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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