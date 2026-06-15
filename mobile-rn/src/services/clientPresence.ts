import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { OTA_RUNTIME_VERSION } from '../constants/ota'

export type MobileClientInfo = {
  client: 'mobile'
  platform: string
  runtimeVersion?: string
  updateId?: string
  nativeVersion?: string
}

export function getMobileClientInfo(): MobileClientInfo {
  const nativeVersion =
    Constants.expoConfig?.version ||
    (Constants as { nativeAppVersion?: string }).nativeAppVersion ||
    undefined

  return {
    client: 'mobile',
    platform: Platform.OS,
    runtimeVersion: Updates.runtimeVersion || OTA_RUNTIME_VERSION,
    updateId: Updates.updateId || undefined,
    nativeVersion: nativeVersion ? String(nativeVersion) : undefined
  }
}
