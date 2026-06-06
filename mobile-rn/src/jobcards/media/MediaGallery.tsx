import React, { useState } from 'react'
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native'
import { jc } from '../theme'
import type { MediaItem } from '../types'

type Props = {
  items: MediaItem[]
  onChange?: (items: MediaItem[]) => void
  readOnly?: boolean
  emptyLabel?: string
}

export function MediaGallery({ items, onChange, readOnly, emptyLabel = 'No photos yet' }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const { width } = useWindowDimensions()
  const thumbSize = Math.min(88, (width - 64) / 3)

  function removeAt(index: number) {
    if (!onChange || readOnly) return
    onChange(items.filter((_, i) => i !== index))
    setViewerIndex(null)
  }

  if (!items.length) {
    return <Text style={styles.empty}>{emptyLabel}</Text>
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {items.map((item, index) => {
          const isVideo =
            item.mediaType === 'video' ||
            /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item.url) ||
            item.url.startsWith('data:video')
          return (
            <Pressable
              key={`${item.url}-${index}`}
              onPress={() => setViewerIndex(index)}
              style={[styles.thumbWrap, { width: thumbSize, height: thumbSize }]}
            >
              {isVideo ? (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Text style={styles.videoIcon}>▶</Text>
                  <Text style={styles.videoLabel}>Video</Text>
                </View>
              ) : (
                <Image source={{ uri: item.thumbUrl || item.url }} style={styles.thumb} resizeMode="cover" />
              )}
              {!readOnly && onChange ? (
                <Pressable style={styles.removeBadge} onPress={() => removeAt(index)} hitSlop={6}>
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>

      <Modal visible={viewerIndex !== null} transparent animationType="fade">
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerCloseArea} onPress={() => setViewerIndex(null)} />
          {viewerIndex !== null && items[viewerIndex] ? (
            <View style={styles.viewerCard}>
              <Text style={styles.viewerTitle} numberOfLines={2}>
                {items[viewerIndex].name || 'Attachment'}
              </Text>
              {items[viewerIndex].url.startsWith('data:video') ||
              items[viewerIndex].mediaType === 'video' ? (
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.videoPlaceholderText}>Video attached — open on web to play</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: items[viewerIndex].url }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                />
              )}
              <View style={styles.viewerActions}>
                {!readOnly && onChange ? (
                  <Pressable style={styles.viewerDelete} onPress={() => removeAt(viewerIndex)}>
                    <Text style={styles.viewerDeleteText}>Remove</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.viewerDone} onPress={() => setViewerIndex(null)}>
                  <Text style={styles.viewerDoneText}>Close</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  empty: { color: jc.textMuted, fontSize: 14, fontStyle: 'italic' },
  strip: { gap: 10, paddingVertical: 4 },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: jc.radius.md,
    backgroundColor: jc.surfaceMuted
  },
  videoThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: jc.primarySoft },
  videoIcon: { fontSize: 22, color: jc.primary },
  videoLabel: { fontSize: 10, color: jc.primaryDark, marginTop: 2, fontWeight: '600' },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: jc.danger,
    alignItems: 'center',
    justifyContent: 'center'
  },
  removeText: { color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.92)',
    justifyContent: 'center',
    padding: jc.space.lg
  },
  viewerCloseArea: { ...StyleSheet.absoluteFillObject },
  viewerCard: {
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xl,
    padding: jc.space.lg,
    maxHeight: '85%'
  },
  viewerTitle: { fontWeight: '700', fontSize: 16, color: jc.text, marginBottom: jc.space.sm },
  viewerImage: { width: '100%', height: 360, borderRadius: jc.radius.md, backgroundColor: '#000' },
  videoPlaceholder: {
    height: 200,
    borderRadius: jc.radius.md,
    backgroundColor: jc.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: jc.space.lg
  },
  videoPlaceholderText: { color: jc.primaryDark, textAlign: 'center', fontWeight: '600' },
  viewerActions: { flexDirection: 'row', gap: jc.space.sm, marginTop: jc.space.md },
  viewerDelete: {
    flex: 1,
    padding: 12,
    borderRadius: jc.radius.md,
    backgroundColor: jc.dangerSoft,
    alignItems: 'center'
  },
  viewerDeleteText: { color: jc.danger, fontWeight: '700' },
  viewerDone: {
    flex: 1,
    padding: 12,
    borderRadius: jc.radius.md,
    backgroundColor: jc.primary,
    alignItems: 'center'
  },
  viewerDoneText: { color: '#fff', fontWeight: '700' }
})
