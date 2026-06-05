import React, { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { JOB_CARD_IMAGE_MAX_DIMENSION } from '../../../../src/jobCardWizard/constants.js'
import { MediaGallery } from './MediaGallery'
import { jc } from '../theme'
import type { MediaItem } from '../types'

type Props = {
  photos: MediaItem[]
  onChange: (photos: MediaItem[]) => void
  readOnly?: boolean
}

async function compressUri(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: JOB_CARD_IMAGE_MAX_DIMENSION } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  return `data:image/jpeg;base64,${result.base64 || ''}`
}

export function PhotoPickerSection({ photos, onChange, readOnly }: Props) {
  const [busy, setBusy] = useState(false)

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow photo library access.')
      return
    }
    setBusy(true)
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.85,
        allowsMultipleSelection: true
      })
      if (res.canceled) return
      const next = [...photos]
      for (const asset of res.assets) {
        if (asset.type === 'video') {
          next.push({ url: asset.uri, name: asset.fileName || 'Video', mediaType: 'video' })
        } else {
          const dataUrl = await compressUri(asset.uri)
          next.push({ url: dataUrl, name: asset.fileName || 'Photo' })
        }
      }
      onChange(next)
    } finally {
      setBusy(false)
    }
  }

  async function capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera', 'Allow camera access to take photos.')
      return
    }
    setBusy(true)
    try {
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85
      })
      if (res.canceled) return
      const dataUrl = await compressUri(res.assets[0].uri)
      onChange([...photos, { url: dataUrl, name: 'Camera photo' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <View>
      {!readOnly ? (
        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.cameraBtn]} onPress={() => void capture()} disabled={busy}>
            <Text style={styles.btnText}>📷 Take photo</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.galleryBtn]} onPress={() => void pick()} disabled={busy}>
            <Text style={styles.btnText}>🖼 Gallery</Text>
          </Pressable>
        </View>
      ) : null}
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={jc.primary} />
          <Text style={styles.busyText}>Processing photo…</Text>
        </View>
      ) : null}
      <MediaGallery
        items={photos}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        emptyLabel="No photos attached yet"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  btn: {
    flex: 1,
    padding: 14,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  cameraBtn: { backgroundColor: jc.primary },
  galleryBtn: { backgroundColor: jc.accentTeal },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  busyText: { color: jc.textMuted, fontSize: 13 }
})
