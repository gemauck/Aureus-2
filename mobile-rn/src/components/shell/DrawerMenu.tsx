import React, { useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NavigationContainerRef } from '@react-navigation/native'
import { ALL_MENU_ITEMS } from '../../navigation/menuItems'
import type { RootStackParamList } from '../../navigation/types'
import { COMPANY_NAME } from '../../theme/appTheme'
import { useAuth } from '../../state/AuthContext'
import { getVisibleMenuItems } from '../../utils/menuAccess'
import { useAppShell } from './AppShellContext'
import { erpApi } from '../../services/erpApi'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { useNotificationUnread } from '../../notifications/NotificationUnreadContext'

type Props = {
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList>>
  currentRoute?: string
}

function formatRole(role?: string) {
  if (!role) return ''
  const compact = role.toLowerCase().replace(/[\s_-]/g, '')
  if (compact === 'superadmin') return 'SuperAdmin'
  return role
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function DrawerMenu({ navigationRef, currentRoute }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const insets = useSafeAreaInsets()
  const { menuOpen, closeMenu } = useAppShell()
  const { user, signOut, accessToken } = useAuth()
  const [chatUnread, setChatUnread] = useState(0)
  const { unreadCount: notificationUnread } = useNotificationUnread()
  const items = getVisibleMenuItems(user)
  const mainItems = items.filter((i) => i.section !== 'footer')
  const footerItems = items.filter((i) => i.section === 'footer')

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    const load = async () => {
      try {
        const count = await erpApi.getChatUnreadCount(accessToken)
        if (!cancelled) setChatUnread(count)
      } catch {
        if (!cancelled) setChatUnread(0)
      }
    }
    load()
    const id = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [accessToken, menuOpen])

  function navigateTo(screen: keyof RootStackParamList) {
    closeMenu()
    navigationRef.current?.navigate(screen as never)
  }

  function renderItem(item: (typeof ALL_MENU_ITEMS)[number]) {
    const active =
      currentRoute === item.screen ||
      currentRoute === item.id ||
      (item.id === 'service-maintenance' && currentRoute === 'ServiceMaintenance')
    return (
      <Pressable
        key={item.id}
        style={[styles.item, active && styles.itemActive]}
        onPress={() => item.screen && navigateTo(item.screen)}
      >
        <FontAwesome5
          name={item.icon as never}
          size={16}
          color={active ? '#fff' : erp.sidebarTextMuted}
          style={styles.itemIcon}
        />
        <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
        {item.id === 'messages' && chatUnread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{chatUnread > 99 ? '99+' : chatUnread}</Text>
          </View>
        ) : null}
        {item.id === 'notifications' && notificationUnread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {notificationUnread > 99 ? '99+' : notificationUnread}
            </Text>
          </View>
        ) : null}
      </Pressable>
    )
  }

  return (
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={closeMenu} />
        <View style={[styles.panel, { paddingTop: insets.top + 8 }]}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <FontAwesome5 name="th-large" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>{COMPANY_NAME}</Text>
              <Text style={styles.brandSub}>ERP Mobile</Text>
            </View>
            <Pressable onPress={closeMenu} hitSlop={10} style={styles.closeBtn}>
              <FontAwesome5 name="times" size={18} color={erp.sidebarTextMuted} />
            </Pressable>
          </View>

          {user ? (
            <View style={styles.userCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.name || user.email}
                </Text>
                <Text style={styles.userRole}>{formatRole(user.role)}</Text>
              </View>
            </View>
          ) : null}

          <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Menu</Text>
            {mainItems.map(renderItem)}

            {footerItems.length ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Personal</Text>
                {footerItems.map(renderItem)}
              </>
            ) : null}

            <View style={styles.divider} />
            <Pressable style={styles.item} onPress={() => navigateTo('Settings')}>
              <FontAwesome5 name="cog" size={16} color={erp.sidebarTextMuted} style={styles.itemIcon} />
              <Text style={styles.itemLabel}>Settings</Text>
            </Pressable>
            <Pressable style={[styles.item, styles.signOutItem]} onPress={() => void signOut()}>
              <FontAwesome5 name="sign-out-alt" size={16} color="#fca5a5" style={styles.itemIcon} />
              <Text style={[styles.itemLabel, { color: '#fca5a5' }]}>Sign out</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  panel: {
    width: 280,
    maxWidth: '86%',
    backgroundColor: erp.sidebar,
    height: '100%',
    paddingHorizontal: 12,
    paddingBottom: 24
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 16 },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: erp.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brand: { color: '#fff', fontWeight: '800', fontSize: 17 },
  brandSub: { color: erp.sidebarTextMuted, fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 8 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: erp.sidebarHover,
    borderRadius: erp.radius.md,
    padding: 12,
    marginBottom: 12,
    marginHorizontal: 4
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: erp.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  userName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  userRole: { color: erp.sidebarTextMuted, fontSize: 12, marginTop: 2 },
  menuScroll: { flex: 1 },
  sectionLabel: {
    color: erp.sidebarTextMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: erp.radius.md,
    marginBottom: 2
  },
  itemActive: { backgroundColor: erp.sidebarActive },
  itemIcon: { width: 22, textAlign: 'center' },
  itemLabel: { color: erp.sidebarText, fontSize: 15, fontWeight: '500', flex: 1 },
  itemLabelActive: { color: '#fff', fontWeight: '700' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: erp.sidebarHover, marginVertical: 8, marginHorizontal: 8 },
  signOutItem: { marginTop: 4 }
  })
}