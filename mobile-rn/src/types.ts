export type User = {
  id: string
  email: string
  name?: string
  role?: string
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
