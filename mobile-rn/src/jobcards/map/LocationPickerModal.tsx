import React, { useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'

type Props = {
  visible: boolean
  onClose: () => void
  onConfirm: (result: { latitude: number; longitude: number; label: string }) => void
}

export function LocationPickerModal({ visible, onClose, onConfirm }: Props) {
  const [region, setRegion] = useState({
    latitude: -26.2041,
    longitude: 28.0473,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05
  })
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null)

  async function useCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow location to pick your current position.')
      return
    }
    const pos = await Location.getCurrentPositionAsync({})
    const { latitude, longitude } = pos.coords
    setRegion((r) => ({ ...r, latitude, longitude }))
    setMarker({ latitude, longitude })
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.root}>
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={(e) => setMarker(e.nativeEvent.coordinate)}
        >
          {marker ? <Marker coordinate={marker} /> : null}
        </MapView>
        <View style={styles.bar}>
          <Pressable style={styles.btn} onPress={useCurrentLocation}>
            <Text style={styles.btnText}>Use my location</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.confirm]}
            onPress={() => {
              if (!marker) {
                Alert.alert('Pick a point', 'Tap the map or use your current location.')
                return
              }
              onConfirm({
                latitude: marker.latitude,
                longitude: marker.longitude,
                label: `${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`
              })
            }}
          >
            <Text style={styles.btnText}>Confirm</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  bar: { padding: 16, gap: 8, backgroundColor: '#fff' },
  btn: {
    backgroundColor: '#334155',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  confirm: { backgroundColor: '#0284c7' },
  btnText: { color: '#fff', fontWeight: '700' },
  cancel: { alignItems: 'center', padding: 8 },
  cancelText: { color: '#64748b' }
})
