import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Audio } from 'expo-av'
import type { VoiceClip } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useNetwork } from '../../hooks/useNetwork'
import {
  formatVoiceNoteTranscriptBlock,
  mimeFromRecordingUri,
  transcribeVoiceClip
} from './voiceTranscript'

type Props = {
  section: string
  voiceClips: VoiceClip[]
  onVoiceSaved: (clip: VoiceClip) => void
  onVoiceClipUpdate?: (id: string, patch: Partial<VoiceClip>) => void
  onRemove?: (id: string) => void
  fieldValue?: string
  onFieldChange?: (value: string) => void
  /** Called after a clip is transcribed so the draft can be saved locally / synced. */
  onAfterTranscription?: () => void
}

export function VoiceNoteField({
  section,
  voiceClips,
  onVoiceSaved,
  onVoiceClipUpdate,
  onRemove,
  fieldValue = '',
  onFieldChange,
  onAfterTranscription
}: Props) {
  const styles = useThemedStyles(createStyles)
  const { isOnline } = useNetwork()
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [transcribingClipId, setTranscribingClipId] = useState<string | null>(null)
  const [recordHint, setRecordHint] = useState('')
  const soundRef = useRef<Audio.Sound | null>(null)
  const fieldValueRef = useRef(fieldValue)
  const voiceClipsRef = useRef(voiceClips)
  const mountedRef = useRef(true)
  const sectionClips = voiceClips.filter((v) => v.section === section)

  useEffect(() => {
    fieldValueRef.current = fieldValue
  }, [fieldValue])

  useEffect(() => {
    voiceClipsRef.current = voiceClips
  }, [voiceClips])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void soundRef.current?.unloadAsync()
    }
  }, [])

  const pendingAutoKey = useMemo(
    () =>
      sectionClips
        .filter((c) => c.dataUrl && c.needsTranscription && !c.transcribed)
        .map((c) => c.id)
        .sort()
        .join('|'),
    [sectionClips]
  )

  async function transcribeClipBody(clip: VoiceClip, isCancelled?: () => boolean): Promise<boolean> {
    if (!clip.dataUrl || !onFieldChange) return false
    setRecordHint('')
    setTranscribingClipId(clip.id)
    try {
      const result = await transcribeVoiceClip(clip)
      if (isCancelled?.()) return false
      if (!result.ok) {
        if (!isCancelled?.()) setRecordHint(result.message)
        return false
      }
      const fresh = voiceClipsRef.current.find((c) => c.id === clip.id)
      if (!fresh || fresh.transcribed) return true
      const n = fresh.noteNumber != null ? fresh.noteNumber : 1
      const block = formatVoiceNoteTranscriptBlock(n, result.text)
      const prev = typeof fieldValueRef.current === 'string' ? fieldValueRef.current : ''
      const join = prev.trim() ? '\n\n' : ''
      const next = `${prev}${join}${block}`
      fieldValueRef.current = next
      onFieldChange(next)
      onVoiceClipUpdate?.(clip.id, { transcribed: true, needsTranscription: false })
      onAfterTranscription?.()
      return true
    } finally {
      if (mountedRef.current) {
        setTranscribingClipId((cur) => (cur === clip.id ? null : cur))
      }
    }
  }

  useEffect(() => {
    if (!pendingAutoKey || !onFieldChange) return undefined
    let cancelled = false
    const isCancelled = () => cancelled || !mountedRef.current

    void (async () => {
      const ids = pendingAutoKey.split('|').filter(Boolean)
      for (const id of ids) {
        if (isCancelled()) return
        const clip = voiceClipsRef.current.find((c) => c.id === id)
        if (!clip || !clip.dataUrl || clip.transcribed) continue
        await transcribeClipBody(clip, isCancelled)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pendingAutoKey, onFieldChange, isOnline])

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
          mimeType: mimeFromRecordingUri(uri),
          noteNumber: sectionClips.length + 1,
          needsTranscription: true,
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
      {recording ? (
        <Text style={styles.hintRecording}>Recording… speak, then tap stop to save and transcribe.</Text>
      ) : onFieldChange ? (
        <Text style={styles.hintIdle}>
          {isOnline
            ? 'Each clip is transcribed automatically into the field above.'
            : 'Recorded offline — transcription runs automatically when you are back online.'}
        </Text>
      ) : null}
      {recordHint ? <Text style={styles.hintError}>{recordHint}</Text> : null}
      {sectionClips.map((clip) => (
        <View key={clip.id} style={styles.clipRow}>
          <Pressable style={styles.playBtn} onPress={() => void playClip(clip)}>
            <Text style={styles.playBtnText}>{playingId === clip.id ? '⏸ Pause' : '▶ Play'}</Text>
          </Pressable>
          <Text style={styles.clipName} numberOfLines={1}>
            {clip.name || 'Voice note'}
          </Text>
          {clip.transcribed ? (
            <Text style={styles.transcribedBadge}>Transcribed</Text>
          ) : onFieldChange ? (
            <Pressable
              style={styles.transcribeBtn}
              disabled={Boolean(transcribingClipId)}
              onPress={() => void transcribeClipBody(clip)}
            >
              {transcribingClipId === clip.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.transcribeBtnText}>Transcribe</Text>
              )}
            </Pressable>
          ) : null}
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

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    recordBtn: {
      backgroundColor: jc.accentPurple,
      padding: 12,
      borderRadius: jc.radius.md,
      alignItems: 'center'
    },
    recording: { backgroundColor: jc.danger },
    recordBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    hintRecording: { color: jc.danger, fontSize: 11, fontWeight: '600' },
    hintIdle: { color: jc.textSubtle, fontSize: 11 },
    hintError: {
      color: jc.warning,
      fontSize: 11,
      backgroundColor: jc.warningSoft,
      padding: 8,
      borderRadius: jc.radius.sm
    },
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
    transcribedBadge: { color: jc.success, fontWeight: '600', fontSize: 11 },
    transcribeBtn: {
      backgroundColor: jc.primary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: jc.radius.sm,
      minWidth: 72,
      alignItems: 'center'
    },
    transcribeBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },
    remove: { color: jc.danger, fontWeight: '600', fontSize: 12 }
  })
}
