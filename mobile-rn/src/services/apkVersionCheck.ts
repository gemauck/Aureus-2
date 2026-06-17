import { Platform } from 'react-native'
import { ANDROID_APK_DOWNLOAD_URL, API_BASE_URL } from '../config'
import { APP_VERSION_CODE } from '../jobcards/theme'
import {
  setApkVersionChecking,
  setApkVersionCurrent,
  setRequiredApkUpdate
} from './apkUpdateUi'

type MobileAppVersionPayload = {
  android?: {
    versionCode?: number
    versionName?: string
    apkUrl?: string
    releaseNotes?: string
  }
}

export async function fetchLatestApkVersion(): Promise<MobileAppVersionPayload | null> {
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

/** Returns true when the installed APK matches (or exceeds) the server version. */
export async function recheckApkVersion(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    setApkVersionCurrent()
    return true
  }

  setApkVersionChecking()
  const latest = await fetchLatestApkVersion()
  const remote = latest?.android

  if (!remote?.versionCode) {
    // Offline or API error — do not block field use on a transient failure.
    setApkVersionCurrent()
    return true
  }

  if (remote.versionCode > APP_VERSION_CODE) {
    setRequiredApkUpdate({
      versionCode: remote.versionCode,
      versionName: remote.versionName,
      releaseNotes: remote.releaseNotes,
      apkUrl: remote.apkUrl || ANDROID_APK_DOWNLOAD_URL,
      installedVersionCode: APP_VERSION_CODE
    })
    return false
  }

  setApkVersionCurrent()
  return true
}
