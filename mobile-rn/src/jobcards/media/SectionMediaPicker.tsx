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
  section: string
  items: MediaItem[]
  onChange: (items: MediaItem[]) => void
}

export function SectionMediaPicker({ section, items, onChange }: Props) {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const [busy, setBusy] = useState(false)

  async function capture() {
    setBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Camera', 'Allow camera access to take job card photos.')
        return
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false
      })
      if (res.canceled || !res.assets[0]?.uri) return
      onChange([
        ...items,
        await prepareImageMediaItem(res.assets[0].uri, `${section} photo`)
      ])
    } catch (err) {
      Alert.alert('Camera', err instanceof Error ? err.message : 'Could not open the camera.')
    } finally {
      setBusy(false)
    }
  }

  async function pickGallery() {
    setBusy(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Photos', 'Allow photo library access to attach images.')
        return
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85
      })
      if (res.canceled || !res.assets[0]?.uri) return
      onChange([
        ...items,
        await prepareImageMediaItem(res.assets[0].uri, `${section} photo`)
      ])
    } catch (err) {
      Alert.alert('Photos', err instanceof Error ? err.message : 'Could not open the photo library.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => void capture()} disabled={busy}>
          <Text style={styles.btnText}>📷 Camera</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.gallery]} onPress={() => void pickGallery()} disabled={busy}>
          <Text style={styles.btnText}>Add photo</Text>
        </Pressable>
      </View>
      {busy ? <ActivityIndicator color={jc.primary} style={{ marginBottom: 6 }} /> : null}
      <MediaGallery items={items} onChange={onChange} emptyLabel="No section photos yet" />
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    backgroundColor: jc.accentOrange,
    padding: 11,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  gallery: { backgroundColor: jc.accentTeal },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 }
  })
}