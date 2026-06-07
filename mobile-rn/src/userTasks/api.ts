import { request } from '../services/apiClient'
import type { UserTask, UserTaskList, UserTaskTag } from './types'

export const userTasksApi = {
  listTasks(token: string, opts?: { status?: string; includeTags?: boolean }) {
    const q = new URLSearchParams()
    if (opts?.status) q.set('status', opts.status)
    if (opts?.includeTags !== false) q.set('includeTags', 'true')
    const qs = q.toString()
    return request<{ tasks: UserTask[] }>(`/api/user-tasks${qs ? `?${qs}` : ''}`, { token }).then(
      (d) => d.tasks || []
    )
  },

  getTask(token: string, taskId: string) {
    return request<{ task: UserTask }>(`/api/user-tasks/${encodeURIComponent(taskId)}`, { token }).then(
      (d) => d.task
    )
  },

  createTask(token: string, body: Record<string, unknown>) {
    return request<{ task: UserTask }>('/api/user-tasks', {
      method: 'POST',
      token,
      body
    }).then((d) => d.task)
  },

  updateTask(token: string, taskId: string, body: Record<string, unknown>) {
    return request<{ task: UserTask }>(`/api/user-tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      token,
      body
    }).then((d) => d.task)
  },

  deleteTask(token: string, taskId: string) {
    return request(`/api/user-tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      token
    })
  },

  listLists(token: string) {
    return request<{ lists: UserTaskList[] }>('/api/user-task-lists', { token }).then(
      (d) => d.lists || []
    )
  },

  listTags(token: string) {
    return request<{ tags: UserTaskTag[] }>('/api/user-task-tags', { token }).then(
      (d) => d.tags || []
    )
  },

  createTag(token: string, name: string, color = '#3B82F6') {
    return request<{ tag: UserTaskTag }>('/api/user-task-tags', {
      method: 'POST',
      token,
      body: { name, color }
    }).then((d) => d.tag)
  }
}
