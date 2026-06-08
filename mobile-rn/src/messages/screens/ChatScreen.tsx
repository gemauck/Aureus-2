import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { Audio } from 'expo-av'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { apiUrl } from '../../config'
import { useAuth } from '../../state/AuthContext'

import { chatApi, type ChatAttachment, type ChatMessage, type MessageReadReceipts } from '../api'
import { CHAT_POLL_FALLBACK_MS, useChatEvents } from '../ChatEventsContext'
import type { ChatEventPayload, ChatEventType } from '../chatEventTypes'
import type { MessagesStackParamList } from '../navigation'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<MessagesStackParamList, 'Chat'>

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥']
const CHAT_TYPING_POLL_MS = 5000

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function resolveMediaUrl(url?: string) {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('file:') || url.startsWith('data:')) return url
  return apiUrl(url.startsWith('/') ? url : `/${url}`)
}

function VoiceAttachment({ attachment, mine }: { attachment: ChatAttachment; mine: boolean }) {
  const styles = useThemedStyles(createStyles)
  const [playing, setPlaying] = useState(false)
  const soundRef = useRef<Audio.Sound | null>(null)

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync()
    }
  }, [])

  const togglePlay = async () => {
    if (playing) {
      await soundRef.current?.stopAsync()
      await soundRef.current?.unloadAsync()
      soundRef.current = null
      setPlaying(false)
      return
    }
    const uri = resolveMediaUrl(attachment.url)
    if (!uri) return
    await soundRef.current?.unloadAsync()
    const { sound } = await Audio.Sound.createAsync({ uri })
    soundRef.current = sound
    setPlaying(true)
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) setPlaying(false)
    })
    await sound.playAsync()
  }

  return (
    <View style={[styles.voiceAttach, mine && styles.voiceAttachMine]}>
      <Pressable style={styles.voicePlayBtn} onPress={() => void togglePlay()}>
        <Text style={styles.voicePlayText}>{playing ? '⏸' : '▶'}</Text>
      </Pressable>
      <Text style={[styles.voiceLabel, mine && styles.voiceLabelMine]} numberOfLines={1}>
        {attachment.name || 'Voice message'}
      </Text>
    </View>
  )
}

