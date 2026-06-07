import { request } from '../services/apiClient'
import type { UserNote, UserNoteActivity } from './types'

export const userNotesApi = {
  listNotes(token: string) {
    return request<{ notes: UserNote[] }>('/api/user-notes', { token }).then((d) => d.notes || [])
  },

  getNote(token: string, noteId: string) {
    return request<{ note: UserNote }>(`/api/user-notes/${encodeURIComponent(noteId)}`, { token }).then(
      (d) => d.note
    )
  },

  createNote(token: string, body: Record<string, unknown>) {
    return request<{ note: UserNote }>('/api/user-notes', {
      method: 'POST',
      token,
      body
    }).then((d) => d.note)
  },

  updateNote(token: string, noteId: string, body: Record<string, unknown>) {
    return request<{ note: UserNote }>(`/api/user-notes/${encodeURIComponent(noteId)}`, {
      method: 'PUT',
      token,
      body
    }).then((d) => d.note)
  },

  deleteNote(token: string, noteId: string) {
    return request(`/api/user-notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE',
      token
    })
  },

  shareNote(token: string, noteId: string, sharedWith: string[]) {
    return request<{ note: UserNote }>(`/api/user-notes/${encodeURIComponent(noteId)}/share`, {
      method: 'POST',
      token,
      body: { sharedWith }
    }).then((d) => d.note)
  },

  listClients(token: string) {
    return request<{ clients?: Array<{ id: string; name?: string }> }>('/api/clients', { token }).then(
      (d) => d.clients || []
    )
  },

  listProjects(token: string, clientId?: string) {
    const q = new URLSearchParams({ limit: '500' })
    if (clientId) q.set('clientId', clientId)
    return request<{ projects?: Array<{ id: string; name?: string; clientId?: string }> }>(
      `/api/projects?${q}`,
      { token }
    ).then((d) => d.projects || [])
  },

  listUsers(token: string) {
    return request<{ users?: Array<{ id: string; name?: string; email?: string }> } | Array<{ id: string; name?: string; email?: string }>>(
      '/api/users',
      { token }
    ).then((d) => (Array.isArray(d) ? d : d.users || []))
  },

  listNoteActivity(token: string, projectId: string, noteId: string) {
    const q = new URLSearchParams({ projectId, noteId })
    return request<{ logs?: UserNoteActivity[]; activities?: UserNoteActivity[] }>(
      `/api/project-activity-logs?${q}`,
      { token }
    ).then((d) => d.logs || d.activities || [])
  }
}
