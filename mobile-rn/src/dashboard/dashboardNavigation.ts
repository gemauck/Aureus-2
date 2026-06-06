import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { DashboardNotification, DashboardTask } from '../services/erpApi'
import type { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList>

function parseConversationId(item: DashboardNotification): string | null {
  const link = item.link || ''
  const match = link.match(/conversation=([^&]+)/)
  if (match?.[1]) return decodeURIComponent(match[1])
  return null
}

export function openNotification(navigation: Nav, item: DashboardNotification) {
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
  navigation.navigate('Notifications')
}

export function openTask(navigation: Nav, task: DashboardTask) {
  if (task.projectId) {
    navigation.navigate('Projects', {
      screen: 'TaskDetail',
      params: {
        taskId: task.id,
        projectId: task.projectId,
        projectName: task.projectName
      }
    } as never)
    return
  }
  navigation.navigate('MyTasks')
}

export function openModule(navigation: Nav, screen: keyof RootStackParamList) {
  navigation.navigate(screen as never)
}
