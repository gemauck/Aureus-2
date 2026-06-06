import React, { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Audio } from 'expo-av'
import { jc } from '../theme'
import type { VoiceClip } from '../types'

type Props = {
  section: string
  voiceClips: VoiceClip[]
  onVoiceSaved: (clip: VoiceClip) => void
  onRemove?: (id: string) => void
}

export function VoiceNoteField({ section, voiceClips, onVoiceSaved, onRemove }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const soundRef = useRef<Audio.Sound | null>(null)
  const sectionClips = voiceClips.filter((v) => v.section === section)

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync()
    }
  }, [])

  async function toggleRecord() {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync()
        const uri = recording.getURI()
        setRecording(null)
        if (!uri) return
        onVoiceSaved({
          id: `voice_${Date.now()}`,
          section,
          dataUrl: uri,
          name: `Voice note ${sectionClips.length + 1}`
        })
        return
      }
      const perm = await Audio.requestPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Microphone', 'Allow microphone access to record voice notes.')
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      })
      const rec = new Audio.Recording()
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await rec.startAsync()
      setRecording(rec)
    } catch (err) {
      setRecording(null)
      Alert.alert(
        'Voice note',
        err instanceof Error ? err.message : 'Could not start recording. Try again.'
      )
    }
  }

  async function playClip(clip: VoiceClip) {
    try {
      if (playingId === clip.id) {
        await soundRef.current?.stopAsync()
        await soundRef.current?.unloadAsync()
        soundRef.current = null
        setPlayingId(null)
        return
      }
      await soundRef.current?.unloadAsync()
      const { sound } = await Audio.Sound.createAsync({ uri: clip.dataUrl })
      soundRef.current = sound
      setPlayingId(clip.id)
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null)
        }
      })
      await sound.playAsync()
    } catch {
      setPlayingId(null)
      Alert.alert('Voice note', 'Could not play this recording.')
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.recordBtn, recording && styles.recording]}
        onPress={() => void toggleRecord()}
      >
        <Text style={styles.recordBtnText}>
          {recording ? '● Stop recording' : '🎙 Record voice note'}
        </Text>
      </Pressable>
      {sectionClips.map((clip) => (
        <View key={clip.id} style={styles.clipRow}>
          <Pressable style={styles.playBtn} onPress={() => void playClip(clip)}>
            <Text style={styles.playBtnText}>{playingId === clip.id ? '⏸ Pause' : '▶ Play'}</Text>
          </Pressable>
          <Text style={styles.clipName} numberOfLines={1}>
            {clip.name || 'Voice note'}
          </Text>
          {onRemove ? (
            <Pressable onPress={() => onRemove(clip.id)} hitSlop={8}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  recordBtn: {
    backgroundColor: jc.accentPurple,
    padding: 12,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  recording: { backgroundColor: jc.danger },
  recordBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: jc.primarySoft,
    padding: 10,
    borderRadius: jc.radius.md
  },
  playBtn: {
    backgroundColor: jc.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: jc.radius.sm
  },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  clipName: { flex: 1, color: jc.text, fontSize: 13, fontWeight: '500' },
  remove: { color: jc.danger, fontWeight: '600', fontSize: 12 }
})
