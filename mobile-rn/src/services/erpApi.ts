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
}

export type DashboardNotification = {
  id: string
  title?: string
  message?: string
  read?: boolean
  createdAt?: string
  link?: string
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

export const erpApi = {
  getProjectTasks(token: string) {
    return request<{ tasks?: DashboardTask[] } | DashboardTask[]>('/api/tasks?lightweight=true', {
      token
    }).then((data) => {
      if (Array.isArray(data)) return data
      return data.tasks || []
    })
  },

  getUserTasks(token: string) {
    return request<{ tasks?: DashboardTask[] } | DashboardTask[]>('/api/user-tasks?lightweight=true', {
      token
    }).then((data) => {
      if (Array.isArray(data)) return data
      return data.tasks || []
    })
  },

  getNotifications(token: string, limit = 8) {
    return request<{ notifications?: DashboardNotification[] } | DashboardNotification[]>(
      `/api/notifications?limit=${limit}`,
      { token }
    ).then((data) => {
      if (Array.isArray(data)) return data
      return data.notifications || []
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
    return request<{ clients?: Array<{ id: string }> }>('/api/clients', { token }).then((d) => ({
      total: d.clients?.length || 0
    }))
  }
}
