import React, { useEffect, useRef } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './state/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import { RootNavigator } from './navigation/RootNavigator'
import { AppShellProvider } from './components/shell/AppShellContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ApkUpdateGate } from './components/ApkUpdateGate'
import { OtaUpdateOverlay } from './components/OtaUpdateOverlay'
import { ThemedStatusBar } from './components/ThemedStatusBar'
import { initTelemetry, setTelemetryUser } from './services/telemetry'
import {
  flushPendingReports,
  initErrorReporting,
  registerErrorReportAuth
} from './services/errorReporting'
import { useOTAUpdates } from './hooks/useOTAUpdates'
import { useAppUpdateCheck } from './hooks/useAppUpdateCheck'
import { useClientPresence } from './hooks/useClientPresence'

function TelemetryBridge({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuth()
  const accessTokenRef = useRef<string | null>(null)
  accessTokenRef.current = accessToken

  useOTAUpdates(true)
  useAppUpdateCheck(true)
  useClientPresence()

  useEffect(() => {
    registerErrorReportAuth(() => accessTokenRef.current)
  }, [])

  useEffect(() => {
    setTelemetryUser(user ? { id: user.id, email: user.email } : null)
  }, [user])

  useEffect(() => {
    void flushPendingReports()
  }, [accessToken])

  return <>{children}</>
}

function AppShell() {
  return (
    <AppShellProvider>
      <RootNavigator />
    </AppShellProvider>
  )
}

export default function App() {
  useEffect(() => {
    initTelemetry()
    initErrorReporting()
  }, [])

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <ThemedStatusBar />
        <SafeAreaProvider>
          <AuthProvider>
            <TelemetryBridge>
              <AppShell />
            </TelemetryBridge>
            <ApkUpdateGate />
            <OtaUpdateOverlay />
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
