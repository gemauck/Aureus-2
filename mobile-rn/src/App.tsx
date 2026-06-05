import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './state/AuthContext'
import { RootNavigator } from './navigation/RootNavigator'
import { AppShellProvider } from './components/shell/AppShellContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAppUpdateCheck } from './hooks/useAppUpdateCheck'
import { useOTAUpdates } from './hooks/useOTAUpdates'

function AppShell() {
  useAppUpdateCheck(true)
  useOTAUpdates(true)
  return (
    <AppShellProvider>
      <RootNavigator />
    </AppShellProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
