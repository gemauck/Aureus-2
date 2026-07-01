import { apiUrl } from '../config'
import { fetchWithTokenRefresh, request } from '../services/apiClient'
import type {
  DepartmentNotes,
  DiscussionReply,
  MeetingActionItem,
  MonthlyMeetingNotes,
  SarsChange,
  SarsStats,
  Team,
  TeamDiscussion,
  TeamDocument,
  TeamMembership,
  TeamWorkflow,
  WeeklyMeetingNotes
} from './types'

type ErpUser = { id: string; name?: string; email?: string; avatar?: string; role?: string }

export const teamsApi = {
  listTeams(token: string) {
    return request<{ teams: Team[] }>('/api/teams', { token }).then((d) => d.teams || [])
  },

  getTeam(token: string, teamId: string) {
    return request<{ team: Team }>(`/api/teams/${encodeURIComponent(teamId)}`, { token }).then((d) => d.team)
  },

  listMembers(token: string, teamId: string) {
    return request<{ members: TeamMembership[] }>(
      `/api/teams/${encodeURIComponent(teamId)}/members`,
      { token }
    ).then((d) => d.members || [])
  },

  addMember(token: string, teamId: string, userId: string, role = 'member') {
    return request<{ members: TeamMembership[] }>(`/api/teams/${encodeURIComponent(teamId)}/members`, {
      token,
      method: 'POST',
      body: { userId, role }
    }).then((d) => d.members?.[0])
  },

  removeMember(token: string, teamId: string, userId: string) {
    return request(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
      token,
      method: 'DELETE'
    })
  },

  listDiscussions(token: string, teamId: string, params?: { type?: string; pinned?: boolean }) {
    const q = new URLSearchParams({ teamId })
    if (params?.type) q.set('type', params.type)
    if (params?.pinned !== undefined) q.set('pinned', String(params.pinned))
    return request<{ discussions: TeamDiscussion[] }>(`/api/teams/discussions?${q}`, { token }).then(
      (d) => d.discussions || []
    )
  },

  getDiscussion(token: string, discussionId: string) {
    return request<{ discussion: TeamDiscussion }>(
      `/api/teams/discussions/${encodeURIComponent(discussionId)}`,
      { token }
    ).then((d) => d.discussion)
  },

  createDiscussion(
    token: string,
    body: {
      teamId: string
      title: string
      body?: string
      type?: string
      pinned?: boolean
      authorId?: string
      authorName?: string
    }
  ) {
    return request<{ discussion: TeamDiscussion }>('/api/teams/discussions', {
      token,
      method: 'POST',
      body
    }).then((d) => d.discussion)
  },

  updateDiscussion(
    token: string,
    discussionId: string,
    body: { title?: string; body?: string; type?: string; pinned?: boolean }
  ) {
    return request<{ discussion: TeamDiscussion }>(
      `/api/teams/discussions/${encodeURIComponent(discussionId)}`,
      { token, method: 'PUT', body }
    ).then((d) => d.discussion)
  },

  deleteDiscussion(token: string, discussionId: string) {
    return request(`/api/teams/discussions/${encodeURIComponent(discussionId)}`, {
      token,
      method: 'DELETE'
    })
  },

  addReply(
    token: string,
    discussionId: string,
    body: { body: string; authorId?: string; authorName?: string; attachments?: unknown[] }
  ) {
    return request<{ reply: DiscussionReply }>(
      `/api/teams/discussions/${encodeURIComponent(discussionId)}/replies`,
      { token, method: 'POST', body }
    ).then((d) => d.reply)
  },

  updateReply(token: string, discussionId: string, replyId: string, body: string) {
    return request<{ reply: DiscussionReply }>(
      `/api/teams/discussions/${encodeURIComponent(discussionId)}/replies/${encodeURIComponent(replyId)}`,
      { token, method: 'PUT', body: { body } }
    ).then((d) => d.reply)
  },

  deleteReply(token: string, discussionId: string, replyId: string) {
    return request(
      `/api/teams/discussions/${encodeURIComponent(discussionId)}/replies/${encodeURIComponent(replyId)}`,
      { token, method: 'DELETE' }
    )
  },

  listDocuments(token: string, teamId: string) {
    return request<{ documents: TeamDocument[] }>(
      `/api/teams/documents?teamId=${encodeURIComponent(teamId)}`,
      { token }
    ).then((d) => d.documents || [])
  },

  getDocument(token: string, documentId: string) {
    return request<{ document: TeamDocument }>(
      `/api/teams/documents/${encodeURIComponent(documentId)}`,
      { token }
    ).then((d) => d.document)
  },

  listWorkflows(token: string, teamId: string) {
    return request<{ workflows: TeamWorkflow[] }>(
      `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}`,
      { token }
    ).then((d) => d.workflows || [])
  },

  getWorkflow(token: string, workflowId: string) {
    return request<{ workflow: TeamWorkflow }>(
      `/api/teams/workflows/${encodeURIComponent(workflowId)}`,
      { token }
    ).then((d) => d.workflow)
  },

  uploadFile(token: string, name: string, dataUrl: string, folder = 'team-process-hub') {
    return request<{ url: string; name: string; mimeType?: string; size?: number }>('/api/files', {
      token,
      method: 'POST',
      body: { name, dataUrl, folder }
    })
  },

  listUsers(token: string) {
    return request<{ users: ErpUser[] }>('/api/users', { token }).then((d) => d.users || [])
  },

  // Meeting notes (admin only)
  listMeetingMonths(token: string) {
    return request<{ monthlyNotes: MonthlyMeetingNotes[] }>('/api/meeting-notes', { token }).then(
      (d) => d.monthlyNotes || []
    )
  },

  getMeetingMonth(token: string, monthKey: string, options?: { bustCache?: boolean }) {
    const q = new URLSearchParams({ monthKey })
    if (options?.bustCache) q.set('_t', String(Date.now()))
    return request<{ monthlyNotes: MonthlyMeetingNotes | null }>(`/api/meeting-notes?${q}`, { token }).then(
      (d) => d.monthlyNotes
    )
  },

  updateWeeklyNotes(token: string, id: string, data: Partial<WeeklyMeetingNotes>) {
    return request<{ weeklyNotes: WeeklyMeetingNotes }>('/api/meeting-notes?action=weekly', {
      token,
      method: 'PUT',
      body: { id, ...data }
    }).then((d) => d.weeklyNotes)
  },

  updateDepartmentNotes(token: string, data: Partial<DepartmentNotes> & { id?: string; weeklyNotesId?: string; departmentId?: string }) {
    return request<{ departmentNotes: DepartmentNotes }>('/api/meeting-notes?action=department', {
      token,
      method: 'PUT',
      body: data
    }).then((d) => d.departmentNotes)
  },

  createActionItem(token: string, data: Partial<MeetingActionItem>) {
    return request<{ actionItem: MeetingActionItem }>('/api/meeting-notes?action=action-item', {
      token,
      method: 'POST',
      body: data
    }).then((d) => d.actionItem)
  },

  updateActionItem(token: string, data: Partial<MeetingActionItem> & { id: string }) {
    return request<{ actionItem: MeetingActionItem }>('/api/meeting-notes?action=action-item', {
      token,
      method: 'PUT',
      body: data
    }).then((d) => d.actionItem)
  },

  deleteActionItem(token: string, id: string) {
    return request(`/api/meeting-notes?action=action-item&id=${encodeURIComponent(id)}`, {
      token,
      method: 'DELETE'
    })
  },

  generateMeetingMonth(token: string, monthKey: string) {
    return request<{ monthlyNotes: MonthlyMeetingNotes }>('/api/meeting-notes?action=generate-month', {
      token,
      method: 'POST',
      body: { monthKey }
    }).then((d) => d.monthlyNotes)
  },

  // SARS monitoring
  listSarsChanges(
    token: string,
    filters?: { isNew?: boolean; isRead?: boolean; category?: string; priority?: string }
  ) {
    const q = new URLSearchParams({ action: 'list', limit: '200' })
    if (filters?.isNew !== undefined) q.set('isNew', String(filters.isNew))
    if (filters?.isRead !== undefined) q.set('isRead', String(filters.isRead))
    if (filters?.category) q.set('category', filters.category)
    if (filters?.priority) q.set('priority', filters.priority)
    return request<{ changes: SarsChange[]; data?: { changes?: SarsChange[] } }>(`/api/sars-monitoring/check?${q}`, { token }).then(
      (d) => d.changes || d.data?.changes || []
    )
  },

  getSarsStats(token: string) {
    return request<SarsStats & { data?: SarsStats }>('/api/sars-monitoring/check?action=stats', { token }).then(
      (d) => (d.total !== undefined ? d : d.data || {})
    )
  },

  triggerSarsCheck(token: string) {
    return request('/api/sars-monitoring/check?action=check', { token })
  },

  markSarsRead(token: string, changeIds: string[]) {
    return request('/api/sars-monitoring/check?action=mark-read', {
      token,
      method: 'POST',
      body: { changeIds }
    })
  },

  async uploadMultipart(
    token: string,
    path: string,
    file: { uri: string; name: string; type?: string },
    extraFields?: Record<string, string>
  ) {
    const form = new FormData()
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream'
    } as unknown as Blob)
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) form.append(k, v)
    }
    const url = apiUrl(path)
    let response = await fetchWithTokenRefresh(url, {
      method: 'POST',
      token,
      body: form
    })
    let payload: { data?: unknown; error?: { message?: string }; success?: boolean }
    try {
      payload = await response.json()
    } catch {
      throw new Error(`Invalid response (${response.status})`)
    }
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Upload failed')
    }
    return payload.data ?? payload
  },

  processPoaExcel(token: string, file: { uri: string; name: string; type?: string }) {
    return teamsApi.uploadMultipart(token, '/api/poa-review/process-excel', file)
  },

  processDfrrWorkbook(
    token: string,
    file: { uri: string; name: string; type?: string },
    checks: Record<string, boolean>
  ) {
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(checks)) fields[k] = String(v)
    return teamsApi.uploadMultipart(token, '/api/fuel-refund-audit/process', file, fields)
  }
}
