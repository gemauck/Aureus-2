import React, { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleListScreen } from '../components/shell/ModuleListScreen'
import { useNetwork } from '../hooks/useNetwork'
import {
  cacheNotifications,
  offlineListMessage,
  readCachedNotifications
} from '../offline/erpReadCaches'
import { erpApi, type DashboardNotification } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'
import { navigateFromNotification } from '../notifications/notificationNavigation'
import { useNotificationUnread } from '../notifications/NotificationUnreadContext'

import type { RootStackParamList } from '../navigation/types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>

export function NotificationsScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const { refresh: refreshUnread, decrementUnread } = useNotificationUnread()
  const [reloadKey, setReloadKey] = React.useState(0)

  useFocusEffect(
    useCallback(() => {
      setReloadKey((k) => k + 1)
      void refreshUnread()
    }, [refreshUnread])
  )

  const loadItems = useCallback(async () => {
    if (!accessToken) return []
    if (!isOnline) {
      const cached = await readCachedNotifications()
      if (cached?.length) return cached
      throw new Error(offlineListMessage(false))
    }
    try {
      const rows = await erpApi.getNotifications(accessToken, 50)
      await cacheNotifications(rows)
      return rows
    } catch (e) {
      const cached = await readCachedNotifications()
      if (cached?.length) return cached
      throw e
    }
  }, [accessToken, isOnline, reloadKey])

  const onPressItem = async (item: DashboardNotification) => {
    if (accessToken && item.id && !item.read) {
      void erpApi.markNotificationsRead(accessToken, [item.id]).then(() => {
        decrementUnread(1)
        void refreshUnread()
      })
    }
    if (!navigateFromNotification(navigation, item)) {
      navigation.navigate('Dashboard')
    }
  }

  return (
    <ModuleListScreen
      title="Notifications"
      subtitle="Updates from across the ERP"
      navigation={navigation}
      showNotifications={false}
      loadItems={loadItems}
      keyExtractor={(item) => item.id}
      renderTitle={(item) => item.title || item.message || 'Notification'}
      renderSubtitle={(item) => (item.title && item.message ? item.message : undefined)}
      searchFilter={(item, q) =>
        `${item.title || ''} ${item.message || ''}`.toLowerCase().includes(q)
      }
      emptyLabel="No notifications."
      onItemPress={(item) => void onPressItem(item)}
      renderItemExtra={(item) =>
        !item.read ? <View style={styles.unreadDot} /> : null
      }
    />
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: erp.primary,
    marginLeft: 8
  }
  })
}
