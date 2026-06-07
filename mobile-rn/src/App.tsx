import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './state/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import { RootNavigator } from './navigation/RootNavigator'
import { AppShellProvider } from './components/shell/AppShellContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemedStatusBar } from './components/ThemedStatusBar'
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
            <AppShell />
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
