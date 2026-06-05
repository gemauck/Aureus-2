import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'
import { tabCount } from '../detailTabs'
import type { CrmDetailTab, CrmDetailTabConfig, CrmEntityBase } from '../types'

type Props = {
  tabs: CrmDetailTabConfig[]
  active: CrmDetailTab
  entity: CrmEntityBase
  onSelect: (tab: CrmDetailTab) => void
  extras?: { opportunities?: number; jobCards?: number; clientNotes?: number }
}

export function CrmDetailTabBar({ tabs, active, entity, onSelect, extras }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.content}
    >
      {tabs.map((t) => {
        const isActive = active === t.key
        const count = tabCount(t.key, entity, extras)
        return (
          <Pressable
            key={t.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelect(t.key)}
          >
            <FontAwesome5
              name={t.icon}
              size={11}
              color={isActive ? erp.primary : erp.textMuted}
              solid={isActive}
            />
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {t.shortLabel || t.label}
            </Text>
            {count != null && count > 0 ? (
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border,
    maxHeight: 52
  },
  content: { paddingHorizontal: 8, alignItems: 'center' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabActive: { borderBottomColor: erp.primary },
  label: { fontSize: 12, fontWeight: '700', color: erp.textMuted, maxWidth: 120 },
  labelActive: { color: erp.primary },
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    alignItems: 'center'
  },
  badgeActive: { backgroundColor: erp.primarySoft },
  badgeText: { fontSize: 10, fontWeight: '800', color: erp.textMuted },
  badgeTextActive: { color: erp.primary }
})
