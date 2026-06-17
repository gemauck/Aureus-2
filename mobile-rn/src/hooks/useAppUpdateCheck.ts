import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Linking, Platform } from 'react-native'
import { ANDROID_APK_DOWNLOAD_URL } from '../config'
import { APP_VERSION_CODE } from '../jobcards/theme'
import { fetchLatestApkVersion, recheckApkVersion } from '../services/apkVersionCheck'

function promptApkUpdateInteractive(remote: {
  versionCode?: number
  versionName?: string
  releaseNotes?: string
  apkUrl?: string
}) {
  const url = remote.apkUrl || ANDROID_APK_DOWNLOAD_URL
  Alert.alert(
    'App update required',
    remote.releaseNotes ||
      `Version ${remote.versionName || remote.versionCode} is available (you have build ${APP_VERSION_CODE}). Download and install the latest APK.`,
    [
      { text: 'Download', onPress: () => void Linking.openURL(url) }
    ]
  )
}

/** Block the app until the user installs the latest APK when the server publishes a newer build. */
export function useAppUpdateCheck(enabled = true) {
  const inFlightRef = useRef(false)
  const appStateRef = useRef(AppState.currentState)

  const check = useCallback(
    async (interactive = false) => {
      if (Platform.OS !== 'android' || !enabled) return

      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const upToDate = await recheckApkVersion()
        if (!upToDate && interactive) {
          const latest = await fetchLatestApkVersion()
          const remote = latest?.android
          if (remote?.versionCode && remote.versionCode > APP_VERSION_CODE) {
            promptApkUpdateInteractive(remote)
          }
        }
      } finally {
        inFlightRef.current = false
      }
    },
    [enabled]
  )

  useEffect(() => {
    if (!enabled) return

    void check(false)

    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current
      appStateRef.current = nextState
      if (nextState !== 'active' || prev === 'active') return
      void recheckApkVersion()
    })

    return () => sub.remove()
  }, [enabled, check])

  return { checkForUpdate: () => check(true) }
}

export { recheckApkVersion } from '../services/apkVersionCheck'
