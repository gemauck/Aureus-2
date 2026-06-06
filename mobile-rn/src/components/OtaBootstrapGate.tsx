import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'

import { applyOtaUpdate } from '../hooks/useOTAUpdates'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = { children: React.ReactNode }

/** Block UI briefly on cold start while a pending OTA bundle is fetched and applied silently. */
export function OtaBootstrapGate({ children }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [ready, setReady] = useState(__DEV__ || Platform.OS !== 'android')

  useEffect(() => {
    if (__DEV__ || Platform.OS !== 'android') return
    let cancelled = false
    void (async () => {
      try {
        await applyOtaUpdate({ silent: true })
      } catch {
        /* offline or manifest miss — continue with embedded bundle */
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={erp.primary} />
      </View>
    )
  }

  return <>{children}</>
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: erp.bg
  }
  })
}