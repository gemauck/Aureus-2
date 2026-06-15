import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { apiClient, isUnauthorizedError, refreshAccessToken, registerAuthRefresh } from '../services/apiClient'
import { clearSession, loadSession, saveSession } from '../services/authSession'
import { clearHomeScreenWidgets } from '../widgets/refreshHomeScreenWidgets'
import { trackError } from '../services/telemetry'
import type { AuthSession, User } from '../types'

type RefreshPayload = {
  accessToken: string
  refreshToken: string
  user?: User
}

type AuthContextValue = {
  loading: boolean
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  sessionExpired: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshAuth: () => Promise<void>
  updateTokens: (accessToken: string, refreshToken: string) => Promise<void>
  clearSessionExpired: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function buildSession(current: AuthSession, refreshed: RefreshPayload): AuthSession {
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    user: refreshed.user || current.user
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const sessionRef = useRef<AuthSession | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const persistSession = async (nextSession: AuthSession) => {
    sessionRef.current = nextSession
    setSession(nextSession)
    await saveSession(nextSession)
  }

  const clearAuthSession = async () => {
    sessionRef.current = null
    setSession(null)
    await clearSession()
  }

  useEffect(() => {
    registerAuthRefresh(async () => {
      const current = sessionRef.current
      if (!current?.refreshToken) return null
      try {
        const refreshed = await apiClient.mobileRefresh(current.refreshToken)
        const nextSession = buildSession(current, refreshed)
        await persistSession(nextSession)
        return refreshed.accessToken
      } catch (err) {
        trackError(err, 'authRefresh')
        if (isUnauthorizedError(err)) {
          setSessionExpired(true)
          await clearAuthSession()
        }
        return null
      }
    })
    return () => registerAuthRefresh(null)
  }, [])

  useEffect(() => {
    loadSession()
      .then((stored) => setSession(stored))
      .catch((err) => trackError(err, 'loadSession'))
      .finally(() => setLoading(false))
  }, [])

  // Proactive refresh while the app is open — avoids the ~10 min embed-token refresh hitting an expired access token.
  useEffect(() => {
    if (!session?.refreshToken) return

    const refreshIfNeeded = () => {
      if (!sessionRef.current?.refreshToken) return
      void refreshAccessToken().catch((err) => trackError(err, 'authKeepalive'))
    }

    const interval = setInterval(refreshIfNeeded, 5 * 60 * 1000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshIfNeeded()
    })

    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [session?.refreshToken])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user: session?.user || null,
      accessToken: session?.accessToken || null,
      refreshToken: session?.refreshToken || null,
      sessionExpired,
      clearSessionExpired: () => setSessionExpired(false),
      async signIn(email, password) {
        const normalizedEmail = String(email || '').trim().toLowerCase()
        const normalizedPassword = String(password || '').replace(/\0/g, '').trim()
        const data = await apiClient.mobileLogin(normalizedEmail, normalizedPassword)
        const nextSession: AuthSession = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user
        }
        setSessionExpired(false)
        await persistSession(nextSession)
      },
      async signOut() {
        await apiClient.mobileLogout(session?.refreshToken, session?.accessToken || undefined)
        setSessionExpired(false)
        await clearAuthSession()
        void clearHomeScreenWidgets()
      },
      async refreshAuth() {
        if (!session?.refreshToken) return
        const refreshed = await apiClient.mobileRefresh(session.refreshToken)
        await persistSession(buildSession(session, refreshed))
      },
      async updateTokens(accessToken, refreshToken) {
        if (!session?.user) return
        await persistSession({
          ...session,
          accessToken,
          refreshToken
        })
      }
    }),
    [loading, session, sessionExpired]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
