// 1:1 WebRTC voice/video calls — signaling relayed via /api/chat/conversations/:id/call-signal

const DEFAULT_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function randomCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChatCallSession({
  conversationId,
  sendSignal,
  onStateChange,
  onRemoteStream,
  onError
}) {
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let callId = null;
  let mediaMode = 'audio';
  let state = 'idle';

  const setState = (next) => {
    state = next;
    onStateChange?.(next, { callId, mediaMode });
  };

  const reportError = (err) => {
    const message = err?.message || String(err || 'Call failed');
    onError?.(message);
  };

  async function signal(type, payload = null) {
    if (!callId) return;
    await sendSignal({ callId, type, media: mediaMode, payload });
  }

  function attachLocalTracks() {
    if (!pc || !localStream) return;
    localStream.getTracks().forEach((track) => {
      const senders = pc.getSenders().filter((s) => s.track?.kind === track.kind);
      if (senders.length) {
        senders[0].replaceTrack(track);
      } else {
        pc.addTrack(track, localStream);
      }
    });
  }

  function createPeerConnection() {
    pc = new RTCPeerConnection(DEFAULT_ICE);
    pc.onicecandidate = (event) => {
      if (event.candidate) void signal('ice', event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        onRemoteStream?.(remoteStream);
      }
      remoteStream.addTrack(event.track);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setState('active');
      if (pc.connectionState === 'failed') {
        reportError(new Error('Connection failed — try again or check your network'));
        void endCall(true);
      }
      if (pc.connectionState === 'disconnected') {
        void endCall(true);
      }
    };
    attachLocalTracks();
    return pc;
  }

  async function getLocalMedia(mode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls are not supported in this browser');
    }
    mediaMode = mode === 'video' ? 'video' : 'audio';
    const constraints = mediaMode === 'video'
      ? { audio: true, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { audio: true, video: false };
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return localStream;
  }

  function cleanup() {
    localStream?.getTracks?.().forEach((t) => t.stop());
    pc?.close?.();
    localStream = null;
    pc = null;
    remoteStream = null;
  }

  async function startOutgoing(mode) {
    if (!window.RTCPeerConnection) throw new Error('Calls are not supported in this browser');
    if (state !== 'idle') throw new Error('Already in a call');
    callId = randomCallId();
    setState('outgoing');
    await getLocalMedia(mode);
    createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await signal('invite', { sdp: offer });
  }

  async function acceptIncoming(incomingCallId, mode, offerSdp) {
    if (!window.RTCPeerConnection) throw new Error('Calls are not supported in this browser');
    callId = incomingCallId;
    setState('connecting');
    await getLocalMedia(mode);
    createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await signal('accept');
    await signal('answer', { sdp: answer });
    setState('active');
  }

  async function handleRemoteSignal(data) {
    if (!data?.callId) return;
    const type = data.type;
    const payload = data.payload;

    if (type === 'invite') {
      if (state !== 'idle') {
        return { kind: 'busy', data };
      }
      callId = data.callId;
      mediaMode = data.media === 'video' ? 'video' : 'audio';
      if (payload?.sdp) {
        return { kind: 'incoming', data, offer: payload.sdp };
      }
      setState('incoming');
      return { kind: 'incoming', data, offer: null };
    }

    if (callId && data.callId !== callId) return null;

    if (type === 'offer' && payload?.sdp) {
      if (state === 'idle') {
        mediaMode = data.media === 'video' ? 'video' : 'audio';
        return { kind: 'incoming', data, offer: payload.sdp };
      }
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      return null;
    }

    if (type === 'answer' && payload?.sdp && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      setState('active');
      return null;
    }

    if (type === 'ice' && payload && pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
      } catch (_) { /* ignore late candidates */ }
      return null;
    }

    if (type === 'accept' && state === 'outgoing') {
      setState('connecting');
      return null;
    }

    if (type === 'reject') {
      cleanup();
      setState('ended');
      callId = null;
      return { kind: 'rejected', data };
    }

    if (type === 'end') {
      cleanup();
      setState('ended');
      callId = null;
      return { kind: 'ended', data };
    }

    return null;
  }

  async function rejectCall(reason = 'declined') {
    if (!callId) return;
    await signal('reject', { reason });
    cleanup();
    setState('ended');
    callId = null;
  }

  async function endCall(notifyRemote = true) {
    if (notifyRemote && callId) {
      try {
        await signal('end');
      } catch (_) { /* ignore */ }
    }
    cleanup();
    setState('ended');
    callId = null;
  }

  function toggleMute() {
    const audio = localStream?.getAudioTracks?.()[0];
    if (!audio) return false;
    audio.enabled = !audio.enabled;
    return !audio.enabled;
  }

  function toggleCamera() {
    const video = localStream?.getVideoTracks?.()[0];
    if (!video) return false;
    video.enabled = !video.enabled;
    return !video.enabled;
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
  };
}

if (typeof window !== 'undefined') {
  window.chatWebRtcCall = { createChatCallSession, DEFAULT_ICE };
}
