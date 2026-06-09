import { useEffect, useState } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { Platform } from 'react-native'

/** NetInfo `isInternetReachable: false` is unreliable on Android (often wrong on Wi‑Fi/cellular). */
export function computeNetworkOnline(state: NetInfoState): boolean {
  if (state.isConnected !== true) return false
  if (state.isInternetReachable == null) return true
  if (Platform.OS === 'android' && state.isInternetReachable === false) return true
  return state.isInternetReachable !== false
}

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      setIsOnline(computeNetworkOnline(state))
    })
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(computeNetworkOnline(state))
    })
    return () => unsub()
  }, [])

  return { isOnline }
}
