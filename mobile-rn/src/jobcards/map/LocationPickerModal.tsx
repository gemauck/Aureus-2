import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import * as Location from 'expo-location'
import { jc } from '../theme'

type Props = {
  visible: boolean
  onClose: () => void
  onConfirm: (result: { latitude: number; longitude: number; label: string }) => void
  initialLatitude?: string
  initialLongitude?: string
  initialLabel?: string
}

type MapPickMessage = {
  type: 'pick' | 'ready'
  lat?: number
  lng?: number
}

const DEFAULT_LAT = -25.7479
const DEFAULT_LNG = 28.2293
const NOMINATIM_HEADERS = { 'User-Agent': 'Abcotronics-ERP-Mobile/1.0' }

function parseCoord(value: string | undefined): number | null {
  if (!value?.trim()) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
    body { background: #e2e8f0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map, marker;
    function send(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }
    function setMarker(lat, lng, pan) {
      if (!map) return;
      if (marker) map.removeLayer(marker);
      marker = L.marker([lat, lng]).addTo(map);
      if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 15));
      send({ type: 'pick', lat: lat, lng: lng });
    }
    function initMap(lat, lng, hasMarker) {
      map = L.map('map', { center: [lat, lng], zoom: hasMarker ? 15 : 6, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(map);
      if (hasMarker) setMarker(lat, lng, false);
      map.on('click', function(e) {
        setMarker(e.latlng.lat, e.latlng.lng, false);
      });
      setTimeout(function() {
        map.invalidateSize(true);
        send({ type: 'ready' });
      }, 120);
    }
    window.__setMarker = setMarker;
    window.__initMap = initMap;
  </script>
</body>
</html>`
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: NOMINATIM_HEADERS }
    )
    if (!res.ok) throw new Error('reverse geocode failed')
    const data = (await res.json()) as { display_name?: string }
    return data.display_name?.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}

async function searchLocation(
  query: string
): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const trimmed = query.trim()
  if (!trimmed) return null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&countrycodes=za`,
      { headers: NOMINATIM_HEADERS }
    )
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>
    const hit = rows[0]
    if (!hit) return null
    return {
      latitude: Number.parseFloat(hit.lat),
      longitude: Number.parseFloat(hit.lon),
      label: hit.display_name?.trim() || trimmed
    }
  } catch {
    return null
  }
}

