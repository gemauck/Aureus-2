import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
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
import { useThemedStyles } from '../theme/useThemedStyles'
import type { JcTheme } from '../theme/palettes'

type Props = {
  visible: boolean
  onClose: () => void
  onScan: (data: string) => void
}

/** Live ML Kit stream scanning — reliable on iOS; can crash some Android devices (e.g. Samsung A53). */
const BARCODE_TYPES = ['qr', 'code128', 'code39', 'ean13'] as const
const ANDROID_SNAPSHOT_INTERVAL_MS = 450
/** Typical inventory sticker aspect (e.g. Avery L7163). */
const LABEL_FRAME_ASPECT = 99.1 / 38.1

export function InventoryBarcodeScannerModal({ visible, onClose, onScan }: Props) {
  const styles = useThemedStyles(createStyles)
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
  const styles = useThemedStyles(createStyles)
  const cameraRef = useRef<CameraView>(null)
  const lastScan = useRef({ text: '', t: 0 })
  const scanningRef = useRef(false)
  const scannedRef = useRef(false)
  const useAndroidSnapshot = Platform.OS === 'android'

  const tryAcceptScan = useCallback(
    (data: string) => {
      if (scannedRef.current) return
      const now = Date.now()
      const s = String(data || '').trim()
      if (!s) return
      if (s === lastScan.current.text && now - lastScan.current.t < 2000) return
      lastScan.current = { text: s, t: now }
      scannedRef.current = true
      onScan(s)
      onClose()
    },
    [onClose, onScan]
  )

  useEffect(() => {
    if (!useAndroidSnapshot || !cameraReady) return
    let cancelled = false

    const tick = async () => {
      if (cancelled || scanningRef.current || scannedRef.current || !cameraRef.current) return
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
        const results = await Camera.scanFromURLAsync(uri, [...BARCODE_TYPES])
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
              barcodeScannerSettings: { barcodeTypes: [...BARCODE_TYPES] },
              onBarcodeScanned: ({ data }) => tryAcceptScan(data)
            })}
      />
      <ScanPlacementOverlay ready={cameraReady} />
      <Pressable style={styles.closeScan} onPress={onClose}>
        <Text style={styles.closeScanText}>Close scanner</Text>
      </Pressable>
    </View>
  )
}

function ScanPlacementOverlay({ ready }: { ready: boolean }) {
  const styles = useThemedStyles(createStyles)
  const { width: screenW, height: screenH } = Dimensions.get('window')
  const frameW = Math.min(screenW * 0.86, screenW - 32)
  const frameH = Math.min(frameW / LABEL_FRAME_ASPECT, screenH * 0.28)
  const sideW = (screenW - frameW) / 2
  const dim = 'rgba(0,0,0,0.55)'

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayText}>Align inventory label in frame</Text>
        <Text style={styles.overlaySubtext}>
          {ready ? 'Scanning automatically — no photo needed' : 'Starting camera…'}
        </Text>
      </View>
      <View style={{ flex: 1, backgroundColor: dim }} />
      <View style={{ flexDirection: 'row', height: frameH }}>
        <View style={{ width: sideW, backgroundColor: dim }} />
        <View
          style={{
            width: frameW,
            height: frameH,
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.85)',
            borderRadius: 8
          }}
        >
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <View style={{ width: sideW, backgroundColor: dim }} />
      </View>
      <View style={{ flex: 1, backgroundColor: dim }} />
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  cameraWrap: { flex: 1 },
  camera: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { color: '#fff', fontSize: 16, textAlign: 'center', fontWeight: '600' },
  hint: { color: '#cbd5e1', fontSize: 13, textAlign: 'center' },
  overlayHeader: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 2,
    alignItems: 'center',
    gap: 4
  },
  overlayText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  overlaySubtext: { color: '#e2e8f0', fontSize: 13, textAlign: 'center' },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#38bdf8'
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8
  },
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
}