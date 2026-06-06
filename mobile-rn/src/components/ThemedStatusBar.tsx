import React from 'react'
import { StatusBar } from 'react-native'
import { useTheme } from '../theme/ThemeContext'

export function ThemedStatusBar() {
  const { erp, isDark } = useTheme()
  return (
    <StatusBar
      barStyle={isDark ? 'light-content' : 'dark-content'}
      backgroundColor={erp.bg}
    />
  )
}
