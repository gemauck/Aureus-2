import { isCrmClient, isCrmGroup } from '../crm/utils'
import { request } from './apiClient'

export type DashboardTask = {
  id: string
  title?: string
  name?: string
  status?: string
  projectName?: string
  projectId?: string
  dueDate?: string
  priority?: string
  category?: string
  taskType?: 'project' | 'user'
}

export type DashboardNotification = {
  id: string
  type?: string
  title?: string
  message?: string
  read?: boolean
  createdAt?: string
  link?: string
}

/** Chat messages use MessageCenter badge; exclude from bell/notifications list (matches web). */
export const NOTIFICATION_BELL_EXCLUDE_TYPES = 'message'

function notificationsQuery(limit: number, extra?: Record<string, string>) {
  const q = new URLSearchParams({ limit: String(limit) })
  q.set('excludeTypes', NOTIFICATION_BELL_EXCLUDE_TYPES)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
  }
  return `/api/notifications?${q.toString()}`
}

export type DashboardJobCard = {
  id: string
  jobCardNumber?: string
  clientName?: string
  projectName?: string
  status?: string
  createdAt?: string
  agentName?: string
}

function normalizeProjectTask(raw: Record<string, unknown>): DashboardTask {
  const project = raw.project as { name?: string } | undefined
  return {
    id: String(raw.id),
    title: (raw.title as string) || (raw.name as string),
    name: raw.name as string | undefined,
    status: raw.status as string | undefined,
    projectId: raw.projectId as string | undefined,
    projectName: (raw.projectName as string) || project?.name,
    dueDate: raw.dueDate as string | undefined,
    priority: raw.priority as string | undefined,
    taskType: 'project'
  }
}

function normalizeUserTask(raw: Record<string, unknown>): DashboardTask {
  const project = raw.project as { name?: string } | undefined
  return {
    id: String(raw.id),
    title: raw.title as string | undefined,
    status: raw.status as string | undefined,
    projectId: raw.projectId as string | undefined,
    projectName: project?.name,
    dueDate: raw.dueDate as string | undefined,
    priority: raw.priority as string | undefined,
    category: raw.category as string | undefined,
    taskType: 'user'
  }
}

export function mergeDashboardTasks(userTasks: unknown[], projectTasks: unknown[]): DashboardTask[] {
  const seen = new Set<string>()
  const merged: DashboardTask[] = []
  for (const raw of userTasks) {
    const t = normalizeUserTask(raw as Record<string, unknown>)
    if (!t.id || seen.has(t.id)) continue
    seen.add(t.id)
    merged.push(t)
  }
  for (const raw of projectTasks) {
    const t = normalizeProjectTask(raw as Record<string, unknown>)
    if (!t.id || seen.has(t.id)) continue
    seen.add(t.id)
    merged.push(t)
  }
  return merged
}

export const erpApi = {
  getProjectTasks(token: string) {
    return request<{ tasks?: unknown[] } | unknown[]>('/api/tasks?lightweight=true', {
      token
    }).then((data) => {
      const list = Array.isArray(data) ? data : data.tasks || []
      return list.map((raw) => normalizeProjectTask(raw as Record<string, unknown>))
    })
  },

  getUserTasks(token: string) {
    return request<{ tasks?: unknown[] } | unknown[]>('/api/user-tasks?lightweight=true', {
      token
    }).then((data) => {
      const list = Array.isArray(data) ? data : data.tasks || []
      return list.map((raw) => normalizeUserTask(raw as Record<string, unknown>))
    })
  },

  getNotifications(token: string, limit = 8) {
    return request<{ notifications?: DashboardNotification[]; unreadCount?: number } | DashboardNotification[]>(
      notificationsQuery(limit),
      { token }
    ).then((data) => {
      if (Array.isArray(data)) return data
      return data.notifications || []
    })
  },

  getNotificationUnreadCount(token: string) {
    return request<{ unreadCount?: number }>(notificationsQuery(1), { token, silent: true }).then(
      (d) => d.unreadCount ?? 0
    )
  },

  markNotificationsRead(token: string, notificationIds: string[]) {
    if (!notificationIds.length) return Promise.resolve()
    return request('/api/notifications', {
      method: 'PATCH',
      token,
      body: { read: true, notificationIds }
    })
  },

  getRecentJobCards(token: string, limit = 6) {
    const q = new URLSearchParams({
      page: '1',
      pageSize: String(limit),
      sortField: 'createdAt',
      sortDirection: 'desc'
    })
    return request<{ jobCards?: DashboardJobCard[] }>(`/api/jobcards?${q}`, { token }).then(
      (d) => d.jobCards || []
    )
  },

  getProjectsSummary(token: string) {
    return request<{ projects?: Array<{ id: string; name: string; status?: string }> } | Array<{ id: string; name: string; status?: string }>>('/api/projects?limit=500', {
      token
    }).then((data) => {
      const projects = Array.isArray(data) ? data : data.projects || []
      const active = projects.filter(
        (p) => p.status === 'Active' || p.status === 'In Progress' || p.status === 'active'
      )
      return { total: projects.length, active: active.length }
    })
  },

  getClientsSummary(token: string) {
    return request<{ clients?: Array<{ id: string; type?: string | null }> }>('/api/clients', {
      token
    }).then((d) => {
      const clients = (d.clients || []).filter((c) => isCrmClient(c) && !isCrmGroup(c))
      return { total: clients.length }
    })
  },

  getChatUnreadCount(token: string) {
    return request<{ unreadCount: number }>('/api/chat/unread', { token, silent: true }).then(
      (d) => d.unreadCount || 0
    )
  }
}
