import { request } from '../services/apiClient'
import { normalizeInvitation, normalizeUser } from './utils'
import type { ErpUserRecord, InviteFormData, UserFormData, UserInvitation } from './types'
import { statusForApi } from './utils'

export const usersApi = {
  listUsersAndInvitations(token: string) {
    return request<{ users?: unknown[]; invitations?: unknown[] }>('/api/users', { token }).then(
      (data) => ({
        users: (data.users || []).map((u) => normalizeUser(u as Record<string, unknown>)),
        invitations: (data.invitations || []).map((i) =>
          normalizeInvitation(i as Record<string, unknown>)
        )
      })
    )
  },

  getUser(token: string, userId: string) {
    return request<{ user?: unknown }>(`/api/users/${encodeURIComponent(userId)}`, { token }).then(
      (data) => normalizeUser((data.user || data) as Record<string, unknown>)
    )
  },

  createUser(token: string, form: UserFormData) {
    return request<{
      user?: ErpUserRecord
      tempPassword?: string
      message?: string
      emailSent?: boolean
    }>('/api/users', {
      token,
      method: 'POST',
      body: {
        name: form.name,
        email: form.email,
        role: form.role,
        department: form.department,
        phone: form.phone,
        status: statusForApi(form.status),
        accessibleProjectIds: form.accessibleProjectIds,
        permissions: form.customPermissions
      }
    })
  },

  updateUser(token: string, userId: string, form: UserFormData) {
    return request<{ user?: ErpUserRecord; message?: string }>('/api/users', {
      token,
      method: 'PUT',
      body: {
        userId,
        name: form.name,
        email: form.email,
        role: form.role,
        status: statusForApi(form.status),
        department: form.department,
        phone: form.phone,
        accessibleProjectIds: form.accessibleProjectIds,
        permissions: form.customPermissions
      }
    })
  },

  toggleUserStatus(token: string, user: ErpUserRecord) {
    const next = user.status === 'Active' ? 'Inactive' : 'Active'
    return request<{ user?: ErpUserRecord }>('/api/users', {
      token,
      method: 'PUT',
      body: {
        userId: user.id,
        status: statusForApi(next)
      }
    })
  },

  deleteUser(token: string, userId: string) {
    return request<{ message?: string }>(`/api/users/${encodeURIComponent(userId)}`, {
      token,
      method: 'DELETE'
    })
  },

  inviteUser(token: string, form: InviteFormData) {
    return request<{ message?: string; invitation?: UserInvitation; invitationLink?: string }>(
      '/api/users/invite',
      {
        token,
        method: 'POST',
        body: {
          email: form.email,
          name: form.name || form.email.split('@')[0],
          role: form.role,
          department: form.department,
          accessibleProjectIds: form.accessibleProjectIds
        }
      }
    )
  },

  resendInvitation(token: string, invitationId: string) {
    return request<{ message?: string; emailSent?: boolean }>(
      `/api/users/invitation/${encodeURIComponent(invitationId)}`,
      { token, method: 'POST' }
    )
  },

  deleteInvitation(token: string, invitationId: string) {
    return request<{ message?: string }>(
      `/api/users/invitation/${encodeURIComponent(invitationId)}`,
      { token, method: 'DELETE' }
    )
  }
}
