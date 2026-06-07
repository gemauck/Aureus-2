import React, { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import { tabCount } from '../detailTabs'
import type { CrmDetailTab, CrmDetailTabConfig, CrmEntityBase } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  tabs: CrmDetailTabConfig[]
  active: CrmDetailTab
  entity: CrmEntityBase
  onSelect: (tab: CrmDetailTab) => void
  extras?: { opportunities?: number; jobCards?: number; clientNotes?: number; groupMembers?: number }
}

export function CrmDetailTabBar({ tabs, active, entity, onSelect, extras }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const scrollRef = useRef<ScrollView>(null)
  const tabIndex = tabs.findIndex((t) => t.key === active)

  useEffect(() => {
    if (tabIndex < 0 || !scrollRef.current) return
    // Nudge active tab into view (approximate chip width)
    scrollRef.current.scrollTo({ x: Math.max(0, tabIndex * 108 - 24), animated: true })
  }, [tabIndex])

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {tabs.map((t) => {
          const isActive = active === t.key
          const count = tabCount(t.key, entity, extras)
          const label = t.shortLabel || t.label
          return (
            <Pressable
              key={t.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelect(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <FontAwesome5
                name={t.icon}
                size={12}
                color={isActive ? '#fff' : erp.textMuted}
                solid={isActive}
              />
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]} numberOfLines={1}>
                {label}
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
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  wrap: {
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border,
    ...erp.shadowSm
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
    flexDirection: 'row'
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    borderWidth: 1,
    borderColor: erp.border,
    minHeight: 40,
    marginRight: 8
  },
  chipActive: {
    backgroundColor: erp.primary,
    borderColor: erp.primary
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: erp.textMuted,
    maxWidth: 140
  },
  chipLabelActive: { color: '#fff' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: erp.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeText: { fontSize: 11, fontWeight: '800', color: erp.textMuted },
  badgeTextActive: { color: '#fff' }
  })
}