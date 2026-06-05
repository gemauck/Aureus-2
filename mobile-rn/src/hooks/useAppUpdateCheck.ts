import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking, Platform } from 'react-native'
import { API_BASE_URL } from '../config'
import { APP_VERSION, APP_VERSION_CODE } from '../jobcards/theme'

type MobileAppVersionPayload = {
  android?: {
    versionCode?: number
    versionName?: string
    apkUrl?: string
    releaseNotes?: string
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

/** Check server for newer APK and prompt user to download (Android sideload builds). */
export function useAppUpdateCheck(enabled = true) {
  const checkedRef = useRef(false)

  const check = useCallback(async (silent = false) => {
    if (Platform.OS !== 'android') return
    const latest = await fetchLatestVersion()
    const remote = latest?.android
    if (!remote?.versionCode || remote.versionCode <= APP_VERSION_CODE) return
    if (silent && checkedRef.current) return
    checkedRef.current = true
    const url = remote.apkUrl || `${API_BASE_URL}/downloads/Abcotronics-ERP-Mobile.apk`
    Alert.alert(
      'Update available',
      remote.releaseNotes ||
        `Version ${remote.versionName || remote.versionCode} is available. You have ${APP_VERSION}.`,
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Download update',
          onPress: () => void Linking.openURL(url)
        }
      ]
    )
  }, [])

  useEffect(() => {
    if (!enabled) return
    void check(true)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check(true)
    })
    return () => sub.remove()
  }, [enabled, check])

  return { checkForUpdate: () => check(false) }
}
