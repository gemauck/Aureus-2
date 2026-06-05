import React, { useCallback } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleListScreen } from '../components/shell/ModuleListScreen'
import { erpApi } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'
import type { RootStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>

export function NotificationsScreen({ navigation }: Props) {
  const { accessToken } = useAuth()

  const loadItems = useCallback(async () => {
    if (!accessToken) return []
    return erpApi.getNotifications(accessToken, 50)
  }, [accessToken])

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
    />
  )
}
