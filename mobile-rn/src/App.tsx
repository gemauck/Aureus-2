import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { JobCardSyncProvider } from './jobcards/JobCardSyncContext'
import { AuthProvider } from './state/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import { RootNavigator } from './navigation/RootNavigator'
import { AppShellProvider } from './components/shell/AppShellContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemedStatusBar } from './components/ThemedStatusBar'
import { useOTAUpdates } from './hooks/useOTAUpdates'

function AppShell() {
  useOTAUpdates(true)
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
            <JobCardSyncProvider>
              <AppShell />
            </JobCardSyncProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
