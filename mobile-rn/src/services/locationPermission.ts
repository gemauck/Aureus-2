import * as Location from 'expo-location'

/** Read foreground location permission without prompting. */
export async function getForegroundLocationPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.getForegroundPermissionsAsync()
  return status
}

/**
 * Prompt for location only when a location-based feature runs (map GPS, trip tracking).
 * Returns true when foreground location access is granted.
 */
export async function ensureForegroundLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync()
  if (current.status === Location.PermissionStatus.GRANTED) {
    return true
  }
  if (current.status === Location.PermissionStatus.DENIED && current.canAskAgain === false) {
    return false
  }
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === Location.PermissionStatus.GRANTED
}

export async function readCurrentCoordinates(): Promise<{
  latitude: number
  longitude: number
}> {
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced
  })
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude
  }
}
