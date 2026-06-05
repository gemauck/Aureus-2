import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'

export type OtaCheckResult =
  | { status: 'dev' | 'disabled' | 'unsupported' | 'current' }
  | { status: 'downloaded'; willReload: boolean }
  | { status: 'error'; message: string }

async function applyOtaUpdate(options: { silent?: boolean } = {}): Promise<OtaCheckResult> {
  if (__DEV__) return { status: 'dev' }
  if (Platform.OS !== 'android') return { status: 'unsupported' }
  if (!Updates.isEnabled) return { status: 'disabled' }

  try {
    const check = await Updates.checkForUpdateAsync()
    if (!check.isAvailable) return { status: 'current' }

    await Updates.fetchUpdateAsync()

    if (options.silent) {
      await Updates.reloadAsync()
      return { status: 'downloaded', willReload: true }
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Update ready',
        'A new version of the app was downloaded. Restart now to apply it?',
        [
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => resolve({ status: 'downloaded', willReload: false })
          },
          {
            text: 'Restart',
            onPress: () => {
              void Updates.reloadAsync()
              resolve({ status: 'downloaded', willReload: true })
            }
          }
        ]
      )
    })
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'OTA check failed'
    }
  }
}

/** Check Expo Updates (JS bundle OTA) on launch and when app returns to foreground. */
export function useOTAUpdates(enabled = true) {
  const checkedRef = useRef(false)

  const check = useCallback(async (opts: { silent?: boolean; force?: boolean } = {}) => {
    if (!enabled) return applyOtaUpdate(opts)
    if (opts.silent && checkedRef.current && !opts.force) {
      return { status: 'current' as const }
    }
    if (opts.silent) checkedRef.current = true
    return applyOtaUpdate(opts)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void check({ silent: true })
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check({ silent: true })
    })
    return () => sub.remove()
  }, [enabled, check])

  return {
    checkForOTAUpdate: (interactive = true) => check({ silent: !interactive, force: true }),
    otaEnabled: Updates.isEnabled,
    otaChannel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch
  }
}

export { applyOtaUpdate }
