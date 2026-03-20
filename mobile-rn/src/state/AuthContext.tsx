import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { clearSession, loadSession, saveSession } from '../services/authSession'
import { trackError } from '../services/telemetry'
import type { AuthSession, User } from '../types'

type AuthContextValue = {
  loading: boolean
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AuthSession | null>(null)

  useEffect(() => {
    loadSession()
      .then((stored) => setSession(stored))
      .catch((err) => trackError(err, 'loadSession'))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user: session?.user || null,
      accessToken: session?.accessToken || null,
      refreshToken: session?.refreshToken || null,
      async signIn(email, password) {
        const data = await apiClient.mobileLogin(email, password)
        const nextSession: AuthSession = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user
        }
        setSession(nextSession)
        await saveSession(nextSession)
      },
      async signOut() {
        await apiClient.mobileLogout(session?.refreshToken, session?.accessToken || undefined)
        setSession(null)
        await clearSession()
      },
      async refreshAuth() {
        if (!session?.refreshToken) return
        const refreshed = await apiClient.mobileRefresh(session.refreshToken)
        const nextSession: AuthSession = {
          ...session,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken
        }
        setSession(nextSession)
        await saveSession(nextSession)
      }
    }),
    [loading, session]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
