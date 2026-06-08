import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate
} from 'react-native-webrtc'
import type { RTCSessionDescriptionInit } from 'react-native-webrtc/lib/typescript/RTCSessionDescription'

const DEFAULT_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export type CallSignalPayload = {
  callId: string
  type: string
  media: 'audio' | 'video'
  payload?: unknown
}

export type CallSessionState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended'

function randomCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function createChatCallSession(options: {
  conversationId: string
  sendSignal: (body: CallSignalPayload) => Promise<void>
  onStateChange?: (state: CallSessionState) => void
  onRemoteStream?: (stream: MediaStream) => void
  onError?: (message: string) => void
}) {
  let pc: RTCPeerConnection | null = null
  let localStream: MediaStream | null = null
  let remoteStream: MediaStream | null = null
  let callId: string | null = null
  let mediaMode: 'audio' | 'video' = 'audio'
  let state: CallSessionState = 'idle'

  const setState = (next: CallSessionState) => {
    state = next
    options.onStateChange?.(next)
  }

  const signal = async (type: string, payload: unknown = null) => {
    if (!callId) return
    await options.sendSignal({ callId, type, media: mediaMode, payload })
  }

  const attachLocalTracks = () => {
    if (!pc || !localStream) return
    localStream.getTracks().forEach((track) => {
      const senders = pc!.getSenders().filter((s) => s.track?.kind === track.kind)
      if (senders.length) {
        void senders[0].replaceTrack(track)
      } else {
        pc!.addTrack(track, localStream!)
      }
    })
  }

  const createPeerConnection = () => {
    pc = new RTCPeerConnection(DEFAULT_ICE)
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) void signal('ice', event.candidate.toJSON())
    })
    pc.addEventListener('track', (event) => {
      if (!event.track) return
      if (!remoteStream) {
        remoteStream = new MediaStream()
        options.onRemoteStream?.(remoteStream)
      }
      remoteStream.addTrack(event.track)
    })
    pc.addEventListener('connectionstatechange', () => {
      if (pc?.connectionState === 'connected') setState('active')
      if (pc?.connectionState === 'failed' || pc?.connectionState === 'disconnected') {
        void endCall(true)
      }
    })
    attachLocalTracks()
    return pc
  }

  const getLocalMedia = async (mode: 'audio' | 'video') => {
    mediaMode = mode
    localStream?.getTracks?.().forEach((t) => t.stop())
    localStream = await mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video'
    })
    return localStream
  }

  const cleanup = () => {
    localStream?.getTracks?.().forEach((t) => t.stop())
    pc?.close?.()
    localStream = null
    pc = null
    remoteStream = null
  }

  const startOutgoing = async (mode: 'audio' | 'video') => {
    if (state !== 'idle') throw new Error('Already in a call')
    callId = randomCallId()
    setState('outgoing')
    await getLocalMedia(mode)
    createPeerConnection()
    const offer = await pc!.createOffer({})
    await pc!.setLocalDescription(offer)
    await signal('invite', { sdp: offer })
  }

  const acceptIncoming = async (
    incomingCallId: string,
    mode: 'audio' | 'video',
    offerSdp: RTCSessionDescriptionInit
  ) => {
    callId = incomingCallId
    setState('connecting')
    await getLocalMedia(mode)
    createPeerConnection()
    await pc!.setRemoteDescription(new RTCSessionDescription(offerSdp))
    const answer = await pc!.createAnswer()
    await pc!.setLocalDescription(answer)
    await signal('accept')
    await signal('answer', { sdp: answer })
    setState('active')
  }

  const handleRemoteSignal = async (data: {
    callId?: string
    type?: string
    media?: string
    payload?: { sdp?: RTCSessionDescriptionInit } | RTCIceCandidateInit | { reason?: string } | null
  }) => {
    if (!data?.callId) return null
    const type = data.type
    const payload = data.payload

    if (type === 'invite') {
      if (state !== 'idle') return { kind: 'busy' as const, data }
      callId = data.callId
      mediaMode = data.media === 'video' ? 'video' : 'audio'
      const sdp = payload && typeof payload === 'object' && 'sdp' in payload ? payload.sdp : null
      if (sdp) return { kind: 'incoming' as const, data, offer: sdp }
      setState('incoming')
      return { kind: 'incoming' as const, data, offer: null }
    }

    if (callId && data.callId !== callId) return null

    if (type === 'answer' && payload && typeof payload === 'object' && 'sdp' in payload && payload.sdp && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      setState('active')
      return null
    }

    if (type === 'ice' && payload && pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit))
      } catch {
        /* late candidate */
      }
      return null
    }

    if (type === 'accept' && state === 'outgoing') {
      setState('connecting')
      return null
    }

    if (type === 'reject' || type === 'end') {
      cleanup()
      setState('ended')
      callId = null
      return { kind: type === 'reject' ? ('rejected' as const) : ('ended' as const), data }
    }

    return null
  }

  const rejectCall = async () => {
    if (!callId) return
    await signal('reject', { reason: 'declined' })
    cleanup()
    setState('ended')
    callId = null
  }

  const endCall = async (notifyRemote = true) => {
    if (notifyRemote && callId) {
      try {
        await signal('end')
      } catch {
        /* ignore */
      }
    }
    cleanup()
    setState('ended')
    callId = null
  }

  const toggleMute = () => {
    const audio = localStream?.getAudioTracks?.()[0]
    if (!audio) return false
    audio.enabled = !audio.enabled
    return !audio.enabled
  }

  const toggleCamera = () => {
    const video = localStream?.getVideoTracks?.()[0]
    if (!video) return false
    video.enabled = !video.enabled
    return !video.enabled
  }

  return {
    startOutgoing,
    acceptIncoming,
    handleRemoteSignal,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    getLocalStream: () => localStream,
    getRemoteStream: () => remoteStream,
    getState: () => state,
    getCallId: () => callId,
    getMediaMode: () => mediaMode
  }
}