export function LocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLatitude,
  initialLongitude,
  initialLabel
}: Props) {
  const webRef = useRef<WebView>(null)
  const [mapReady, setMapReady] = useState(false)
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null)
  const [label, setLabel] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [hint, setHint] = useState('')

  const initialCoords = useMemo(() => {
    const lat = parseCoord(initialLatitude)
    const lng = parseCoord(initialLongitude)
    if (lat != null && lng != null) return { lat, lng, hasMarker: true }
    return { lat: DEFAULT_LAT, lng: DEFAULT_LNG, hasMarker: false }
  }, [initialLatitude, initialLongitude])

  const mapHtml = useMemo(() => buildMapHtml(), [])

  const applyPick = useCallback(async (latitude: number, longitude: number, knownLabel?: string) => {
    setMarker({ latitude, longitude })
    if (knownLabel?.trim()) {
      setLabel(knownLabel.trim())
      return
    }
    setLabel(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
    const resolved = await reverseGeocode(latitude, longitude)
    setLabel(resolved)
  }, [])

  useEffect(() => {
    if (!visible) {
      setMapReady(false)
      setSearching(false)
      setLocating(false)
      setHint('')
      return
    }
    const lat = parseCoord(initialLatitude)
    const lng = parseCoord(initialLongitude)
    if (lat != null && lng != null) {
      setMarker({ latitude: lat, longitude: lng })
      setLabel(initialLabel?.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    } else {
      setMarker(null)
      setLabel('')
    }
    setSearchQuery(initialLabel?.trim() || '')
  }, [visible, initialLatitude, initialLongitude, initialLabel])

  function initMapInWebView() {
    webRef.current?.injectJavaScript(`
      (function boot() {
        if (typeof L === 'undefined' || !window.__initMap) {
          setTimeout(boot, 50);
          return;
        }
        window.__initMap(${initialCoords.lat}, ${initialCoords.lng}, ${initialCoords.hasMarker ? 'true' : 'false'});
      })();
      true;
    `)
  }

  function injectMarker(latitude: number, longitude: number, pan = true) {
    webRef.current?.injectJavaScript(
      `window.__setMarker(${latitude}, ${longitude}, ${pan ? 'true' : 'false'}); true;`
    )
  }

  async function useCurrentLocation() {
    setHint('')
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location to pick your current position.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = pos.coords
      injectMarker(latitude, longitude, true)
      await applyPick(latitude, longitude)
    } catch {
      setHint('Could not read GPS location. Try tapping the map instead.')
    } finally {
      setLocating(false)
    }
  }

  async function handleSearch() {
    setHint('')
    setSearching(true)
    try {
      const hit = await searchLocation(searchQuery)
      if (!hit) {
        setHint('No results found. Try a different search or tap the map.')
        return
      }
      injectMarker(hit.latitude, hit.longitude, true)
      setMarker({ latitude: hit.latitude, longitude: hit.longitude })
      setLabel(hit.label)
    } finally {
      setSearching(false)
    }
  }

  async function handleMapMessage(raw: string) {
    try {
      const msg = JSON.parse(raw) as MapPickMessage
      if (msg.type === 'ready') {
        setMapReady(true)
        return
      }
      if (msg.type === 'pick' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
        setHint('')
        await applyPick(msg.lat, msg.lng)
      }
    } catch {
      // ignore malformed messages
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Pick visit location</Text>
            <Text style={styles.subtitle}>Search, use GPS, or tap the map to drop a pin.</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search address or place…"
              placeholderTextColor={jc.textSubtle}
              returnKeyType="search"
              onSubmitEditing={() => void handleSearch()}
            />
            <Pressable
              style={[styles.searchBtn, searching && styles.btnDisabled]}
              onPress={() => void handleSearch()}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.searchBtnText}>Search</Text>
              )}
            </Pressable>
          </View>
          <Pressable
            style={[styles.locationBtn, locating && styles.btnDisabled]}
            onPress={() => void useCurrentLocation()}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator color={jc.primaryDark} size="small" />
            ) : (
              <Text style={styles.locationBtnText}>Use my current location</Text>
            )}
          </Pressable>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>

        <View style={styles.mapWrap}>
          {!mapReady ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={jc.primary} size="large" />
              <Text style={styles.mapLoadingText}>Loading map…</Text>
            </View>
          ) : null}
          <WebView
            key={visible ? 'map-open' : 'map-closed'}
            ref={webRef}
            source={{ html: mapHtml }}
            style={styles.map}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            onLoadEnd={() => initMapInWebView()}
            onMessage={(event) => void handleMapMessage(event.nativeEvent.data)}
            onError={() => setHint('Map failed to load. Check your connection and try again.')}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.selectedBox}>
            <Text style={styles.selectedLabel}>Selected</Text>
            <Text style={styles.selectedValue}>{label || 'No location selected yet'}</Text>
            {marker ? (
              <Text style={styles.selectedCoords}>
                {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
              </Text>
            ) : null}
          </View>
          <View style={styles.footerActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, !marker && styles.btnDisabled]}
              disabled={!marker}
              onPress={() => {
                if (!marker) {
                  Alert.alert('Pick a point', 'Tap the map, search, or use your current location.')
                  return
                }
                onConfirm({
                  latitude: marker.latitude,
                  longitude: marker.longitude,
                  label: label || `${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`
                })
              }}
            >
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: jc.border
  },
  headerTextWrap: { flex: 1, paddingRight: 12 },
  title: { fontSize: 18, fontWeight: '700', color: jc.text },
  subtitle: { fontSize: 13, color: jc.textMuted, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: jc.surfaceMuted
  },
  closeBtnText: { fontSize: 16, color: jc.textMuted, fontWeight: '700' },
  toolbar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: jc.border,
    backgroundColor: '#f8fafc'
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: jc.text,
    backgroundColor: '#fff'
  },
  searchBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    borderRadius: jc.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  locationBtn: {
    backgroundColor: jc.primarySoft,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: jc.radius.md,
    paddingVertical: 12,
    alignItems: 'center'
  },
  locationBtnText: { color: jc.primaryDark, fontWeight: '700' },
  hint: {
    fontSize: 13,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: jc.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  mapWrap: { flex: 1, backgroundColor: '#e2e8f0' },
  map: { flex: 1 },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    zIndex: 2
  },
  mapLoadingText: { marginTop: 10, color: jc.textMuted, fontWeight: '600' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: jc.border,
    backgroundColor: '#fff',
    gap: 12
  },
  selectedBox: {
    backgroundColor: jc.surfaceMuted,
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 12
  },
  selectedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: jc.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  selectedValue: { fontSize: 14, fontWeight: '600', color: jc.text, marginTop: 4 },
  selectedCoords: { fontSize: 12, color: jc.textMuted, marginTop: 4 },
  footerActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: jc.radius.md,
    borderWidth: 1,
    borderColor: jc.border,
    alignItems: 'center'
  },
  cancelBtnText: { color: jc.textMuted, fontWeight: '700' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: jc.radius.md,
    backgroundColor: jc.primary,
    alignItems: 'center'
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
  btnDisabled: { opacity: 0.55 }
})
