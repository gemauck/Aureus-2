import React, { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { MediaGallery } from './MediaGallery'
import { prepareImageMediaItem } from './imageThumbnails'
import type { MediaItem } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  photos: MediaItem[]
  onChange: (photos: MediaItem[]) => void
  readOnly?: boolean
}

export function PhotoPickerSection({ photos, onChange, readOnly }: Props) {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const [busy, setBusy] = useState(false)

  async function pick() {
    setBusy(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Photos', 'Allow photo library access.')
        return
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.85,
        allowsMultipleSelection: true
      })
      if (res.canceled) return
      const next = [...photos]
      for (const asset of res.assets) {
        if (asset.type === 'video' && asset.uri) {
          next.push({
            url: asset.uri,
            thumbUrl: asset.uri,
            name: asset.fileName || 'Video',
            mediaType: 'video'
          })
        } else if (asset.uri) {
          next.push(await prepareImageMediaItem(asset.uri, asset.fileName || 'Photo'))
        }
      }
      onChange(next)
    } catch (err) {
      Alert.alert('Photos', err instanceof Error ? err.message : 'Could not open the photo library.')
    } finally {
      setBusy(false)
    }
  }

  async function capture() {
    setBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Camera', 'Allow camera access to take photos.')
        return
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false
      })
      if (res.canceled || !res.assets[0]?.uri) return
      onChange([
        ...photos,
        await prepareImageMediaItem(res.assets[0].uri, 'Camera photo')
      ])
    } catch (err) {
      Alert.alert('Camera', err instanceof Error ? err.message : 'Could not open the camera.')
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

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
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
}