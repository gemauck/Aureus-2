import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { FontAwesome5 } from '@expo/vector-icons'

import { useAppShell } from './AppShellContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { useChatEvents } from '../../messages/ChatEventsContext'
import { useNotificationUnread } from '../../notifications/NotificationUnreadContext'

type NavLike = { navigate: (name: string) => void }

type Props = {
  title: string
  subtitle?: string
  navigation?: NavLike
  showNotifications?: boolean
  showMessages?: boolean
  notificationBadgeCount?: number
  messageBadgeCount?: number
  onNotificationsPress?: () => void
  onMessagesPress?: () => void
  onSettingsPress?: () => void
  rightSlot?: React.ReactNode
}

export function AppHeader({
  title,
  subtitle,
  navigation,
  showNotifications = true,
  showMessages = true,
  notificationBadgeCount,
  messageBadgeCount,
  onNotificationsPress,
  onMessagesPress,
  onSettingsPress,
  rightSlot
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { openMenu } = useAppShell()
  const { unreadCount: ctxNotifUnread } = useNotificationUnread()
  const { chatUnread: ctxChatUnread } = useChatEvents()
  const navFromContext = useNavigation<NavLike>()

  const nav = navigation ?? navFromContext

  const resolvedNotifCount = notificationBadgeCount ?? ctxNotifUnread
  const resolvedMsgCount = messageBadgeCount ?? ctxChatUnread
  const resolvedNotifPress =
    onNotificationsPress ?? (nav ? () => nav.navigate('Notifications') : undefined)
  const resolvedMsgPress =
    onMessagesPress ?? (nav ? () => nav.navigate('Messages') : undefined)

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
          {showMessages && resolvedMsgPress ? (
            <Pressable
              style={styles.iconBtn}
              onPress={resolvedMsgPress}
              hitSlop={8}
              accessibilityLabel={
                resolvedMsgCount > 0 ? `${resolvedMsgCount} unread messages` : 'Messages'
              }
            >
              <FontAwesome5 name="comments" size={17} color={erp.textMuted} />
              {resolvedMsgCount > 0 ? (
                <View style={styles.messageBadge}>
                  <Text style={styles.badgeText}>
                    {resolvedMsgCount > 99 ? '99+' : resolvedMsgCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {showNotifications ? (
            <Pressable
              style={styles.iconBtn}
              onPress={resolvedNotifPress}
              hitSlop={8}
              accessibilityLabel="Notifications"
            >
              <FontAwesome5 name="bell" size={19} color={erp.textMuted} />
              {resolvedNotifCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {resolvedNotifCount > 99 ? '99+' : resolvedNotifCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {onSettingsPress ? (
            <Pressable
              style={styles.iconBtn}
              onPress={onSettingsPress}
              hitSlop={8}
              accessibilityLabel="Notification settings"
            >
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
  messageBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: erp.primary,
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
