export type UserRole = 'superadmin' | 'admin' | 'manager' | 'user' | 'guest'

export type ErpUserRecord = {
  id: string
  email: string
  name: string
  role?: string
  status?: string
  department?: string
  phone?: string
  permissions?: string[]
  accessibleProjectIds?: string[]
  createdAt?: string
  lastLoginAt?: string
  lastSeenAt?: string
}

export type UserInvitation = {
  id: string
  email: string
  name?: string
  role?: string
  department?: string
  status?: string
  expiresAt?: string
  createdAt?: string
  accessibleProjectIds?: string[] | string
}

export type UserFormData = {
  name: string
  email: string
  phone: string
  role: string
  department: string
  status: string
  customPermissions: string[]
  accessibleProjectIds: string[]
}

export type InviteFormData = {
  name: string
  email: string
  role: string
  department: string
  accessibleProjectIds: string[]
}
