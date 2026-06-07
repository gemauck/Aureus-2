import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import type { CrmEntityBase, CrmGroup, CrmTab } from '../types'
import {
  displayClientStatus,
  displayLeadStage,
  entityContacts,
  entitySites,
  formatDate,
  formatMoney,
  groupMemberCount,
  resolveStarredState
} from '../utils'
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
  const isClient = tab === 'clients'
  const isGroup = tab === 'groups'
  const clientStatus = isClient ? displayClientStatus(entity) : ''
  const stage = isClient ? clientStatus : isGroup ? '' : displayLeadStage(entity)
  const contacts = entityContacts(entity)
  const sites = entitySites(entity)
  const members = isGroup ? groupMemberCount(entity as CrmGroup) : 0
  const value = tab === 'leads' ? (entity as { value?: number }).value : undefined
  const tint = avatarTint(entity.name || '', erp)
  const starred = resolveStarredState(entity)

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
        <Text style={[styles.avatarText, { color: tint.fg }]}>
          {(entity.name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name || 'Unnamed'}
          </Text>
          {starred ? <FontAwesome5 name="star" solid size={11} color="#f59e0b" style={styles.star} /> : null}
        </View>
        <View style={styles.subRow}>
          {entity.industry ? (
            <Text style={styles.industry} numberOfLines={1}>
              {entity.industry}
            </Text>
          ) : null}
          {isGroup ? (
            <Text style={styles.metaChip}>
              <FontAwesome5 name="users" size={9} color={erp.textMuted} /> {members} member
              {members === 1 ? '' : 's'}
            </Text>
          ) : stage ? (
            <CrmStatusBadge label={stage} compact />
          ) : null}
        </View>
        <View style={styles.metaRow}>
          {!isGroup && contacts.length ? (
            <Text style={styles.metaChip}>
              <FontAwesome5 name="user" size={9} color={erp.textMuted} /> {contacts.length}
            </Text>
          ) : null}
          {!isGroup && sites.length ? (
            <Text style={styles.metaChip}>
              <FontAwesome5 name="map-marker-alt" size={9} color={erp.textMuted} /> {sites.length}
            </Text>
          ) : null}
          {entity.lastContact ? (
            <Text style={styles.lastContact} numberOfLines={1}>
              {formatDate(entity.lastContact)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.trailing}>
        {value != null && value > 0 ? (
          <Text style={styles.value}>{formatMoney(value)}</Text>
        ) : null}
        <FontAwesome5 name="chevron-right" size={11} color={erp.textSubtle} />
      </View>
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: erp.surface,
      borderRadius: erp.radius.md,
      paddingVertical: 9,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 6,
      ...erp.shadowSm
    },
    pressed: { opacity: 0.94 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10
    },
    avatarText: { fontSize: 15, fontWeight: '800' },
    main: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    name: { flex: 1, fontSize: 15, fontWeight: '800', color: erp.text },
    star: { marginLeft: 6 },
    subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
    industry: { fontSize: 12, color: erp.textMuted, flexShrink: 1, marginRight: 8, marginBottom: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
    metaChip: { fontSize: 11, color: erp.textMuted, fontWeight: '600', marginRight: 10 },
    lastContact: { fontSize: 11, color: erp.textSubtle, flex: 1 },
    trailing: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 6, minWidth: 14 },
    value: { fontSize: 11, fontWeight: '800', color: erp.success, marginBottom: 4 }
  })
}
