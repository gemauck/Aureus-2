import React, { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './state/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import { RootNavigator } from './navigation/RootNavigator'
import { AppShellProvider } from './components/shell/AppShellContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemedStatusBar } from './components/ThemedStatusBar'
import { initTelemetry, setTelemetryUser } from './services/telemetry'

function TelemetryBridge({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  useEffect(() => {
    initTelemetry()
  }, [])
  useEffect(() => {
    setTelemetryUser(user ? { id: user.id, email: user.email } : null)
  }, [user])
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
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
