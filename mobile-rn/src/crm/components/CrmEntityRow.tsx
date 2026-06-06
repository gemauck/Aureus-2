import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import type { CrmEntityBase, CrmTab } from '../types'
import { displayStage, entityContacts, entityFollowUps, entitySites, formatDate, formatMoney } from '../utils'
import { CrmStatusBadge } from './CrmStatusBadge'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  entity: CrmEntityBase
  tab: CrmTab
  onPress: () => void
}

function avatarTint(name: string, erp: ErpTheme): { bg: string; fg: string } {
  const palette = [
    { bg: erp.primarySoft, fg: erp.primary },
    { bg: erp.successSoft, fg: erp.success },
    { bg: erp.warningSoft, fg: erp.warning },
    { bg: '#ede9fe', fg: '#7c3aed' }
  ]
  const code = (name || '?').charCodeAt(0)
  return palette[code % palette.length]
}

export function CrmEntityRow({ entity, tab, onPress }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const stage = displayStage(entity)
  const contacts = entityContacts(entity)
  const sites = entitySites(entity)
  const followUps = entityFollowUps(entity)
  const value = tab === 'leads' ? (entity as { value?: number }).value : undefined
  const tint = avatarTint(entity.name || '', erp)

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
          <Text style={[styles.avatarText, { color: tint.fg }]}>
            {(entity.name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {entity.name || 'Unnamed'}
            </Text>
            {entity.isStarred ? (
              <FontAwesome5 name="star" solid size={13} color="#f59e0b" style={styles.star} />
            ) : null}
          </View>
          {entity.industry ? (
            <Text style={styles.industry} numberOfLines={1}>
              {entity.industry}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {stage ? <CrmStatusBadge label={stage} compact /> : null}
            {contacts.length ? (
              <View style={styles.metaChip}>
                <FontAwesome5 name="user" size={10} color={erp.textMuted} />
                <Text style={styles.metaChipText}>{contacts.length}</Text>
              </View>
            ) : null}
            {sites.length ? (
              <View style={styles.metaChip}>
                <FontAwesome5 name="map-marker-alt" size={10} color={erp.textMuted} />
                <Text style={styles.metaChipText}>{sites.length}</Text>
              </View>
            ) : null}
            {followUps.length ? (
              <View style={styles.metaChip}>
                <FontAwesome5 name="calendar-alt" size={10} color={erp.textMuted} />
                <Text style={styles.metaChipText}>{followUps.length}</Text>
              </View>
            ) : null}
          </View>
          {entity.lastContact ? (
            <Text style={styles.lastContact}>Last contact · {formatDate(entity.lastContact)}</Text>
          ) : null}
        </View>
        <View style={styles.trailing}>
          {value != null && value > 0 ? (
            <Text style={styles.value}>{formatMoney(value)}</Text>
          ) : null}
          <FontAwesome5 name="chevron-right" size={12} color={erp.textSubtle} />
        </View>
      </View>
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    card: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 10,
      ...erp.shadowSm
    },
    pressed: { opacity: 0.94 },
    topRow: { flexDirection: 'row', alignItems: 'flex-start' },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12
    },
    avatarText: { fontSize: 18, fontWeight: '800' },
    main: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
    name: { flex: 1, fontSize: 16, fontWeight: '800', color: erp.text, lineHeight: 21 },
    star: { marginLeft: 6, marginTop: 3 },
    industry: { fontSize: 13, color: erp.textMuted, marginTop: 2 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 10 },
    metaChip: { flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 4 },
    metaChipText: { fontSize: 12, color: erp.textMuted, fontWeight: '600', marginLeft: 4 },
    lastContact: { fontSize: 12, color: erp.textSubtle, marginTop: 8 },
    trailing: { alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 46, marginLeft: 8 },
    value: { fontSize: 12, fontWeight: '800', color: erp.success, marginBottom: 8 }
  })
}
