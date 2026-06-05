import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'
import type { CrmEntityBase, CrmTab } from '../types'
import { displayStage, entityContacts, entitySites, formatDate, formatMoney } from '../utils'
import { CrmStatusBadge } from './CrmStatusBadge'

type Props = {
  entity: CrmEntityBase
  tab: CrmTab
  onPress: () => void
}

export function CrmEntityRow({ entity, tab, onPress }: Props) {
  const stage = displayStage(entity)
  const contacts = entityContacts(entity)
  const sites = entitySites(entity)
  const value = tab === 'leads' ? (entity as { value?: number }).value : undefined

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(entity.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {entity.name || 'Unnamed'}
            </Text>
            {entity.isStarred ? (
              <FontAwesome5 name="star" solid size={14} color="#f59e0b" style={{ marginLeft: 6 }} />
            ) : null}
          </View>
          {entity.industry ? (
            <Text style={styles.industry} numberOfLines={1}>
              {entity.industry}
            </Text>
          ) : null}
        </View>
        {value != null && value > 0 ? (
          <Text style={styles.value}>{formatMoney(value)}</Text>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        {stage ? <CrmStatusBadge label={stage} compact /> : null}
        {contacts.length ? (
          <Text style={styles.metaChip}>
            <FontAwesome5 name="user" size={10} color={erp.textMuted} /> {contacts.length}
          </Text>
        ) : null}
        {sites.length ? (
          <Text style={styles.metaChip}>
            <FontAwesome5 name="map-marker-alt" size={10} color={erp.textMuted} /> {sites.length}
          </Text>
        ) : null}
      </View>

      {entity.lastContact ? (
        <Text style={styles.lastContact}>Last contact · {formatDate(entity.lastContact)}</Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 10,
    ...erp.shadowSm
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: erp.primary },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: erp.text, lineHeight: 21 },
  industry: { fontSize: 13, color: erp.textMuted, marginTop: 2 },
  value: { fontSize: 13, fontWeight: '800', color: erp.success, marginLeft: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  metaChip: { fontSize: 12, color: erp.textMuted, fontWeight: '600' },
  lastContact: { fontSize: 12, color: erp.textSubtle, marginTop: 10 }
})
