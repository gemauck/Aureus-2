import React, { useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { AIDA_STAGES, ENGAGEMENT_STAGES } from '../pipeline/constants'
import type { PipelineItem } from '../pipeline/types'
import { normalizeLifecycleStage, normalizeStageToAida } from '../pipeline/utils'
import { formatMoney } from '../utils'
import { CrmStatusBadge } from './CrmStatusBadge'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  item: PipelineItem
  isNested?: boolean
  parentLabel?: string | null
  compact?: boolean
  onPress?: () => void
  onAidaChange?: (stage: string) => void | Promise<void>
  onEngagementChange?: (status: string) => void | Promise<void>
}

function typeIcon(type: PipelineItem['type']) {
  if (type === 'lead') return 'user-plus'
  if (type === 'site') return 'map-marker-alt'
  if (type === 'opportunity') return 'chart-line'
  return 'building'
}

function typeLabel(type: PipelineItem['type'], itemType?: string) {
  if (itemType) return itemType
  if (type === 'lead') return 'Lead'
  if (type === 'site') return 'Site'
  if (type === 'opportunity') return 'Opportunity'
  return 'Client'
}

export function CrmPipelineCard({
  item,
  isNested,
  parentLabel,
  compact,
  onPress,
  onAidaChange,
  onEngagementChange
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [picker, setPicker] = useState<'aida' | 'engagement' | null>(null)
  const [saving, setSaving] = useState(false)

  const aida = normalizeStageToAida(item.aidaStatus ?? item.stage)
  const engagement = normalizeLifecycleStage(item.engagementStage ?? item.status ?? 'Potential')
  const editable = item.type !== 'client'

  const pickOption = async (value: string) => {
    setPicker(null)
    setSaving(true)
    try {
      if (picker === 'aida' && onAidaChange) await onAidaChange(value)
      if (picker === 'engagement' && onEngagementChange) await onEngagementChange(value)
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save change')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          isNested && styles.nested,
          compact && styles.compact,
          pressed && onPress && styles.pressed
        ]}
        onPress={onPress}
        disabled={!onPress}
      >
        <View style={styles.header}>
          <View style={styles.typeIcon}>
            <FontAwesome5 name={typeIcon(item.type)} size={11} color={erp.primary} />
          </View>
          <View style={styles.titleBlock}>
            {isNested && parentLabel ? (
              <Text style={styles.parentMeta} numberOfLines={1}>
                {parentLabel}
              </Text>
            ) : null}
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.typeText}>{typeLabel(item.type, item.itemType)}</Text>
          </View>
          {item.isStarred ? (
            <FontAwesome5 name="star" solid size={12} color="#f59e0b" style={styles.star} />
          ) : null}
        </View>

        {item.clientName && item.type === 'opportunity' ? (
          <Text style={styles.clientName} numberOfLines={1}>
            {item.clientName}
          </Text>
        ) : null}

        <View style={styles.badges}>
          {editable ? (
            <Pressable
              style={styles.badgeBtn}
              onPress={() => setPicker('aida')}
              disabled={saving}
            >
              <CrmStatusBadge label={aida} compact />
              <FontAwesome5 name="chevron-down" size={8} color={erp.textSubtle} />
            </Pressable>
          ) : (
            <CrmStatusBadge label={aida} compact />
          )}
          {editable ? (
            <Pressable
              style={styles.badgeBtn}
              onPress={() => setPicker('engagement')}
              disabled={saving}
            >
              <CrmStatusBadge label={engagement} compact />
              <FontAwesome5 name="chevron-down" size={8} color={erp.textSubtle} />
            </Pressable>
          ) : (
            <CrmStatusBadge label={engagement} compact />
          )}
        </View>

        {item.value > 0 ? <Text style={styles.value}>{formatMoney(item.value)}</Text> : null}
        {item.industry ? (
          <Text style={styles.industry} numberOfLines={1}>
            {item.industry}
          </Text>
        ) : null}
      </Pressable>

      <Modal visible={picker != null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {picker === 'aida' ? 'AIDA stage' : 'Engagement status'}
            </Text>
            {(picker === 'aida' ? AIDA_STAGES : ENGAGEMENT_STAGES).map((option) => {
              const active =
                picker === 'aida'
                  ? normalizeStageToAida(option) === aida
                  : normalizeLifecycleStage(option) === engagement
              return (
                <Pressable
                  key={option}
                  style={[styles.modalRow, active && styles.modalRowActive]}
                  onPress={() => void pickOption(option)}
                >
                  <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                    {option}
                  </Text>
                  {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    card: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.md,
      padding: 12,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 8,
      ...erp.shadowSm
    },
    nested: { marginLeft: 14, borderLeftWidth: 3, borderLeftColor: erp.primarySoft },
    compact: { padding: 10, marginBottom: 6 },
    pressed: { opacity: 0.94 },
    header: { flexDirection: 'row', alignItems: 'flex-start' },
    typeIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: erp.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10
    },
    titleBlock: { flex: 1, minWidth: 0 },
    parentMeta: { fontSize: 10, fontWeight: '700', color: erp.textSubtle, marginBottom: 2 },
    name: { fontSize: 14, fontWeight: '800', color: erp.text },
    typeText: { fontSize: 11, fontWeight: '600', color: erp.textMuted, marginTop: 2 },
    star: { marginLeft: 6, marginTop: 2 },
    clientName: { fontSize: 12, color: erp.textMuted, marginTop: 6 },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' },
    badgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    value: { marginTop: 8, fontSize: 13, fontWeight: '800', color: erp.success },
    industry: { marginTop: 4, fontSize: 11, color: erp.textSubtle },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      justifyContent: 'flex-end'
    },
    modalSheet: {
      backgroundColor: erp.surface,
      borderTopLeftRadius: erp.radius.xl,
      borderTopRightRadius: erp.radius.xl,
      paddingTop: 16,
      paddingBottom: 28,
      maxHeight: '60%'
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: erp.text,
      paddingHorizontal: erp.space.lg,
      marginBottom: 8
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: erp.space.lg,
      borderBottomWidth: 1,
      borderBottomColor: erp.borderLight
    },
    modalRowActive: { backgroundColor: erp.primarySoft },
    modalRowText: { fontSize: 15, fontWeight: '600', color: erp.text, flex: 1 },
    modalRowTextActive: { color: erp.primary, fontWeight: '700' }
  })
}
