import React from 'react'
import { AuthProvider } from './state/AuthContext'
import { RootNavigator } from './navigation/RootNavigator'

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  )
}