function ReadReceiptsModal({
  visible,
  data,
  loading,
  onClose
}: {
  visible: boolean
  data: MessageReadReceipts | null
  loading: boolean
  onClose: () => void
}) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Read receipts</Text>
          {loading ? (
            <ActivityIndicator color={erp.primary} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <Text style={styles.modalSection}>Read by</Text>
              {(data?.readBy || []).length ? (
                (data?.readBy || []).map((r) => (
                  <View key={r.userId} style={styles.receiptRow}>
                    <Text style={styles.receiptName}>{r.user?.name || r.user?.email || 'User'}</Text>
                    <Text style={styles.receiptTime}>{fmt(r.readAt)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.receiptEmpty}>Not read yet</Text>
              )}
              {(data?.pending || []).length > 0 && (
                <>
                  <Text style={[styles.modalSection, { marginTop: 12 }]}>Delivered · not read</Text>
                  {(data?.pending || []).map((p) => (
                    <Text key={p.userId} style={styles.receiptPending}>
                      {p.user?.name || p.user?.email}
                    </Text>
                  ))}
                </>
              )}
            </>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function ChatScreen({ route }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const { conversationId } = route.params
  const { accessToken, user } = useAuth()
  const { connected, subscribe, refreshChatUnread } = useChatEvents()
  const userId = user?.id || ''
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [typingLabel, setTypingLabel] = useState('')
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [readsModal, setReadsModal] = useState<{ id: string; data: MessageReadReceipts | null; loading: boolean } | null>(
    null
  )
  const lastTypingRef = useRef(0)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<FlatList>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        const list = await chatApi.getMessages(accessToken, conversationId)
        if (silent) {
          setMessages((prev) => {
            if (!prev.length) return list
            const ids = new Set(prev.map((m) => m.id))
            const merged = [...prev]
            for (const m of list) {
              if (!ids.has(m.id)) merged.push(m)
            }
            return merged.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )
          })
        } else {
          setMessages(list)
        }
        await chatApi.markRead(accessToken, conversationId)
        void refreshChatUnread()
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [accessToken, conversationId, refreshChatUnread]
  )

  const setTypingFromNames = useCallback((names: string[]) => {
    if (typingClearRef.current) clearTimeout(typingClearRef.current)
    if (!names.length) {
      setTypingLabel('')
      return
    }
    if (names.length === 1) setTypingLabel(`${names[0]} is typing…`)
    else setTypingLabel(`${names.length} people are typing…`)
    typingClearRef.current = setTimeout(() => setTypingLabel(''), 5000)
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => load(true), CHAT_POLL_FALLBACK_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const onEvent = (event: ChatEventType, data: ChatEventPayload) => {
      if (data.conversationId !== conversationId) return

      if (event === 'message' || event === 'reaction') {
        void load(true)
        return
      }

      if (event === 'message_updated' && data.message) {
        setMessages((prev) => prev.map((m) => (m.id === data.message!.id ? data.message! : m)))
        return
      }

      if (event === 'message_deleted' && data.messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, deletedAt: new Date().toISOString(), content: '' }
              : m
          )
        )
        return
      }

      if (event === 'typing' && data.userId && data.userId !== userId) {
        setTypingFromNames([data.name || 'Someone'])
      }
    }

    return subscribe(onEvent)
  }, [conversationId, load, setTypingFromNames, subscribe, userId])

  useEffect(() => {
    if (connected || !accessToken) return
    const id = setInterval(async () => {
      try {
        const typing = await chatApi.getTyping(accessToken, conversationId)
        setTypingFromNames(typing.map((t) => t.name))
      } catch {
        setTypingLabel('')
      }
    }, CHAT_TYPING_POLL_MS)
    return () => clearInterval(id)
  }, [accessToken, connected, conversationId, setTypingFromNames])

  useEffect(() => {
    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current)
    }
  }, [])

  const onChangeText = (value: string) => {
    setText(value)
    if (!accessToken || !value.trim()) return
    const now = Date.now()
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now
      void chatApi.pingTyping(accessToken, conversationId)
    }
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!accessToken) return
    try {
      const res = await chatApi.toggleReaction(accessToken, messageId, emoji)
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactionGroups: res.reactionGroups } : m))
      )
    } finally {
      setPickerMessageId(null)
    }
  }

  const showMessageActions = (item: ChatMessage) => {
    if (item.senderId !== userId || item.deletedAt) return
    Alert.alert('Message', undefined, [
      { text: 'Edit', onPress: () => { setEditingId(item.id); setEditText(item.content || '') } },
      { text: 'Delete', style: 'destructive', onPress: () => void confirmDelete(item.id) },
      { text: 'Cancel', style: 'cancel' }
    ])
  }

  const confirmDelete = async (messageId: string) => {
    if (!accessToken) return
    Alert.alert('Delete message', 'Delete for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await chatApi.deleteMessage(accessToken, messageId)
            setMessages((prev) =>
              prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m))
            )
          })()
        }
      }
    ])
  }

  const saveEdit = async () => {
    const content = editText.trim()
    if (!accessToken || !editingId || !content) return
    try {
      const updated = await chatApi.editMessage(accessToken, editingId, content)
      setMessages((prev) => prev.map((m) => (m.id === editingId ? updated : m)))
      setEditingId(null)
      setEditText('')
    } catch (e) {
      Alert.alert('Edit failed', e instanceof Error ? e.message : 'Could not edit message')
    }
  }

  const openReadReceipts = async (messageId: string) => {
    if (!accessToken) return
    setReadsModal({ id: messageId, data: null, loading: true })
    try {
      const data = await chatApi.getMessageReads(accessToken, messageId)
      setReadsModal({ id: messageId, data, loading: false })
    } catch {
      setReadsModal({ id: messageId, data: null, loading: false })
    }
  }

  const toggleVoiceRecord = async () => {
    if (recording) {
      setUploadingVoice(true)
      try {
        await recording.stopAndUnloadAsync()
        const uri = recording.getURI()
        setRecording(null)
        if (!uri || !accessToken) return
        const uploaded = await chatApi.uploadVoiceNote(accessToken, uri)
        const msg = await chatApi.sendMessage(accessToken, conversationId, {
          content: '',
          attachments: [{ name: uploaded.name || 'Voice message', url: uploaded.url, mimeType: uploaded.mimeType, kind: 'voice' }]
        })
        setMessages((prev) => [...prev, msg])
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
      } catch (e) {
        Alert.alert('Voice note', e instanceof Error ? e.message : 'Could not send voice note')
      } finally {
        setUploadingVoice(false)
      }
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
  }

  const send = async () => {
    const content = text.trim()
    if (!content || !accessToken || sending) return
    setSending(true)
    try {
      const msg = await chatApi.sendMessage(accessToken, conversationId, { content })
      setMessages((prev) => [...prev, msg])
      setText('')
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading && !messages.length ? (
        <ActivityIndicator style={styles.loader} color={erp.primary} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderId === userId
            const isAudioOnly =
              !item.deletedAt &&
              !item.content &&
              (item.attachments || []).length === 1 &&
              (item.attachments![0].kind === 'voice' ||
                (item.attachments![0].mimeType || '').startsWith('audio/'))
            return (
              <Pressable
                style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}
                onLongPress={() => showMessageActions(item)}
                delayLongPress={400}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && item.sender?.name ? (
                    <Text style={styles.senderName}>{item.sender.name}</Text>
                  ) : null}
                  {item.deletedAt ? (
                    <Text style={[styles.deletedText, mine && styles.bubbleTextMine]}>Message deleted</Text>
                  ) : editingId === item.id ? (
                    <View style={styles.editBox}>
                      <TextInput
                        style={styles.editInput}
                        value={editText}
                        onChangeText={setEditText}
                        multiline
                        autoFocus
                      />
                      <View style={styles.editActions}>
                        <Pressable onPress={() => { setEditingId(null); setEditText('') }}>
                          <Text style={styles.editCancel}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={() => void saveEdit()} disabled={!editText.trim()}>
                          <Text style={[styles.editSave, !editText.trim() && styles.editSaveDisabled]}>Save</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      {item.content ? (
                        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
                      ) : null}
                      {(item.attachments || []).map((a, i) => {
                        const isAudio = a.kind === 'voice' || (a.mimeType || '').startsWith('audio/')
                        if (isAudio) return <VoiceAttachment key={i} attachment={a} mine={mine} />
                        return (
                          <Text key={i} style={[styles.fileAttach, mine && styles.bubbleTextMine]}>
                            📎 {a.name || 'File'}
                          </Text>
                        )
                      })}
                    </>
                  )}
                  {!editingId || editingId !== item.id ? (
                    <View style={styles.metaRow}>
                      {item.editedAt && !item.deletedAt ? (
                        <Text style={[styles.edited, mine && styles.timeMine]}>edited </Text>
                      ) : null}
                      <Text style={[styles.time, mine && styles.timeMine]}>{formatMsgTime(item.createdAt)}</Text>
                      {mine && !item.deletedAt ? (
                        <Pressable onPress={() => void openReadReceipts(item.id)} hitSlop={8}>
                          <Text style={[styles.readTick, mine && styles.timeMine]}> ✓✓</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                {(item.reactionGroups || []).length > 0 && (
                  <View style={styles.reactionRow}>
                    {(item.reactionGroups || []).map((g) => (
                      <Pressable key={g.emoji} style={styles.reactionChip} onPress={() => toggleReaction(item.id, g.emoji)}>
                        <Text style={styles.reactionChipText}>
                          {g.emoji} {g.count}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {pickerMessageId === item.id && (
                  <View style={styles.reactionPicker}>
                    {REACTIONS.map((emoji) => (
                      <Pressable key={emoji} onPress={() => toggleReaction(item.id, emoji)}>
                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {!item.deletedAt && !isAudioOnly ? (
                  <Pressable onPress={() => setPickerMessageId(pickerMessageId === item.id ? null : item.id)}>
                    <Text style={styles.reactLink}>{pickerMessageId === item.id ? 'Close' : 'React'}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            )
          }}
        />
      )}

      {typingLabel ? <Text style={styles.typing}>{typingLabel}</Text> : null}

      <View style={styles.compose}>
        <Pressable
          style={[styles.micBtn, recording && styles.micBtnActive]}
          onPress={() => void toggleVoiceRecord()}
          disabled={uploadingVoice || sending}
        >
          {uploadingVoice ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.micIcon}>{recording ? '⏹' : '🎙'}</Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={recording ? 'Recording… tap stop to send' : 'Type a message…'}
          placeholderTextColor={erp.textSubtle}
          value={text}
          onChangeText={onChangeText}
          multiline
          maxLength={10000}
          editable={!recording}
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending || recording) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim() || sending || !!recording}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendIcon}>➤</Text>
          )}
        </Pressable>
      </View>

      <ReadReceiptsModal
        visible={!!readsModal}
        data={readsModal?.data ?? null}
        loading={readsModal?.loading ?? false}
        onClose={() => setReadsModal(null)}
      />
    </KeyboardAvoidingView>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  loader: { marginTop: 40 },
  list: { padding: 12, paddingBottom: 8 },
  bubbleWrap: { marginVertical: 3, maxWidth: '85%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: erp.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: erp.surface,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: erp.border
  },
  senderName: { fontSize: 11, fontWeight: '700', color: erp.primary, marginBottom: 2 },
  bubbleText: { fontSize: 16, lineHeight: 22, color: erp.text },
  bubbleTextMine: { color: '#fff' },
  deletedText: { fontSize: 15, fontStyle: 'italic', opacity: 0.65, color: erp.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, alignSelf: 'flex-end' },
  time: { fontSize: 10, color: erp.textSubtle },
  timeMine: { color: 'rgba(255,255,255,0.75)' },
  edited: { fontSize: 10, color: erp.textSubtle },
  readTick: { fontSize: 10, color: erp.textSubtle },
  voiceAttach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)'
  },
  voiceAttachMine: { backgroundColor: 'rgba(255,255,255,0.15)' },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: erp.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  voicePlayText: { color: '#fff', fontWeight: '700' },
  voiceLabel: { flex: 1, fontSize: 13, color: erp.text },
  voiceLabelMine: { color: '#fff' },
  fileAttach: { fontSize: 14, marginTop: 4, color: erp.text },
  editBox: { gap: 8 },
  editInput: {
    backgroundColor: erp.surfaceMuted,
    borderRadius: 10,
    padding: 8,
    fontSize: 15,
    color: erp.text,
    minHeight: 60
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  editCancel: { color: erp.textSubtle, fontWeight: '600' },
  editSave: { color: erp.primary, fontWeight: '700' },
  editSaveDisabled: { opacity: 0.4 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  reactionChip: {
    backgroundColor: erp.surface,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: erp.border
  },
  reactionChipText: { fontSize: 13 },
  reactionPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    padding: 8,
    backgroundColor: erp.surface,
    borderRadius: 12
  },
  reactionEmoji: { fontSize: 22 },
  reactLink: { fontSize: 12, color: erp.primary, marginTop: 4, fontWeight: '600' },
  typing: {
    fontSize: 12,
    fontStyle: 'italic',
    color: erp.success,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: erp.surface
  },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    backgroundColor: erp.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: erp.border
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: erp.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  micBtnActive: { backgroundColor: erp.danger },
  micIcon: { fontSize: 18 },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: erp.surfaceMuted,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: erp.text
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: erp.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end'
  },
  modalSheet: {
    backgroundColor: erp.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%'
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: erp.text, marginBottom: 12 },
  modalSection: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: erp.textSubtle, marginBottom: 6 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  receiptName: { fontSize: 15, color: erp.text },
  receiptTime: { fontSize: 12, color: erp.textSubtle },
  receiptEmpty: { fontSize: 14, color: erp.textSubtle, fontStyle: 'italic' },
  receiptPending: { fontSize: 14, color: erp.textSubtle, paddingVertical: 4 },
  modalClose: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: erp.surfaceMuted,
    borderRadius: 12
  },
  modalCloseText: { fontWeight: '700', color: erp.primary }
  })
}