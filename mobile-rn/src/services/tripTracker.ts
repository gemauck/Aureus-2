import * as Location from 'expo-location'
import type { GpsPoint, TripSession } from '../types/jobCard'

const EARTH_RADIUS_KM = 6371

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function haversineKm(a: GpsPoint, b: GpsPoint): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function routeDistanceKm(points: GpsPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i])
  }
  return Math.round(total * 100) / 100
}

export function createTripSession(): TripSession {
  return {
    active: false,
    startedAt: null,
    endedAt: null,
    points: [],
    distanceKm: 0
  }
}

type WatchHandle = Location.LocationSubscription | null

let watchSub: WatchHandle = null

export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === Location.PermissionStatus.GRANTED
}

export async function startTripTracking(
  onUpdate: (trip: TripSession) => void,
  trip: TripSession
): Promise<TripSession> {
  const granted = await ensureLocationPermission()
  if (!granted) {
    throw new Error('Location permission is required to track travel distance.')
  }

  if (watchSub) {
    watchSub.remove()
    watchSub = null
  }

  const startedAt = new Date().toISOString()
  const points: GpsPoint[] = [...trip.points]

  const emit = (): TripSession => ({
    ...trip,
    active: true,
    startedAt,
    endedAt: null,
    points: [...points],
    distanceKm: routeDistanceKm(points)
  })

  const initial = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced
  })
  points.push({
    latitude: initial.coords.latitude,
    longitude: initial.coords.longitude,
    timestamp: new Date().toISOString()
  })
  const initialTrip = emit()
  onUpdate(initialTrip)

  watchSub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 15000
    },
    (pos) => {
      points.push({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        timestamp: new Date().toISOString()
      })
      onUpdate(emit())
    }
  )

  return emit()
}

export async function stopTripTracking(trip: TripSession): Promise<TripSession> {
  if (watchSub) {
    watchSub.remove()
    watchSub = null
  }
  return {
    ...trip,
    active: false,
    endedAt: new Date().toISOString(),
    distanceKm: routeDistanceKm(trip.points)
  }
}

export function latestPoint(trip: TripSession): GpsPoint | null {
  if (!trip.points.length) return null
  return trip.points[trip.points.length - 1]
}
