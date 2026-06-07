import { request } from '../services/apiClient'
import type {
  ErpUser,
  ProjectActivityEntry,
  ProjectDetail,
  ProjectNote,
  ProjectSummary,
  ProjectTask
} from './types'

export const projectsApi = {
  listProjects(token: string, opts?: { includeTaskCount?: boolean; limit?: number }) {
    const q = new URLSearchParams()
    q.set('limit', String(opts?.limit ?? 500))
    if (opts?.includeTaskCount) q.set('includeTaskCount', 'true')
    return request<{ projects: ProjectSummary[] }>(`/api/projects?${q}`, { token }).then(
      (d) => d.projects || []
    )
  },

  getProjectSummary(token: string, id: string) {
    return request<{ project: ProjectDetail }>(
      `/api/projects/${encodeURIComponent(id)}?summary=1`,
      { token }
    ).then((d) => d.project)
  },

  getProjectFull(token: string, id: string) {
    return request<{ project: ProjectDetail }>(`/api/projects/${encodeURIComponent(id)}`, {
      token
    }).then((d) => d.project)
  },

  patchProject(token: string, id: string, body: Record<string, unknown>) {
    return request<{ project: ProjectDetail }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body
    }).then((d) => d.project)
  },

  listUsers(token: string) {
    return request<{ users?: ErpUser[] } | ErpUser[]>('/api/users', { token }).then((d) =>
      Array.isArray(d) ? d : d.users || []
    )
  },

  listProjectTasks(token: string, projectId: string, includeComments = true) {
    const q = new URLSearchParams({
      projectId,
      includeComments: includeComments ? 'true' : 'false'
    })
    return request<{ tasks: ProjectTask[] }>(`/api/tasks?${q}`, { token }).then((d) => d.tasks || [])
  },

  listAllTasks(token: string) {
    return request<{ tasks: ProjectTask[] }>('/api/tasks?all=true', { token }).then(
      (d) => d.tasks || []
    )
  },

  getTask(token: string, taskId: string) {
    return request<{ task: ProjectTask }>(`/api/tasks?id=${encodeURIComponent(taskId)}`, {
      token
    }).then((d) => d.task)
  },

  createTask(token: string, body: Record<string, unknown>) {
    return request<{ task: ProjectTask }>('/api/tasks', {
      method: 'POST',
      token,
      body
    }).then((d) => d.task)
  },

  patchTask(token: string, taskId: string, body: Record<string, unknown>) {
    return request<{ task: ProjectTask }>(`/api/tasks?id=${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      token,
      body
    }).then((d) => d.task)
  },

  deleteTask(token: string, taskId: string) {
    return request<{ deletedTaskId?: string }>(
      `/api/tasks?id=${encodeURIComponent(taskId)}`,
      { method: 'DELETE', token }
    )
  },

  listNotes(token: string, projectId: string) {
    return request<{ notes: ProjectNote[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/notes`,
      { token }
    ).then((d) => d.notes || [])
  },

  getNote(token: string, projectId: string, noteId: string) {
    return request<{ note: ProjectNote }>(
      `/api/projects/${encodeURIComponent(projectId)}/notes/${encodeURIComponent(noteId)}`,
      { token }
    ).then((d) => d.note)
  },

  createNote(token: string, projectId: string, body: { title?: string; content?: string }) {
    return request<{ note: ProjectNote }>(
      `/api/projects/${encodeURIComponent(projectId)}/notes`,
      { method: 'POST', token, body }
    ).then((d) => d.note)
  },

  updateNote(
    token: string,
    projectId: string,
    noteId: string,
    body: { title?: string; content?: string }
  ) {
    return request<{ note: ProjectNote }>(
      `/api/projects/${encodeURIComponent(projectId)}/notes/${encodeURIComponent(noteId)}`,
      { method: 'PUT', token, body }
    ).then((d) => d.note)
  },

  deleteNote(token: string, projectId: string, noteId: string) {
    return request<{ deleted?: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE', token }
    )
  },

  listActivity(token: string, projectId: string) {
    return request<{ logs: ProjectActivityEntry[] }>(
      `/api/project-activity-logs?projectId=${encodeURIComponent(projectId)}`,
      { token }
    ).then((d) => d.logs || [])
  },

  addTaskComment(
    token: string,
    body: { taskId: string; projectId: string; text: string }
  ) {
    return request<{ comment: TaskCommentResponse }>('/api/task-comments', {
      method: 'POST',
      token,
      body
    }).then((d) => d.comment)
  }
}

type TaskCommentResponse = {
  id: string
  text?: string
  author?: string
  createdAt?: string
}
