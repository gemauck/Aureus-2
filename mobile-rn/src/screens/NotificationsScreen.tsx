import React, { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleListScreen } from '../components/shell/ModuleListScreen'
import { erpApi, type DashboardNotification } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'

import type { RootStackParamList } from '../navigation/types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>

function parseConversationId(item: DashboardNotification): string | null {
  const link = item.link || ''
  const match = link.match(/conversation=([^&]+)/)
  if (match?.[1]) return decodeURIComponent(match[1])
  return null
}

export function NotificationsScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()

  const loadItems = useCallback(async () => {
    if (!accessToken) return []
    return erpApi.getNotifications(accessToken, 50)
  }, [accessToken])

  const onPressItem = (item: DashboardNotification) => {
    const conversationId = parseConversationId(item)
    if (conversationId) {
      navigation.navigate('Messages', {
        screen: 'Chat',
        params: { conversationId, title: item.title || 'Chat' }
      } as never)
      return
    }
    if (item.link?.includes('/messages') || item.link?.includes('#/messages')) {
      navigation.navigate('Messages')
      return
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
      onItemPress={onPressItem}
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