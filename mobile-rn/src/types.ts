export type User = {
  id: string
  email: string
  name?: string
  role?: string
  /** JSON string or array from User.permissions — mirrors web PermissionChecker. */
  permissions?: string | string[]
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  user: User
}

export type ApiError = {
  code?: string
  message: string
}
