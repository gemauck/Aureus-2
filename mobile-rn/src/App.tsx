import React from 'react'
import { StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './state/AuthContext'
import { RootNavigator } from './navigation/RootNavigator'
import { AppShellProvider } from './components/shell/AppShellContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OtaBootstrapGate } from './components/OtaBootstrapGate'
import { useOTAUpdates } from './hooks/useOTAUpdates'

function AppShell() {
  useOTAUpdates(true)
  return (
    <OtaBootstrapGate>
      <AppShellProvider>
        <RootNavigator />
      </AppShellProvider>
    </OtaBootstrapGate>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <SafeAreaProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
