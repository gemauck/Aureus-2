import type { DashboardJobCard, DashboardNotification, DashboardTask } from '../services/erpApi'
import type { RootStackParamList } from '../navigation/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NavLike = { navigate: (...args: any[]) => void }

function parseConversationId(item: DashboardNotification): string | null {
  const link = item.link || ''
  const match = link.match(/conversation=([^&]+)/)
  if (match?.[1]) return decodeURIComponent(match[1])
  return null
}

export function openNotification(navigation: NavLike, item: DashboardNotification) {
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

export function openTask(navigation: NavLike, task: DashboardTask) {
  if (task.taskType === 'user') {
    navigation.navigate('MyTasks', {
      screen: 'UserTaskDetail',
      params: { taskId: task.id }
    } as never)
    return
  }
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

export function openProject(
  navigation: NavLike,
  projectId: string,
  opts?: { initialTab?: string }
) {
  navigation.navigate('Projects', {
    screen: 'ProjectDetail',
    params: { projectId, initialTab: opts?.initialTab }
  } as never)
}

export function openModule(navigation: NavLike, screen: keyof RootStackParamList) {
  navigation.navigate(screen as never)
}

export function openJobCard(navigation: NavLike, card: DashboardJobCard) {
  if (!card?.id) {
    navigation.navigate('JobCards')
    return
  }
  navigation.navigate('JobCards', { jobCardId: card.id } as never)
}
