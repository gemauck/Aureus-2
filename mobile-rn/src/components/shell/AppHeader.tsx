import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FontAwesome5 } from '@expo/vector-icons'

import { useAppShell } from './AppShellContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  title: string
  subtitle?: string
  showNotifications?: boolean
  notificationBadgeCount?: number
  onNotificationsPress?: () => void
  onSettingsPress?: () => void
  rightSlot?: React.ReactNode
}

export function AppHeader({
  title,
  subtitle,
  showNotifications = true,
  notificationBadgeCount = 0,
  onNotificationsPress,
  onSettingsPress,
  rightSlot
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { openMenu } = useAppShell()

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <Pressable style={styles.menuBtn} onPress={openMenu} hitSlop={8} accessibilityLabel="Open menu">
          <FontAwesome5 name="bars" size={18} color={erp.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          {rightSlot}
          {showNotifications ? (
            <Pressable style={styles.iconBtn} onPress={onNotificationsPress} hitSlop={8}>
              <FontAwesome5 name="bell" size={17} color={erp.textMuted} />
              {notificationBadgeCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {notificationBadgeCount > 99 ? '99+' : notificationBadgeCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {onSettingsPress ? (
            <Pressable style={styles.iconBtn} onPress={onSettingsPress} hitSlop={8}>
              <FontAwesome5 name="cog" size={17} color={erp.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: erp.space.md,
    paddingVertical: 12,
    gap: 10
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: erp.radius.md,
    backgroundColor: erp.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: erp.text },
  subtitle: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: erp.radius.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: erp.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800'
  }
  })
}