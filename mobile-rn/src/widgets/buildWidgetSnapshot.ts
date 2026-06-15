import type { DashboardJobCard, DashboardNotification, DashboardTask } from '../services/erpApi'
import { mergeDashboardTasks } from '../services/erpApi'
import type { User } from '../types'
import type { WidgetSnapshot } from './widgetSnapshot'

export function buildWidgetSnapshot({
  user,
  projectTasks,
  userTasks,
  unreadNotifications,
  activeProjects,
  totalProjects,
  jobCards
}: {
  user: User | null
  projectTasks: DashboardTask[]
  userTasks: DashboardTask[]
  unreadNotifications: number
  activeProjects: number
  totalProjects: number
  jobCards: DashboardJobCard[]
}): WidgetSnapshot {
  const combined = mergeDashboardTasks(userTasks, projectTasks)
  const openTasks = combined.filter((task) => {
    const status = String(task.status || '').toLowerCase()
    return !status.includes('complete') && !status.includes('done') && !status.includes('cancel')
  })

  return {
    updatedAt: new Date().toISOString(),
    signedIn: Boolean(user),
    userName: user?.name || user?.email,
    openTaskCount: openTasks.length,
    topTasks: openTasks.slice(0, 3).map((task) => ({
      id: task.id,
      title: task.title || task.name || 'Untitled task'
    })),
    unreadNotifications,
    activeProjects,
    totalProjects,
    openJobCards: jobCards.length
  }
}

export function unreadFromNotifications(notifications: DashboardNotification[], fallback = 0): number {
  const local = notifications.filter((n) => !n.read).length
  return Math.max(local, fallback)
}
