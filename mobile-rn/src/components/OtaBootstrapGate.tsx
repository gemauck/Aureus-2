import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { erp } from '../theme/appTheme'
import { applyOtaUpdate } from '../hooks/useOTAUpdates'

type Props = { children: React.ReactNode }

/** Block UI briefly on cold start while a pending OTA bundle is fetched and applied silently. */
export function OtaBootstrapGate({ children }: Props) {
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

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: erp.bg
  }
})
