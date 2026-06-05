import React, { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { MediaGallery } from './MediaGallery'
import { jc } from '../theme'
import type { MediaItem } from '../types'

type Props = {
  section: string
  items: MediaItem[]
  onChange: (items: MediaItem[]) => void
}

export function SectionMediaPicker({ section, items, onChange }: Props) {
  const [busy, setBusy] = useState(false)

  async function capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera', 'Allow camera access.')
      return
    }
    setBusy(true)
    try {
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85
      })
      if (res.canceled) return
      const manipulated = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      )
      onChange([
        ...items,
        {
          url: `data:image/jpeg;base64,${manipulated.base64 || ''}`,
          name: `${section} photo`
        }
      ])
    } finally {
      setBusy(false)
    }
  }

  async function pickGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    setBusy(true)
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85
      })
      if (res.canceled) return
      const manipulated = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      )
      onChange([
        ...items,
        {
          url: `data:image/jpeg;base64,${manipulated.base64 || ''}`,
          name: `${section} photo`
        }
      ])
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

const styles = StyleSheet.create({
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
