import React, { useEffect } from 'react'
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
  useOTAUpdates(true)
  useAppUpdateCheck(true)
  useClientPresence()
  useEffect(() => {
    initTelemetry()
    initErrorReporting()
    registerErrorReportAuth(() => accessToken)
  }, [accessToken])
  useEffect(() => {
    setTelemetryUser(user ? { id: user.id, email: user.email } : null)
  }, [user])
  useEffect(() => {
    if (accessToken) void flushPendingReports()
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
