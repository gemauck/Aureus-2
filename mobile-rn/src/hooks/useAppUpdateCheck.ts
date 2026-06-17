import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Linking, Platform } from 'react-native'
import { ANDROID_APK_DOWNLOAD_URL, API_BASE_URL } from '../config'
import { APP_VERSION, APP_VERSION_CODE } from '../jobcards/theme'

type MobileAppVersionPayload = {
  android?: {
    versionCode?: number
    versionName?: string
    apkUrl?: string
    releaseNotes?: string
    /** When true, user must install a new APK (native module / permission change). OTA cannot replace this. */
    forceApkInstall?: boolean
  }
}

async function fetchLatestVersion(): Promise<MobileAppVersionPayload | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/mobile-app-version`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    const payload = await res.json()
    return (payload?.data || payload) as MobileAppVersionPayload
  } catch {
    return null
  }
}

/** Only prompts for APK when the server explicitly requires a native shell upgrade. JS changes use OTA. */
export function useAppUpdateCheck(enabled = false) {
  const promptedRef = useRef(false)

  const check = useCallback(async (interactive = false) => {
    if (Platform.OS !== 'android') return
    const latest = await fetchLatestVersion()
    const remote = latest?.android
    if (!remote?.versionCode || remote.versionCode <= APP_VERSION_CODE) return
    if (!remote.forceApkInstall) return
    if (!interactive && promptedRef.current) return
    promptedRef.current = true

    const url = remote.apkUrl || ANDROID_APK_DOWNLOAD_URL
    Alert.alert(
      'App update required',
      remote.releaseNotes ||
        `Version ${remote.versionName || remote.versionCode} includes native changes. Install once to resume automatic updates.`,
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => void Linking.openURL(url)
        }
      ]
    )
  }, [])

  useEffect(() => {
    if (!enabled) return
    void check(false)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check(false)
    })
    return () => sub.remove()
  }, [enabled, check])

  return { checkForUpdate: () => check(true) }
}
