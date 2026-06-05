import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { CameraView, Camera, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system'
import { SafeAreaView } from 'react-native-safe-area-context'
import { jc } from '../jobcards/theme'

type Props = {
  visible: boolean
  onClose: () => void
  onScan: (data: string) => void
}

/** Live ML Kit stream scanning — reliable on iOS; can crash some Android devices (e.g. Samsung A53). */
const IOS_BARCODE_TYPES = ['qr', 'code128', 'code39', 'ean13'] as const
const ANDROID_SNAPSHOT_INTERVAL_MS = 750

export function InventoryBarcodeScannerModal({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [mountError, setMountError] = useState('')
  const [canMountCamera, setCanMountCamera] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    if (!visible) {
      setCanMountCamera(false)
      setCameraReady(false)
      setMountError('')
      return
    }
    if (!permission?.granted) {
      void requestPermission()
    }
    const delay = Platform.OS === 'android' ? 400 : 80
    const timer = setTimeout(() => setCanMountCamera(true), delay)
    return () => clearTimeout(timer)
  }, [visible, permission?.granted, requestPermission])

  const handleClose = useCallback(() => {
    setCanMountCamera(false)
    setCameraReady(false)
    onClose()
  }, [onClose])

  const handleScan = useCallback(
    (data: string) => {
      const s = String(data || '').trim()
      if (!s) return
      onScan(s)
    },
    [onScan]
  )

  if (!visible) return null

  if (!permission) {
    return (
      <Modal visible animationType="slide" onRequestClose={handleClose}>
        <SafeAreaView style={styles.root}>
          <ActivityIndicator color="#fff" size="large" />
        </SafeAreaView>
      </Modal>
    )
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={handleClose}>
        <SafeAreaView style={styles.root}>
          <Text style={styles.message}>Camera permission is required to scan labels.</Text>
          <Pressable style={styles.btn} onPress={() => void requestPermission()}>
            <Text style={styles.btnText}>Allow camera</Text>
          </Pressable>
          <Pressable style={styles.btnSecondary} onPress={handleClose}>
            <Text style={styles.btnText}>Close</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    )
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.root}>
        {mountError ? (
          <View style={styles.centered}>
            <Text style={styles.message}>Camera could not start on this device.</Text>
            <Text style={styles.hint}>{mountError}</Text>
            <Pressable style={styles.btn} onPress={handleClose}>
              <Text style={styles.btnText}>Close</Text>
            </Pressable>
          </View>
        ) : !canMountCamera ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.hint}>Starting camera…</Text>
          </View>
        ) : (
          <ScannerCamera
            onClose={handleClose}
            onScan={handleScan}
            onMountError={setMountError}
            onCameraReady={() => setCameraReady(true)}
            cameraReady={cameraReady}
          />
        )}
      </SafeAreaView>
    </Modal>
  )
}

function ScannerCamera({
  onClose,
  onScan,
  onMountError,
  onCameraReady,
  cameraReady
}: {
  onClose: () => void
  onScan: (data: string) => void
  onMountError: (msg: string) => void
  onCameraReady: () => void
  cameraReady: boolean
}) {
  const cameraRef = useRef<CameraView>(null)
  const lastScan = useRef({ text: '', t: 0 })
  const scanningRef = useRef(false)
  const useAndroidSnapshot = Platform.OS === 'android'

  const tryAcceptScan = useCallback(
    (data: string) => {
      const now = Date.now()
      const s = String(data || '').trim()
      if (!s) return
      if (s === lastScan.current.text && now - lastScan.current.t < 2000) return
      lastScan.current = { text: s, t: now }
      onScan(s)
    },
    [onScan]
  )

  useEffect(() => {
    if (!useAndroidSnapshot || !cameraReady) return
    let cancelled = false

    const tick = async () => {
      if (cancelled || scanningRef.current || !cameraRef.current) return
      scanningRef.current = true
      let uri = ''
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.12,
          skipProcessing: true,
          exif: false
        })
        uri = photo?.uri || ''
        if (!uri || cancelled) return
        const results = await Camera.scanFromURLAsync(uri, ['qr'])
        const data = results?.[0]?.data
        if (data) tryAcceptScan(data)
      } catch {
        /* ignore per-frame scan failures */
      } finally {
        if (uri) {
          void FileSystem.deleteAsync(uri, { idempotent: true })
        }
        scanningRef.current = false
      }
    }

    const id = setInterval(() => {
      void tick()
    }, ANDROID_SNAPSHOT_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [cameraReady, tryAcceptScan, useAndroidSnapshot])

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={onCameraReady}
        onMountError={(event) => onMountError(event.message || 'Camera mount failed')}
        {...(useAndroidSnapshot
          ? {}
          : {
              barcodeScannerSettings: { barcodeTypes: [...IOS_BARCODE_TYPES] },
              onBarcodeScanned: ({ data }) => tryAcceptScan(data)
            })}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>
          {useAndroidSnapshot
            ? 'Point at the inventory QR label'
            : 'Point at the QR label or barcode'}
        </Text>
        {!cameraReady ? (
          <Text style={styles.hint}>Initializing…</Text>
        ) : null}
      </View>
      <Pressable style={styles.closeScan} onPress={onClose}>
        <Text style={styles.closeScanText}>Close scanner</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  cameraWrap: { flex: 1 },
  camera: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { color: '#fff', fontSize: 16, textAlign: 'center', fontWeight: '600' },
  hint: { color: '#cbd5e1', fontSize: 13, textAlign: 'center' },
  overlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 6
  },
  overlayText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  btn: {
    marginTop: 8,
    backgroundColor: jc.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: jc.radius.md
  },
  btnSecondary: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: jc.radius.md
  },
  btnText: { color: '#fff', fontWeight: '700' },
  closeScan: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10
  },
  closeScanText: { color: '#fff', fontWeight: '700' }
})
