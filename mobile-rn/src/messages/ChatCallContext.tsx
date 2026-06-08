import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { RTCView, type MediaStream } from 'react-native-webrtc'
import { useAuth } from '../state/AuthContext'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'
import { stopCallRing } from '../services/notificationSounds'
import { chatApi } from './api'
import { useChatEvents } from './ChatEventsContext'
import { getActiveChatConversation } from './chatFocusState'
import type { ChatEventPayload } from './chatEventTypes'
import type { RTCSessionDescriptionInit } from 'react-native-webrtc/lib/typescript/RTCSessionDescription'
import { createChatCallSession, type CallSessionState } from './chatWebRtcCall'

type CallPhase = CallSessionState

type PendingIncoming = {
  callId: string
  conversationId: string
  media: 'audio' | 'video'
  fromName: string
  offer: RTCSessionDescriptionInit
}

type ChatCallContextValue = {
  phase: CallPhase
  registerConversation: (conversationId: string | null, opts?: { callId?: string; peerName?: string }) => void
  startOutgoing: (conversationId: string, media: 'audio' | 'video', peerName: string) => Promise<void>
}

const ChatCallContext = createContext<ChatCallContextValue | undefined>(undefined)

function ChatCallOverlay({
  phase,
  media,
  peerName,
  muted,
  cameraOff,
  localStream,
  remoteStream,
  onAccept,
  onReject,
  onHangUp,
  onToggleMute,
  onToggleCamera
}: {
  phase: CallPhase
  media: 'audio' | 'video'
  peerName: string
  muted: boolean
  cameraOff: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  onAccept: () => void
  onReject: () => void
  onHangUp: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
}) {
  const styles = useThemedStyles(createOverlayStyles)
  const { erp } = useTheme()

  if (!phase || phase === 'idle' || phase === 'ended') return null

  const isVideo = media === 'video'
  const title =
    phase === 'incoming'
      ? `Incoming ${isVideo ? 'video' : 'voice'} call`
      : phase === 'outgoing'
        ? `Calling ${peerName || '…'}`
        : phase === 'connecting'
          ? 'Connecting…'
          : `On call with ${peerName || 'colleague'}`

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{peerName}</Text>

          {isVideo && (phase === 'active' || phase === 'connecting') ? (
            <View style={styles.videoWrap}>
              {remoteStream ? (
                <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
              ) : (
                <View style={styles.remoteVideo} />
              )}
              {localStream && !cameraOff ? (
                <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" mirror />
              ) : null}
            </View>
          ) : (
            <View style={styles.voiceHero}>
              <Text style={styles.voiceIcon}>{isVideo ? '📹' : '📞'}</Text>
              <Text style={styles.voiceHint}>
                {phase === 'outgoing' ? 'Ringing…' : phase === 'incoming' ? 'Answer or decline' : 'Call in progress'}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            {phase === 'incoming' ? (
              <>
                <Pressable style={[styles.roundBtn, styles.rejectBtn]} onPress={onReject}>
                  <Text style={styles.roundBtnText}>✕</Text>
                </Pressable>
                <Pressable style={[styles.roundBtn, styles.acceptBtn]} onPress={onAccept}>
                  <Text style={styles.roundBtnText}>{isVideo ? '📹' : '📞'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {(phase === 'active' || phase === 'connecting') && (
                  <>
                    <Pressable
                      style={[styles.roundBtn, muted && styles.rejectBtn, { backgroundColor: erp.surface }]}
                      onPress={onToggleMute}
                    >
                      <Text style={styles.roundBtnText}>{muted ? '🔇' : '🎙'}</Text>
                    </Pressable>
                    {isVideo ? (
                      <Pressable
                        style={[styles.roundBtn, cameraOff && styles.rejectBtn, { backgroundColor: erp.surface }]}
                        onPress={onToggleCamera}
                      >
                        <Text style={styles.roundBtnText}>{cameraOff ? '🚫' : '📷'}</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
                <Pressable style={[styles.roundBtn, styles.rejectBtn]} onPress={onHangUp}>
                  <Text style={styles.roundBtnText}>✕</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function ChatCallProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth()
  const currentUserId = user?.id || ''
  const { subscribe } = useChatEvents()

  const [phase, setPhase] = useState<CallPhase>('idle')
  const [media, setMedia] = useState<'audio' | 'video'>('audio')
  const [peerName, setPeerName] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [pendingIncoming, setPendingIncoming] = useState<PendingIncoming | null>(null)

  const sessionRef = useRef<ReturnType<typeof createChatCallSession> | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const registeredConversationRef = useRef<string | null>(null)
  const accessTokenRef = useRef(accessToken)
  accessTokenRef.current = accessToken

  const resetCallUi = useCallback(() => {
    void stopCallRing()
    setPhase('idle')
    setPeerName('')
    setConversationId(null)
    conversationIdRef.current = null
    setMuted(false)
    setCameraOff(false)
    setLocalStream(null)
    setRemoteStream(null)
    setPendingIncoming(null)
    sessionRef.current = null
  }, [])

  const ensureSession = useCallback(
    (convId: string) => {
      if (sessionRef.current && conversationIdRef.current === convId) return sessionRef.current
      conversationIdRef.current = convId
      setConversationId(convId)
      const session = createChatCallSession({
        conversationId: convId,
        sendSignal: async (body) => {
          const token = accessTokenRef.current
          if (!token) throw new Error('Not signed in')
          await chatApi.sendCallSignal(token, convId, body)
        },
        onStateChange: (next) => {
          setPhase(next)
          if (next === 'ended') {
            setTimeout(() => resetCallUi(), 300)
          }
        },
        onRemoteStream: (stream) => setRemoteStream(stream),
        onError: (message) => Alert.alert('Call error', message)
      })
      sessionRef.current = session
      return session
    },
    [resetCallUi]
  )

  const handleRemoteSignal = useCallback(
    async (data: ChatEventPayload) => {
      if (!data.conversationId || !data.callId || !data.type) return
      if (data.fromUserId && data.fromUserId === currentUserId) return

      const convId = data.conversationId
      const session = ensureSession(convId)
      const result = await session.handleRemoteSignal({
        callId: data.callId,
        type: data.type,
        media: data.media,
        payload: data.payload as { sdp?: RTCSessionDescriptionInit } | null
      })

      if (result?.kind === 'busy') return

      if (result?.kind === 'incoming') {
        const offer =
          result.offer ||
          (data.payload && typeof data.payload === 'object' && 'sdp' in data.payload
            ? (data.payload as { sdp?: PendingIncoming['offer'] }).sdp
            : null)
        const mode = data.media === 'video' ? 'video' : 'audio'
        setMedia(mode)
        setPeerName(data.fromName || 'Someone')
        setPhase('incoming')
        if (offer) {
          setPendingIncoming({
            callId: data.callId,
            conversationId: convId,
            media: mode,
            fromName: data.fromName || 'Someone',
            offer
          })
        }
        return
      }

      if (result?.kind === 'rejected' || result?.kind === 'ended') {
        resetCallUi()
      }
    },
    [currentUserId, ensureSession, resetCallUi]
  )

  const fetchPending = useCallback(
    async (convId: string) => {
      const token = accessTokenRef.current
      if (!token || phase !== 'idle') return
      try {
        const pending = await chatApi.getCallPending(token, convId)
        if (!pending?.offer) return
        await handleRemoteSignal({
          conversationId: convId,
          callId: pending.callId,
          type: 'invite',
          media: pending.media,
          payload: { sdp: pending.offer },
          fromUserId: pending.fromUserId,
          fromName: pending.fromName
        })
      } catch {
        /* ignore */
      }
    },
    [handleRemoteSignal, phase]
  )

  const registerConversation = useCallback(
    (convId: string | null, opts?: { callId?: string; peerName?: string }) => {
      registeredConversationRef.current = convId
      if (opts?.peerName) setPeerName(opts.peerName)
      if (convId && (opts?.callId || phase === 'idle')) {
        void fetchPending(convId)
      }
    },
    [fetchPending, phase]
  )

  const startOutgoing = useCallback(
    async (convId: string, mode: 'audio' | 'video', name: string) => {
      if (phase !== 'idle') {
        Alert.alert('Busy', 'You are already in a call.')
        return
      }
      try {
        setPeerName(name)
        setMedia(mode)
        const session = ensureSession(convId)
        await session.startOutgoing(mode)
        setLocalStream(session.getLocalStream())
      } catch (err) {
        resetCallUi()
        Alert.alert('Call failed', err instanceof Error ? err.message : 'Could not start call')
      }
    },
    [ensureSession, phase, resetCallUi]
  )

  const acceptCall = useCallback(async () => {
    const pending = pendingIncoming
    const session = sessionRef.current
    if (!pending || !session) return
    try {
      void stopCallRing()
      await session.acceptIncoming(pending.callId, pending.media, pending.offer)
      setLocalStream(session.getLocalStream())
      setPendingIncoming(null)
    } catch (err) {
      resetCallUi()
      Alert.alert('Call failed', err instanceof Error ? err.message : 'Could not answer call')
    }
  }, [pendingIncoming, resetCallUi])

  const rejectCall = useCallback(async () => {
    void stopCallRing()
    try {
      await sessionRef.current?.rejectCall()
    } finally {
      resetCallUi()
    }
  }, [resetCallUi])

  const endCall = useCallback(async () => {
    void stopCallRing()
    try {
      await sessionRef.current?.endCall(true)
    } finally {
      resetCallUi()
    }
  }, [resetCallUi])

  const toggleMute = useCallback(() => {
    const next = sessionRef.current?.toggleMute()
    if (typeof next === 'boolean') setMuted(next)
  }, [])

  const toggleCamera = useCallback(() => {
    const next = sessionRef.current?.toggleCamera()
    if (typeof next === 'boolean') setCameraOff(next)
  }, [])

  useEffect(() => {
    return subscribe((event, data) => {
      if (event !== 'call') return
      void handleRemoteSignal(data)
    })
  }, [handleRemoteSignal, subscribe])

  const value = useMemo(
    () => ({ phase, registerConversation, startOutgoing }),
    [phase, registerConversation, startOutgoing]
  )

  return (
    <ChatCallContext.Provider value={value}>
      {children}
      <ChatCallOverlay
        phase={phase}
        media={media}
        peerName={peerName}
        muted={muted}
        cameraOff={cameraOff}
        localStream={localStream}
        remoteStream={remoteStream}
        onAccept={() => void acceptCall()}
        onReject={() => void rejectCall()}
        onHangUp={() => void endCall()}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    </ChatCallContext.Provider>
  )
}

export function useChatCall() {
  const ctx = useContext(ChatCallContext)
  if (!ctx) throw new Error('useChatCall must be used within ChatCallProvider')
  return ctx
}

function createOverlayStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.72)',
      justifyContent: 'center',
      padding: 20
    },
    card: {
      backgroundColor: erp.surface,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: erp.border
    },
    title: { fontSize: 18, fontWeight: '800', color: erp.text, paddingHorizontal: 16, paddingTop: 16 },
    subtitle: { fontSize: 14, color: erp.textSubtle, paddingHorizontal: 16, paddingBottom: 12 },
    videoWrap: { aspectRatio: 16 / 9, backgroundColor: '#000', position: 'relative' },
    remoteVideo: { flex: 1, width: '100%', height: '100%' },
    localVideo: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      width: 96,
      height: 128,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)'
    },
    voiceHero: { alignItems: 'center', paddingVertical: 36, backgroundColor: erp.bg },
    voiceIcon: { fontSize: 48, marginBottom: 8 },
    voiceHint: { fontSize: 14, color: erp.textSubtle },
    actions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 18,
      backgroundColor: erp.bg
    },
    roundBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center'
    },
    roundBtnText: { fontSize: 22 },
    acceptBtn: { backgroundColor: '#059669' },
    rejectBtn: { backgroundColor: '#dc2626' }
  })
}
