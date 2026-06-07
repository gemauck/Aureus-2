import type { DashboardJobCard, DashboardNotification, DashboardTask } from '../services/erpApi'
import type { RootStackParamList } from '../navigation/types'
import {
  navigateJobCards,
  navigateManufacturingWeb,
  navigateMyTasks,
  navigateProjects,
  navigateRoot,
  type RootNavigation
} from '../navigation/navigationHelpers'
import { navigateFromNotification } from '../notifications/notificationNavigation'

type NavLike = Pick<RootNavigation, 'navigate'>

export function openNotification(navigation: NavLike, item: DashboardNotification) {
  if (!navigateFromNotification(navigation, item)) {
    navigateRoot(navigation, 'Notifications')
  }
}

export function openTask(navigation: NavLike, task: DashboardTask) {
  if (task.taskType === 'user') {
    navigateMyTasks(navigation, 'UserTaskDetail', { taskId: task.id })
    return
  }
  if (task.projectId) {
    navigateRoot(navigation, 'Projects', {
      screen: 'TaskDetail',
      params: {
        taskId: task.id,
        projectId: task.projectId,
        projectName: task.projectName
      }
    })
    return
  }
  navigateRoot(navigation, 'MyTasks')
}

export function openProject(
  navigation: NavLike,
  projectId: string,
  opts?: { initialTab?: string }
) {
  navigateProjects(navigation, 'ProjectDetail', { projectId, initialTab: opts?.initialTab })
}

export function openModule(navigation: NavLike, screen: keyof RootStackParamList) {
  navigateRoot(navigation, screen)
}

export function openJobCard(navigation: NavLike, card: DashboardJobCard) {
  if (!card?.id) {
    navigateJobCards(navigation)
    return
  }
  navigateJobCards(navigation, { jobCardId: card.id })
}

export function openManufacturingTab(
  navigation: NavLike,
  tab: import('../manufacturing/constants').ManufacturingTabId,
  opts?: { title?: string; query?: Record<string, string> }
) {
  navigateManufacturingWeb(navigation, tab, opts)
}
