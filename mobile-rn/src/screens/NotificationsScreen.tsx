import React, { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleListScreen } from '../components/shell/ModuleListScreen'
import { erpApi, type DashboardNotification } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'
import type { TeamTabId } from '../teams/types'

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

type TeamsDeepLink = {
  teamId?: string
  tab?: TeamTabId
  discussionId?: string
  monthKey?: string
  weekKey?: string
}

function parseTeamsLink(item: DashboardNotification): TeamsDeepLink | null {
  const link = item.link || ''
  if (!link.includes('/teams') && !link.includes('#/teams')) return null

  const hashPart = link.includes('#') ? link.split('#')[1] || '' : link
  const pathMatch = hashPart.match(/\/?teams\/([^?]+)?/)
  const query = hashPart.includes('?') ? hashPart.split('?')[1] : link.includes('?') ? link.split('?')[1] : ''
  const params = new URLSearchParams(query)

  const teamId = pathMatch?.[1] || params.get('team') || undefined
  const tab = (params.get('tab') as TeamTabId | null) || undefined
  const discussionId = params.get('discussion') || undefined
  const monthKey = params.get('month') || params.get('monthKey') || undefined
  const weekKey = params.get('week') || params.get('weekKey') || undefined

  if (!teamId && !discussionId && !monthKey) return null
  return { teamId, tab, discussionId, monthKey, weekKey }
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

    const teams = parseTeamsLink(item)
    if (teams?.teamId) {
      if (teams.tab === 'meeting-notes') {
        navigation.navigate('Teams', {
          screen: 'MeetingNotes',
          params: { teamId: teams.teamId, monthKey: teams.monthKey, weekKey: teams.weekKey }
        } as never)
        return
      }
      navigation.navigate('Teams', {
        screen: 'TeamDetail',
        params: {
          teamId: teams.teamId,
          initialTab: teams.tab,
          discussionId: teams.discussionId
        }
      } as never)
      return
    }

    if (teams?.discussionId) {
      navigation.navigate('Teams', {
        screen: 'DiscussionDetail',
        params: { teamId: teams.teamId || 'unknown', discussionId: teams.discussionId }
      } as never)
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
