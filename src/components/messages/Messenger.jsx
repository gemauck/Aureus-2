// ERP Messenger — WhatsApp/Slack-style direct & group messaging
const { useState, useEffect, useCallback, useRef, useMemo } = React;

const POLL_ACTIVE_MS = 30000;
const POLL_LIST_MS = 30000;
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];
const CHAT_LIST_CACHE_KEY = 'abcotronics_chat_conversations_v1';
const CHAT_MESSAGES_CACHE_KEY = 'abcotronics_chat_messages_v1';
const CHAT_MESSAGES_CACHE_MAX_CONVS = 25;

function readConversationCache() {
  try {
    const raw = sessionStorage.getItem(CHAT_LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.conversations)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeConversationCache(conversations, totalUnread) {
  try {
    sessionStorage.setItem(CHAT_LIST_CACHE_KEY, JSON.stringify({
      conversations,
      totalUnread: totalUnread || 0,
      at: Date.now()
    }));
  } catch (_) { /* quota / private mode */ }
}

function readMessagesCacheStore() {
  try {
    const raw = sessionStorage.getItem(CHAT_MESSAGES_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readMessagesCache(conversationId) {
  if (!conversationId) return null;
  const entry = readMessagesCacheStore()[conversationId];
  if (!entry || !Array.isArray(entry.messages) || !entry.messages.length) return null;
  return entry.messages;
}

function writeMessagesCache(conversationId, messages) {
  if (!conversationId || !Array.isArray(messages) || !messages.length) return;
  try {
    const store = readMessagesCacheStore();
    store[conversationId] = { messages, at: Date.now() };
    const ids = Object.keys(store);
    if (ids.length > CHAT_MESSAGES_CACHE_MAX_CONVS) {
      ids.sort((a, b) => (store[a]?.at || 0) - (store[b]?.at || 0));
      for (let i = 0; i < ids.length - CHAT_MESSAGES_CACHE_MAX_CONVS; i += 1) {
        delete store[ids[i]];
      }
    }
    sessionStorage.setItem(CHAT_MESSAGES_CACHE_KEY, JSON.stringify(store));
  } catch (_) { /* quota / private mode */ }
}

function chatFetch(path, options = {}) {
  const token = window.storage?.getToken?.();
  const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
  const url = path.startsWith('http') ? path : `${apiBase}${path.startsWith('/') ? path : `/api/chat/${path}`}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    credentials: 'include'
  }).then(async (res) => {
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.details || data?.message || res.statusText;
      throw new Error(msg || 'Request failed');
    }
    return data?.data ?? data;
  });
}

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function pickAudioRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function createMediaRecorder(stream) {
  try {
    const mime = pickAudioRecorderMimeType();
    if (mime) return new MediaRecorder(stream, { mimeType: mime });
    return new MediaRecorder(stream);
  } catch (_) {
    return new MediaRecorder(stream);
  }
}

function formatMessageTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ user, size = 40, className = '' }) {
  const name = user?.name || user?.email || '';
  const bg = user?.online ? 'bg-emerald-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600';
  if (user?.avatar) {
    return (
      <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
        <img src={user.avatar} alt="" className="rounded-full object-cover w-full h-full ring-2 ring-white/10" />
        {user.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" />}
      </div>
    );
  }
  return (
    <div className={`relative shrink-0 rounded-full ${bg} text-white font-semibold flex items-center justify-center shadow-md ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials(name, user?.email)}
      {user?.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-300 border-2 border-white rounded-full" />}
    </div>
  );
}

function ReadTicks({ message, isMine, participants, currentUserId, onShowReads }) {
  if (!isMine) return null;
  const others = (participants || []).filter((p) => p.userId !== currentUserId);
  if (!others.length) return <i className="fas fa-check text-[10px] opacity-60 ml-1" title="Sent" />;
  const readByAll = others.every((p) => {
    const read = (message.reads || []).some((r) => r.userId === p.userId);
    const lastRead = p.lastReadAt && new Date(p.lastReadAt) >= new Date(message.createdAt);
    return read || lastRead;
  });
  return (
    <button type="button" onClick={() => onShowReads?.(message)} className="ml-0.5 opacity-90 hover:opacity-100" title={readByAll ? 'Read by everyone' : 'Delivered — tap for details'}>
      <i className={`fas fa-check-double text-[10px] ${readByAll ? 'text-sky-300' : 'opacity-50'}`} />
    </button>
  );
}

function ChatAttachmentItem({ attachment, isMine, isDark }) {
  const url = attachment?.url;
  if (!url) return null;
  const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
  const src = url.startsWith('http') ? url : `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
  const mime = attachment.mimeType || '';
  const isAudio = attachment.kind === 'voice' || mime.startsWith('audio/');
  if (isAudio) {
    return (
      <div className={`mt-2 rounded-xl p-2 ${isMine ? 'bg-white/15' : (isDark ? 'bg-gray-700' : 'bg-gray-100')}`}>
        <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
          <i className="fas fa-microphone" />
          <span>{attachment.name || 'Voice message'}</span>
        </div>
        <audio controls preload="metadata" src={src} className="w-full max-w-[240px] h-9" />
      </div>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-2 mt-2 p-2 rounded-lg text-sm ${isMine ? 'bg-white/10' : (isDark ? 'bg-gray-700' : 'bg-gray-100')}`}>
      <i className="fas fa-paperclip" />
      <span className="truncate">{attachment.name || 'File'}</span>
    </a>
  );
}

function ReadReceiptsPanel({ messageId, onClose, isDark }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  useEffect(() => {
    let cancelled = false;
    chatFetch(`/api/chat/messages/${messageId}/reads`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [messageId]);

  const fmt = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full sm:max-w-sm rounded-2xl shadow-2xl border p-4 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Read receipts</h3>
          <button type="button" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        {loading ? <p className={muted}>Loading…</p> : (
          <>
            <div className="mb-3">
              <p className={`text-xs font-semibold uppercase tracking-wide ${muted} mb-2`}>Read by</p>
              {(data?.readBy || []).length ? (data.readBy).map((r) => (
                <div key={r.userId} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{r.user?.name || r.user?.email || 'User'}</span>
                  <span className={`text-xs ${muted}`}>{fmt(r.readAt)}</span>
                </div>
              )) : <p className={`text-sm ${muted}`}>Not read yet</p>}
            </div>
            {(data?.pending || []).length > 0 && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted} mb-2`}>Delivered · not read</p>
                {(data.pending).map((p) => (
                  <div key={p.userId} className="py-1 text-sm opacity-70">{p.user?.name || p.user?.email}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
  onToggleCamera,
  isDark
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const shell = isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const mutedText = isDark ? 'text-gray-400' : 'text-gray-500';

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream || null;
    }
  }, [localStream, phase]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream || null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream || null;
    }
  }, [remoteStream, phase]);

  if (!phase || phase === 'idle' || phase === 'ended') return null;

  const isVideo = media === 'video';
  const title =
    phase === 'incoming' ? `Incoming ${isVideo ? 'video' : 'voice'} call`
      : phase === 'outgoing' ? `Calling ${peerName || '…'}`
        : phase === 'connecting' ? 'Connecting…'
          : `On call with ${peerName || 'colleague'}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden ${shell} ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className={`text-sm ${mutedText}`}>{peerName}</p>
        </div>

        {isVideo && (phase === 'active' || phase === 'connecting') ? (
          <div className="relative aspect-video bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 h-24 w-32 rounded-lg border border-white/30 object-cover shadow-lg"
            />
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center py-10 ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl mb-3">
              <i className={`fas ${isVideo ? 'fa-video' : 'fa-phone'}`} />
            </div>
            <p className={`text-sm ${mutedText}`}>
              {phase === 'outgoing' ? 'Ringing…' : phase === 'incoming' ? 'Answer or decline' : 'Voice call in progress'}
            </p>
          </div>
        )}

        <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />

        <div className={`flex items-center justify-center gap-3 px-4 py-4 ${isDark ? 'bg-gray-900/80' : 'bg-gray-50'}`}>
          {phase === 'incoming' ? (
            <>
              <button
                type="button"
                onClick={onReject}
                className="h-12 w-12 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
                title="Decline"
              >
                <i className="fas fa-phone-slash" />
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="h-12 w-12 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                title="Accept"
              >
                <i className={`fas ${isVideo ? 'fa-video' : 'fa-phone'}`} />
              </button>
            </>
          ) : (
            <>
              {phase === 'active' || phase === 'connecting' ? (
                <>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`h-11 w-11 rounded-full transition-colors ${muted ? 'bg-red-600 text-white' : (isDark ? 'bg-gray-800 text-gray-200' : 'bg-white border border-gray-200 text-gray-700')}`}
                    title={muted ? 'Unmute' : 'Mute'}
                  >
                    <i className={`fas ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
                  </button>
                  {isVideo ? (
                    <button
                      type="button"
                      onClick={onToggleCamera}
                      className={`h-11 w-11 rounded-full transition-colors ${cameraOff ? 'bg-red-600 text-white' : (isDark ? 'bg-gray-800 text-gray-200' : 'bg-white border border-gray-200 text-gray-700')}`}
                      title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                    >
                      <i className={`fas ${cameraOff ? 'fa-video-slash' : 'fa-video'}`} />
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={onHangUp}
                className="h-12 w-12 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
                title="End call"
              >
                <i className="fas fa-phone-slash" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const Messenger = () => {
  const { isDark } = window.useTheme();
  const currentUser = window.storage?.getUser?.() || {};
  const currentUserId = currentUser.id || currentUser.userId || '';
  const initialCache = useMemo(() => readConversationCache(), []);

  const [conversations, setConversations] = useState(() => initialCache?.conversations || []);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(() => !initialCache?.conversations?.length);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [listError, setListError] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [groupSelected, setGroupSelected] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [totalUnread, setTotalUnread] = useState(() => initialCache?.totalUnread || 0);
  const [typingUsers, setTypingUsers] = useState([]);
  const [emailMessages, setEmailMessages] = useState(false);
  const [emailPrefLoading, setEmailPrefLoading] = useState(true);
  const [emailPrefSaving, setEmailPrefSaving] = useState(false);
  const [browserMessages, setBrowserMessages] = useState(
    () => window.chatBrowserNotifications?.getEnabled?.() !== false
  );
  const [browserPrefSaving, setBrowserPrefSaving] = useState(false);
  const [pwaInstallable, setPwaInstallable] = useState(
    () => window.pwaMessengerInstall?.canPromptMessengerPwaInstall?.() || false
  );
  const [pwaInstalled, setPwaInstalled] = useState(
    () => window.pwaMessengerInstall?.isMessengerPwaInstalled?.() || false
  );
  const [pwaInstallBusy, setPwaInstallBusy] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [callPhase, setCallPhase] = useState('idle');
  const [callMedia, setCallMedia] = useState('audio');
  const [callPeerName, setCallPeerName] = useState('');
  const [callConversationId, setCallConversationId] = useState(null);
  const [callMuted, setCallMuted] = useState(false);
  const [callCameraOff, setCallCameraOff] = useState(false);
  const [callLocalStream, setCallLocalStream] = useState(null);
  const [callRemoteStream, setCallRemoteStream] = useState(null);
  const [pendingIncomingCall, setPendingIncomingCall] = useState(null);
  const callSessionRef = useRef(null);
  const callConversationIdRef = useRef(null);
  const [readReceiptMessageId, setReadReceiptMessageId] = useState(null);
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStreamRef = useRef(null);
  const typingPingRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const selectedIdRef = useRef(null);
  const sseRef = useRef(null);
  const hasListRef = useRef(!!initialCache?.conversations?.length);

  useEffect(() => {
    const onInstallable = () => setPwaInstallable(true);
    const onInstalled = () => {
      setPwaInstalled(true);
      setPwaInstallable(false);
    };
    window.addEventListener('messenger-pwa:installable', onInstallable);
    window.addEventListener('messenger-pwa:installed', onInstalled);
    return () => {
      window.removeEventListener('messenger-pwa:installable', onInstallable);
      window.removeEventListener('messenger-pwa:installed', onInstalled);
    };
  }, []);

  const installMessengerDesktopApp = async () => {
    const pwa = window.pwaMessengerInstall;
    if (!pwa || pwaInstallBusy) return;
    setPwaInstallBusy(true);
    try {
      if (pwa.isMessengerPwaEntry() && pwa.canPromptMessengerPwaInstall()) {
        await pwa.promptMessengerPwaInstall();
      } else {
        pwa.openMessengerPwaEntry();
      }
    } finally {
      setPwaInstallBusy(false);
    }
  };

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    callConversationIdRef.current = callConversationId;
  }, [callConversationId]);

  const parseConversationFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search || '');
    const hash = window.location.hash || '';
    const hashQ = hash.split('?')[1];
    const hashParams = hashQ ? new URLSearchParams(hashQ) : null;
    return params.get('conversation') || hashParams?.get('conversation') || null;
  }, []);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const composeRef = useRef(null);

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) || null, [conversations, selectedId]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.lastMessagePreview || '').toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent && !hasListRef.current) setLoadingList(true);
    try {
      const data = await chatFetch('/api/chat/conversations');
      const list = data.conversations || [];
      const unreadTotal = data.totalUnread ?? list.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      hasListRef.current = list.length > 0;
      setConversations(list);
      setListError('');
      setTotalUnread(unreadTotal);
      writeConversationCache(list, unreadTotal);
      window.dispatchEvent(new CustomEvent('chat:unread', { detail: { count: unreadTotal } }));
    } catch (e) {
      if (!silent) setListError(e.message || 'Failed to load conversations');
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId, { silent = false, before, fromCache = false } = {}) => {
    if (!conversationId) return;
    if (!silent && !fromCache) setLoadingMessages(true);
    try {
      const qs = before ? `?before=${encodeURIComponent(before)}&limit=50` : '?limit=80';
      const data = await chatFetch(`/api/chat/conversations/${conversationId}/messages${qs}`);
      const incoming = data.messages || [];
      if (silent && !before) {
        setMessages((prev) => {
          if (!prev.length) return incoming;
          const ids = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const m of incoming) {
            if (!ids.has(m.id)) merged.push(m);
          }
          return merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });
      } else if (before) {
        setMessages((prev) => [...incoming, ...prev]);
      } else {
        setMessages(incoming);
        scrollToBottom(false);
      }
      await chatFetch(`/api/chat/conversations/${conversationId}/read`, { method: 'PATCH', body: JSON.stringify({}) });
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
    } catch (e) {
      console.error('loadMessages', e);
    } finally {
      if (!silent && !fromCache) setLoadingMessages(false);
    }
  }, [scrollToBottom]);

  const relayCallSignal = useCallback(async (conversationId, body) => {
    await chatFetch(`/api/chat/conversations/${conversationId}/call-signal`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }, []);

  const resetCallUi = useCallback(() => {
    window.notificationSounds?.stopCallRing?.();
    setCallPhase('idle');
    setCallPeerName('');
    setCallConversationId(null);
    setCallMuted(false);
    setCallCameraOff(false);
    setCallLocalStream(null);
    setCallRemoteStream(null);
    setPendingIncomingCall(null);
    callSessionRef.current = null;
  }, []);

  const ensureCallSession = useCallback((conversationId) => {
    if (callSessionRef.current) return callSessionRef.current;
    const factory = window.chatWebRtcCall?.createChatCallSession;
    if (!factory) {
      window.alert('Calling is still loading — try again in a moment.');
      return null;
    }
    const session = factory({
      conversationId,
      sendSignal: (payload) => relayCallSignal(conversationId, payload),
      onStateChange: (state) => {
        if (state === 'ended') {
          resetCallUi();
          return;
        }
        setCallPhase(state);
      },
      onRemoteStream: (stream) => setCallRemoteStream(stream),
      onError: (message) => window.alert(message || 'Call failed')
    });
    callSessionRef.current = session;
    return session;
  }, [relayCallSignal, resetCallUi]);

  const handleRemoteCallSignal = useCallback(async (data) => {
    if (!data?.conversationId || data.fromUserId === currentUserId) return;
    if (data.type === 'invite' && callPhase !== 'idle') {
      try {
        await relayCallSignal(data.conversationId, {
          callId: data.callId,
          type: 'reject',
          media: data.media || 'audio',
          payload: { reason: 'busy' }
        });
      } catch (_) { /* ignore */ }
      return;
    }
    const session = ensureCallSession(data.conversationId);
    if (!session) return;
    callSessionRef.current = session;
    const result = await session.handleRemoteSignal(data);
    if (result?.kind === 'incoming' && result.offer) {
      setPendingIncomingCall({
        conversationId: data.conversationId,
        callId: data.callId,
        media: data.media || 'audio',
        fromName: data.fromName || 'Someone',
        offer: result.offer
      });
      setCallPhase('incoming');
      setCallPeerName(data.fromName || 'Someone');
      setCallMedia(data.media || 'audio');
      setCallConversationId(data.conversationId);
      window.notificationSounds?.startCallRing?.();
      return;
    }
    if (result?.kind === 'rejected' || result?.kind === 'ended') {
      resetCallUi();
    }
  }, [currentUserId, callPhase, relayCallSignal, ensureCallSession, resetCallUi]);

  useEffect(() => {
    const onIncoming = (e) => {
      const data = e?.detail;
      if (data) void handleRemoteCallSignal(data);
    };
    const onFocusCall = (e) => {
      const { conversationId } = e?.detail || {};
      if (conversationId && conversationId !== selectedId) {
        setSelectedId(conversationId);
        setMobileShowThread(true);
        void loadMessages(conversationId);
      }
    };
    window.addEventListener('chat:call-incoming', onIncoming);
    window.addEventListener('chat:call-focus', onFocusCall);
    return () => {
      window.removeEventListener('chat:call-incoming', onIncoming);
      window.removeEventListener('chat:call-focus', onFocusCall);
    };
  }, [handleRemoteCallSignal, selectedId, loadMessages]);

  useEffect(() => {
    if (!selectedId || callPhase !== 'idle') return;
    let cancelled = false;
    chatFetch(`/api/chat/conversations/${selectedId}/call-pending`)
      .then((data) => {
        if (cancelled || !data?.pending?.offer) return;
        void handleRemoteCallSignal({
          conversationId: selectedId,
          callId: data.pending.callId,
          type: 'invite',
          media: data.pending.media || 'audio',
          payload: { sdp: data.pending.offer },
          fromUserId: data.pending.fromUserId,
          fromName: data.pending.fromName || 'Someone'
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, callPhase, handleRemoteCallSignal]);

  const startDirectCall = useCallback(async (media) => {
    if (!selectedId || selected?.type !== 'direct') return;
    if (callSessionRef.current && callSessionRef.current.getState() !== 'idle') {
      window.alert('You are already in a call.');
      return;
    }
    const session = ensureCallSession(selectedId);
    if (!session) return;
    setCallConversationId(selectedId);
    setCallMedia(media);
    setCallPeerName(selected?.name || 'Colleague');
    try {
      await session.startOutgoing(media);
      setCallLocalStream(session.getLocalStream());
      setCallPhase(session.getState());
      window.notificationSounds?.play?.('message');
    } catch (e) {
      resetCallUi();
      window.alert(e.message || 'Could not start call');
    }
  }, [selectedId, selected, ensureCallSession, resetCallUi]);

  const acceptIncomingCall = useCallback(async () => {
    const pending = pendingIncomingCall;
    if (!pending?.conversationId || !pending?.callId || !pending?.offer) return;
    const session = ensureCallSession(pending.conversationId);
    if (!session) return;
    setCallConversationId(pending.conversationId);
    setCallMedia(pending.media || 'audio');
    setCallPeerName(pending.fromName || 'Colleague');
    setPendingIncomingCall(null);
    if (pending.conversationId !== selectedId) {
      setSelectedId(pending.conversationId);
      setMobileShowThread(true);
      void loadMessages(pending.conversationId);
    }
    try {
      await session.acceptIncoming(pending.callId, pending.media || 'audio', pending.offer);
      setCallLocalStream(session.getLocalStream());
      setCallPhase(session.getState());
    } catch (e) {
      resetCallUi();
      window.alert(e.message || 'Could not answer call');
    }
  }, [pendingIncomingCall, ensureCallSession, resetCallUi, selectedId, loadMessages]);

  const rejectIncomingCall = useCallback(async () => {
    const pending = pendingIncomingCall;
    if (pending?.conversationId && pending?.callId) {
      try {
        await relayCallSignal(pending.conversationId, {
          callId: pending.callId,
          type: 'reject',
          media: pending.media || 'audio',
          payload: { reason: 'declined' }
        });
      } catch (_) { /* ignore */ }
    }
    resetCallUi();
  }, [pendingIncomingCall, relayCallSignal, resetCallUi]);

  const hangUpCall = useCallback(async () => {
    const session = callSessionRef.current;
    if (session) await session.endCall(true);
    resetCallUi();
  }, [resetCallUi]);

  useEffect(() => () => {
    const session = callSessionRef.current;
    if (session) void session.endCall(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    let cancelled = false;
    chatFetch('/api/notifications/settings')
      .then((data) => {
        if (cancelled) return;
        setEmailMessages(!!data?.settings?.emailMessages);
      })
      .catch(() => { if (!cancelled) setEmailMessages(false); })
      .finally(() => { if (!cancelled) setEmailPrefLoading(false); });
    if (!cancelled) {
      setBrowserMessages(window.chatBrowserNotifications?.getEnabled?.() !== false);
    }
    return () => { cancelled = true; };
  }, []);

  const toggleEmailMessages = async () => {
    const next = !emailMessages;
    setEmailPrefSaving(true);
    try {
      const data = await chatFetch('/api/notifications/settings', {
        method: 'PUT',
        body: JSON.stringify({ emailMessages: next })
      });
      setEmailMessages(!!data?.settings?.emailMessages);
    } catch (e) {
      window.alert(e.message || 'Could not update email preference');
    } finally {
      setEmailPrefSaving(false);
    }
  };

  const toggleBrowserMessages = async () => {
    const browserNotif = window.chatBrowserNotifications;
    if (!browserNotif?.isSupported?.()) {
      window.alert('Browser notifications are not supported in this browser.');
      return;
    }
    const next = !browserMessages;
    setBrowserPrefSaving(true);
    try {
      if (next) {
        const permission = await browserNotif.requestPermission();
        if (permission !== 'granted') {
          window.alert(permission === 'denied'
            ? 'Notifications are blocked. Allow notifications for this site in your browser settings.'
            : 'Notification permission was not granted.');
          return;
        }
      }
      browserNotif.setEnabled(next);
      setBrowserMessages(next);
    } finally {
      setBrowserPrefSaving(false);
    }
  };

  useEffect(() => {
    const token = window.storage?.getToken?.();
    if (!token || !currentUserId) return;
    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
    const url = `${apiBase}/api/chat/events?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sseRef.current = es;

    const handlePayload = (ev, handler) => {
      try {
        handler(JSON.parse(ev.data || '{}'));
      } catch (_) { /* ignore */ }
    };

    es.addEventListener('message', (ev) => {
      handlePayload(ev, (data) => {
        if (data.conversationId && data.conversationId === selectedIdRef.current) {
          loadMessages(data.conversationId, { silent: true });
        }
        loadConversations(true);
      });
    });
    es.addEventListener('reaction', (ev) => {
      handlePayload(ev, (data) => {
        if (data.conversationId === selectedIdRef.current) {
          loadMessages(data.conversationId, { silent: true });
        }
      });
    });
    es.addEventListener('typing', (ev) => {
      handlePayload(ev, (data) => {
        if (data.conversationId !== selectedIdRef.current) return;
        if (data.userId === currentUserId) return;
        setTypingUsers([{ userId: data.userId, name: data.name || 'Someone' }]);
        setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId)), 5000);
      });
    });
    es.addEventListener('conversation', () => loadConversations(true));
    es.addEventListener('message_updated', (ev) => {
      handlePayload(ev, (data) => {
        if (data.conversationId === selectedIdRef.current && data.message) {
          setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
        }
        loadConversations(true);
      });
    });
    es.addEventListener('message_deleted', (ev) => {
      handlePayload(ev, (data) => {
        if (data.conversationId === selectedIdRef.current) {
          setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m)));
        }
        loadConversations(true);
      });
    });
    es.addEventListener('call', (ev) => {
      handlePayload(ev, (data) => { void handleRemoteCallSignal(data); });
    });

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [currentUserId, loadConversations, loadMessages, handleRemoteCallSignal]);

  const toggleReaction = async (messageId, emoji) => {
    try {
      const data = await chatFetch(`/api/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji })
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactionGroups: data.reactionGroups || [] } : m))
      );
    } catch (e) {
      console.error('reaction', e);
    } finally {
      setReactionPickerId(null);
    }
  };

  const startEditMessage = (m) => {
    setEditingMessageId(m.id);
    setEditingText(m.content || '');
    setReactionPickerId(null);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const saveEditMessage = async () => {
    const text = editingText.trim();
    if (!editingMessageId || !text) return;
    try {
      const data = await chatFetch(`/api/chat/messages/${editingMessageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: text })
      });
      setMessages((prev) => prev.map((m) => (m.id === editingMessageId ? data.message : m)));
      cancelEditMessage();
      loadConversations(true);
    } catch (e) {
      window.alert(e.message || 'Could not edit message');
    }
  };

  const deleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await chatFetch(`/api/chat/messages/${messageId}`, { method: 'DELETE' });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m)));
      loadConversations(true);
    } catch (e) {
      window.alert(e.message || 'Could not delete message');
    }
  };

  const stopRecordStream = () => {
    recordStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    recordStreamRef.current = null;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const startVoiceRecording = async () => {
    if (isRecording || !navigator.mediaDevices?.getUserMedia) {
      if (!navigator.mediaDevices?.getUserMedia) window.alert('Voice notes are not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      const recorder = createMediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data?.size) recordChunksRef.current.push(e.data); };
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (e) {
      window.alert(e.message || 'Microphone access denied');
      stopRecordStream();
    }
  };

  const finishVoiceRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      stopRecordStream();
      return;
    }
    setUploading(true);
    try {
      const mime = recorder.mimeType || pickAudioRecorderMimeType() || 'audio/webm';
      const blob = await new Promise((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(recordChunksRef.current, { type: mime }));
        recorder.onerror = reject;
        recorder.stop();
      });
      stopRecordStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingSeconds(0);
      if (blob.size < 80) {
        window.alert('Recording too short — try again.');
        return;
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const ext = mime.includes('mp4') ? 'm4a' : 'webm';
      const res = await chatFetch('/api/files', {
        method: 'POST',
        body: JSON.stringify({ name: `voice-${Date.now()}.${ext}`, dataUrl, folder: 'chat' })
      });
      setAttachments((prev) => [...prev, { name: res.name || 'Voice message', url: res.url, mimeType: res.mimeType || mime, kind: 'voice' }]);
    } catch (e) {
      window.alert(e.message || 'Voice upload failed');
    } finally {
      setUploading(false);
    }
  };

  const cancelVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    mediaRecorderRef.current = null;
    recordChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
    stopRecordStream();
  };

  useEffect(() => () => cancelVoiceRecording(), []);

  useEffect(() => {
    const applyFromUrl = () => {
      const convId = parseConversationFromUrl();
      if (convId) {
        setSelectedId(convId);
        setMobileShowThread(true);
      }
    };
    applyFromUrl();
    window.addEventListener('hashchange', applyFromUrl);
    return () => window.removeEventListener('hashchange', applyFromUrl);
  }, [parseConversationFromUrl]);

  const pingTyping = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      await chatFetch(`/api/chat/conversations/${conversationId}/typing`, { method: 'POST', body: JSON.stringify({}) });
    } catch (_) { /* ignore */ }
  }, []);

  const loadTyping = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const data = await chatFetch(`/api/chat/conversations/${conversationId}/typing`);
      setTypingUsers(data.typing || []);
    } catch (_) {
      setTypingUsers([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTypingUsers([]);
      return;
    }
    loadTyping(selectedId);
    const id = setInterval(() => loadTyping(selectedId), 2500);
    return () => clearInterval(id);
  }, [selectedId, loadTyping]);

  const handleComposeChange = (value) => {
    setCompose(value);
    if (!selectedId || !value.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      void pingTyping(selectedId);
    }
  };

  const typingLabel = useMemo(() => {
    if (!typingUsers.length) return '';
    if (typingUsers.length === 1) return `${typingUsers[0].name} is typing…`;
    if (typingUsers.length === 2) return `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`;
    return `${typingUsers.length} people are typing…`;
  }, [typingUsers]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const cached = readMessagesCache(selectedId);
    if (cached?.length) {
      setMessages(cached);
      setLoadingMessages(false);
      scrollToBottom(false);
      loadMessages(selectedId, { silent: true, fromCache: true });
    } else {
      loadMessages(selectedId);
    }
  }, [selectedId, loadMessages, scrollToBottom]);

  useEffect(() => {
    if (!selectedId || !messages.length) return;
    writeMessagesCache(selectedId, messages);
  }, [selectedId, messages]);

  useEffect(() => {
    if (!selectedId) return;
    const id = setInterval(() => loadMessages(selectedId, { silent: true }), POLL_ACTIVE_MS);
    return () => clearInterval(id);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const id = setInterval(() => loadConversations(true), POLL_LIST_MS);
    return () => clearInterval(id);
  }, [loadConversations]);

  useEffect(() => {
    if (messages.length) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const searchUsers = useCallback(async (q) => {
    try {
      const data = await chatFetch(`/api/chat/users?q=${encodeURIComponent(q)}`);
      setUserResults(data.users || []);
    } catch (_) {
      setUserResults([]);
    }
  }, []);

  useEffect(() => {
    if (!showNewChat && !showNewGroup) return;
    const t = setTimeout(() => searchUsers(userSearch), 200);
    return () => clearTimeout(t);
  }, [userSearch, showNewChat, showNewGroup, searchUsers]);

  const openConversation = (id) => {
    setSelectedId(id);
    setMobileShowThread(true);
    setReplyTo(null);
    if (window.history.replaceState) {
      const base = window.location.hash.split('?')[0] || '#/messages';
      window.history.replaceState(null, '', `${base}?conversation=${encodeURIComponent(id)}`);
    }
  };

  const startDirectChat = async (userId) => {
    try {
      const data = await chatFetch('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'direct', participantIds: [userId] })
      });
      const conv = data.conversation;
      setShowNewChat(false);
      setUserSearch('');
      await loadConversations(true);
      if (conv?.id) openConversation(conv.id);
    } catch (e) {
      window.alert(e.message || 'Could not start chat');
    }
  };

  const createGroup = async () => {
    if (!groupSelected.length) return window.alert('Select at least one person');
    try {
      const data = await chatFetch('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'group', name: groupName.trim(), participantIds: groupSelected })
      });
      setShowNewGroup(false);
      setGroupName('');
      setGroupSelected([]);
      setUserSearch('');
      await loadConversations(true);
      if (data.conversation?.id) openConversation(data.conversation.id);
    } catch (e) {
      window.alert(e.message || 'Could not create group');
    }
  };

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await chatFetch('/api/files', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, dataUrl, folder: 'chat' })
      });
      setAttachments((prev) => [...prev, { name: res.name || file.name, url: res.url, mimeType: res.mimeType, size: res.size }]);
    } catch (e) {
      window.alert(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    const text = compose.trim();
    if (!selectedId || sending || (!text && !attachments.length)) return;
    setSending(true);
    try {
      const data = await chatFetch(`/api/chat/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: text,
          attachments,
          replyToId: replyTo?.id || null
        })
      });
      setMessages((prev) => [...prev, data.message]);
      setCompose('');
      setAttachments([]);
      setReplyTo(null);
      scrollToBottom();
      loadConversations(true);
    } catch (e) {
      window.alert(e.message || 'Failed to send');
    } finally {
      setSending(false);
      composeRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const shell = isDark ? 'bg-[#0b1220] text-gray-100' : 'bg-[#f0f4f8] text-gray-900';
  const panel = isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-200';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputCls = isDark ? 'bg-gray-800/80 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400';
  const bubbleMine = isDark ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white' : 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white';
  const bubbleTheirs = isDark ? 'bg-gray-800 text-gray-100 border border-gray-700/80' : 'bg-white text-gray-900 border border-gray-100 shadow-sm';

  const renderToggle = (on, disabled, onClick, label) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-emerald-400' : (isDark ? 'bg-gray-600' : 'bg-gray-300')} disabled:opacity-50`}
      title={label}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );

  const renderNotifSettingsModal = () => (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={() => setShowNotifSettings(false)}
    >
      <div className={`w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden ${panel} border`} onClick={(e) => e.stopPropagation()}>
        <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <h3 className="font-semibold text-lg">Notification settings</h3>
          <button type="button" onClick={() => setShowNotifSettings(false)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className={`flex items-center justify-between gap-3 px-3 py-3 rounded-xl ${isDark ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
            <span className="text-sm flex items-center gap-2 min-w-0">
              <i className={`fas fa-envelope text-xs ${muted}`} />
              Email notifications
            </span>
            {renderToggle(
              emailMessages,
              emailPrefLoading || emailPrefSaving,
              toggleEmailMessages,
              emailMessages ? 'Email alerts on' : 'Email alerts off'
            )}
          </div>
          <div className={`flex items-center justify-between gap-3 px-3 py-3 rounded-xl ${isDark ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
            <span className="text-sm flex items-center gap-2 min-w-0">
              <i className={`fas fa-bell text-xs ${muted}`} />
              Browser notifications
            </span>
            {renderToggle(
              browserMessages,
              browserPrefSaving || !window.chatBrowserNotifications?.isSupported?.(),
              toggleBrowserMessages,
              browserMessages ? 'Desktop alerts on' : 'Desktop alerts off'
            )}
          </div>
          {!window.chatBrowserNotifications?.isSupported?.() && (
            <p className={`text-xs px-1 ${muted}`}>Browser notifications are not supported in this browser.</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderUserPicker = (multi = false) => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setShowNewChat(false); setShowNewGroup(false); }}>
      <div className={`w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden ${panel} border`} onClick={(e) => e.stopPropagation()}>
        <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <h3 className="font-semibold text-lg">{multi ? 'New group' : 'New message'}</h3>
          <button type="button" onClick={() => { setShowNewChat(false); setShowNewGroup(false); }} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <i className="fas fa-times" />
          </button>
        </div>
        {multi && (
          <div className="px-4 pt-3">
            <input type="text" placeholder="Group name (optional)" value={groupName} onChange={(e) => setGroupName(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-sm ${inputCls}`} />
            {groupSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {groupSelected.map((uid) => {
                  const u = userResults.find((x) => x.id === uid);
                  return (
                    <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-600/20 text-blue-400">
                      {u?.name || uid}
                      <button type="button" onClick={() => setGroupSelected((s) => s.filter((id) => id !== uid))}><i className="fas fa-times text-[10px]" /></button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="px-4 py-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${inputCls}`}>
            <i className={`fas fa-search ${muted}`} />
            <input type="search" placeholder="Search people…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-sm" autoFocus />
          </div>
        </div>
        <div className="overflow-y-auto max-h-64 px-2 pb-3">
          {userResults.map((u) => (
            <button key={u.id} type="button"
              onClick={() => multi ? setGroupSelected((s) => s.includes(u.id) ? s.filter((id) => id !== u.id) : [...s, u.id]) : startDirectChat(u.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} ${multi && groupSelected.includes(u.id) ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : ''}`}>
              <Avatar user={u} size={44} />
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium truncate">{u.name || u.email}</div>
                <div className={`text-xs truncate ${muted}`}>{u.jobTitle || u.department || u.email}</div>
              </div>
              {u.online && <span className="text-xs text-emerald-500 font-medium">Online</span>}
              {multi && groupSelected.includes(u.id) && <i className="fas fa-check-circle text-blue-500" />}
            </button>
          ))}
          {!userResults.length && <p className={`text-center py-6 text-sm ${muted}`}>Search for a colleague</p>}
        </div>
        {multi && (
          <div className={`px-4 py-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
            <button type="button" onClick={createGroup} disabled={!groupSelected.length}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold disabled:opacity-40">
              Create group ({groupSelected.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const isMessengerPwa = !!window.__PWA_MESSENGER__;
  const rootShellClass = isMessengerPwa
    ? `h-full min-h-0 overflow-hidden ${shell}`
    : `h-[calc(100vh-7rem)] sm:h-[calc(100vh-5rem)] min-h-[480px] rounded-2xl overflow-hidden shadow-xl border ${shell} ${isDark ? 'border-gray-800' : 'border-gray-200'}`;

  return (
    <div className={rootShellClass}>
      <div className="flex h-full">
        {/* Conversation list */}
        <aside className={`w-full sm:w-96 shrink-0 flex flex-col border-r ${panel} ${mobileShowThread ? 'hidden sm:flex' : 'flex'}`}>
          <div className={`p-4 border-b ${isDark ? 'border-gray-800 bg-gradient-to-r from-[#0f172a] to-[#111827]' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xl font-bold tracking-tight text-white" role="heading" aria-level="1">Messages</div>
                <p className={`text-xs ${isDark ? 'text-blue-200/80' : 'text-blue-100'}`}>
                  {totalUnread ? `${totalUnread} unread` : 'Team chat & DMs'}
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" title="Notification settings" onClick={() => setShowNotifSettings(true)}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                  <i className="fas fa-cog" />
                </button>
                <button type="button" title="New group" onClick={() => { setShowNewGroup(true); searchUsers(''); }}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                  <i className="fas fa-users" />
                </button>
                <button type="button" title="New message" onClick={() => { setShowNewChat(true); searchUsers(''); }}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                  <i className="fas fa-edit" />
                </button>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-gray-900/60' : 'bg-white/15'}`}>
              <i className="fas fa-search text-white/70 text-sm" />
              <input type="search" placeholder="Search conversations…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="messenger-conversation-search flex-1 bg-transparent border-0 outline-none text-sm text-white placeholder-white/60 caret-white" />
            </div>
            {!pwaInstalled ? (
              <button
                type="button"
                disabled={pwaInstallBusy}
                onClick={() => void installMessengerDesktopApp()}
                className={`mt-2 w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-colors border ${isDark ? 'bg-indigo-950/50 hover:bg-indigo-950/70 border-indigo-400/25 text-blue-100' : 'bg-indigo-900/35 hover:bg-indigo-900/50 border-white/30 text-white'} disabled:opacity-50`}
                title="Install Messenger as a standalone Chrome / Edge desktop app"
              >
                <span className="text-xs flex items-center gap-1.5 min-w-0">
                  <i className="fas fa-window-restore text-[11px] opacity-80 shrink-0" />
                  <span className="truncate">
                    {window.__PWA_MESSENGER__ && pwaInstallable
                      ? 'Install desktop app'
                      : 'Set up desktop app'}
                  </span>
                </span>
                <i className="fas fa-download text-[11px] opacity-80 shrink-0" />
              </button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingList && !conversations.length ? (
              <div className={`flex flex-col items-center justify-center py-16 ${muted}`}>
                <i className="fas fa-spinner fa-spin text-2xl mb-2" />
                Loading…
              </div>
            ) : listError ? (
              <div className="p-4 text-center text-red-500 text-sm">{listError}</div>
            ) : !filteredConversations.length ? (
              <div className={`p-8 text-center ${muted}`}>
                <i className="fas fa-comments text-4xl mb-3 opacity-40" />
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm mt-1">Start a chat with a colleague</p>
                <button type="button" onClick={() => { setShowNewChat(true); searchUsers(''); }}
                  className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">
                  New message
                </button>
              </div>
            ) : (
              filteredConversations.map((c) => (
                <button key={c.id} type="button" onClick={() => openConversation(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 border-b transition-all text-left ${isDark ? 'border-gray-800/80 hover:bg-gray-800/50' : 'border-gray-100 hover:bg-blue-50/50'} ${selectedId === c.id ? (isDark ? 'bg-blue-900/25 border-l-4 border-l-blue-500' : 'bg-blue-50 border-l-4 border-l-blue-500') : 'border-l-4 border-l-transparent'}`}>
                  {c.type === 'group' ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                      <i className="fas fa-users" />
                    </div>
                  ) : (
                    <Avatar user={c.participants?.find((p) => p.userId !== currentUserId)?.user || { name: c.name }} size={48} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{c.name}</span>
                      <span className={`text-[11px] shrink-0 ${muted}`}>{formatTime(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-sm truncate ${c.unreadCount ? 'font-semibold' : muted}`}>{c.lastMessagePreview || 'No messages yet'}</p>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Thread */}
        <main className={`flex-1 flex flex-col min-w-0 ${panel} ${!mobileShowThread && !selectedId ? 'hidden sm:flex' : 'flex'} ${!selectedId ? 'hidden sm:flex' : ''}`}>
          {!selectedId ? (
            <div className={`flex-1 flex flex-col items-center justify-center ${muted} p-8`}>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-gray-800' : 'bg-blue-50'}`}>
                <i className="fas fa-paper-plane text-3xl text-blue-500" />
              </div>
              <h2 className="text-xl font-semibold mb-1">Your messages</h2>
              <p className="text-sm text-center max-w-sm">Send private messages, share files, and create group chats with your team.</p>
            </div>
          ) : (
            <>
              <header className={`px-4 py-3 border-b flex items-center gap-3 shrink-0 ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white/80 backdrop-blur'}`}>
                <button type="button" className="sm:hidden p-2 -ml-1 rounded-lg" onClick={() => setMobileShowThread(false)}>
                  <i className="fas fa-arrow-left" />
                </button>
                {selected?.type === 'group' ? (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                    <i className="fas fa-users text-sm" />
                  </div>
                ) : (
                  <Avatar user={selected?.participants?.find((p) => p.userId !== currentUserId)?.user} size={40} />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold truncate">{selected?.name}</h2>
                  <p className={`text-xs ${muted}`}>
                    {selected?.type === 'group'
                      ? `${selected.participants?.length || 0} members`
                      : (selected?.participants?.find((p) => p.userId !== currentUserId)?.user?.online ? 'Online' : 'Offline')}
                  </p>
                </div>
                {selected?.type === 'direct' && callPhase === 'idle' ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Voice call"
                      onClick={() => void startDirectCall('audio')}
                      className={`p-2.5 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                      <i className="fas fa-phone text-sm" />
                    </button>
                    <button
                      type="button"
                      title="Video call"
                      onClick={() => void startDirectCall('video')}
                      className={`p-2.5 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                      <i className="fas fa-video text-sm" />
                    </button>
                  </div>
                ) : null}
              </header>

              {typingLabel ? (
                <div className={`px-4 py-1.5 text-xs italic shrink-0 ${isDark ? 'bg-gray-900/80 text-emerald-400' : 'bg-white/90 text-emerald-600'}`}>
                  <span className="inline-flex items-center gap-2">
                    <span className="flex gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    {typingLabel}
                  </span>
                </div>
              ) : null}

              <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-1 ${isDark ? 'bg-[#0b1220]' : 'bg-[#e8edf2]'}`}
                style={{ backgroundImage: isDark ? 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.04) 0%, transparent 50%)' : 'radial-gradient(circle at 80% 10%, rgba(99,102,241,0.06) 0%, transparent 45%)' }}>
                {loadingMessages && !messages.length ? (
                  <div className={`flex justify-center py-12 ${muted}`}><i className="fas fa-spinner fa-spin text-xl" /></div>
                ) : (
                  messages.map((m, idx) => {
                    const isMine = m.senderId === currentUserId;
                    const prev = messages[idx - 1];
                    const showAvatar = !isMine && (!prev || prev.senderId !== m.senderId);
                    const showName = selected?.type === 'group' && !isMine && showAvatar;
                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
                        {!isMine && (
                          <div className="w-8 shrink-0 mr-2">
                            {showAvatar ? <Avatar user={m.sender} size={32} /> : null}
                          </div>
                        )}
                        <div className={`max-w-[85%] sm:max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                          {showName && <span className={`text-xs font-medium mb-0.5 ml-1 ${muted}`}>{m.sender?.name || m.sender?.email}</span>}
                          {m.replyTo && !m.replyTo.deletedAt && (
                            <div className={`text-xs px-3 py-1.5 rounded-lg mb-1 border-l-2 border-blue-500 ${isDark ? 'bg-gray-800/80' : 'bg-white/80'} ${muted}`}>
                              {m.replyTo.sender?.name}: {(m.replyTo.content || '').slice(0, 80)}
                            </div>
                          )}
                          <div className={`group relative px-3.5 py-2 rounded-2xl text-[15px] leading-relaxed break-words ${isMine ? `${bubbleMine} rounded-br-md` : `${bubbleTheirs} rounded-bl-md`}`}>
                            {m.deletedAt ? (
                              <span className="italic opacity-60">Message deleted</span>
                            ) : editingMessageId === m.id ? (
                              <div className="space-y-2">
                                <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={2}
                                  className={`w-full rounded-lg px-2 py-1.5 text-sm border ${isDark ? 'bg-gray-900/60 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                                <div className="flex gap-2 justify-end">
                                  <button type="button" onClick={cancelEditMessage} className="text-xs px-2 py-1 rounded opacity-80 hover:opacity-100">Cancel</button>
                                  <button type="button" onClick={saveEditMessage} disabled={!editingText.trim()}
                                    className="text-xs px-2 py-1 rounded bg-white/20 font-semibold disabled:opacity-40">Save</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                                {(m.attachments || []).map((a, i) => (
                                  <ChatAttachmentItem key={i} attachment={a} isMine={isMine} isDark={isDark} />
                                ))}
                              </>
                            )}
                            {!editingMessageId || editingMessageId !== m.id ? (
                            <div className={`flex items-center justify-end gap-0.5 mt-1 ${isMine ? 'text-blue-100' : muted}`}>
                              {m.editedAt && !m.deletedAt && <span className="text-[10px] opacity-70 mr-0.5">edited</span>}
                              <span className="text-[10px]">{formatMessageTime(m.createdAt)}</span>
                              <ReadTicks message={m} isMine={isMine} participants={selected?.participants} currentUserId={currentUserId}
                                onShowReads={(msg) => setReadReceiptMessageId(msg.id)} />
                            </div>
                            ) : null}
                            {!m.deletedAt && editingMessageId !== m.id && (
                              <button type="button" title="Reply"
                                onClick={() => { setReplyTo(m); composeRef.current?.focus(); }}
                                className={`absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                                <i className="fas fa-reply text-xs" />
                              </button>
                            )}
                            {!m.deletedAt && editingMessageId !== m.id && (
                              <button type="button" title="React"
                                onClick={() => setReactionPickerId(reactionPickerId === m.id ? null : m.id)}
                                className={`absolute ${isMine ? '-left-16' : '-right-8'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                                <i className="far fa-smile text-xs" />
                              </button>
                            )}
                            {isMine && !m.deletedAt && editingMessageId !== m.id && (
                              <>
                                <button type="button" title="Edit"
                                  onClick={() => startEditMessage(m)}
                                  className={`absolute -left-24 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                                  <i className="fas fa-pen text-xs" />
                                </button>
                                <button type="button" title="Delete"
                                  onClick={() => deleteMessage(m.id)}
                                  className={`absolute -left-32 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-red-300 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                                  <i className="fas fa-trash text-xs" />
                                </button>
                              </>
                            )}
                          </div>
                          {(m.reactionGroups || []).length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              {(m.reactionGroups || []).map((g) => {
                                const mine = (g.userIds || []).includes(currentUserId);
                                return (
                                  <button key={g.emoji} type="button" onClick={() => toggleReaction(m.id, g.emoji)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                      mine
                                        ? (isDark ? 'bg-blue-900/50 border-blue-600 text-blue-200' : 'bg-blue-100 border-blue-300 text-blue-800')
                                        : (isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700')
                                    }`}>
                                    <span>{g.emoji}</span>
                                    <span className="font-semibold">{g.count}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {reactionPickerId === m.id && (
                            <div className={`flex gap-1 mt-1 p-1.5 rounded-xl border shadow-lg ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                              {REACTION_EMOJIS.map((emoji) => (
                                <button key={emoji} type="button" onClick={() => toggleReaction(m.id, emoji)}
                                  className="text-lg hover:scale-125 transition-transform p-1">{emoji}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {replyTo && (
                <div className={`px-4 py-2 border-t flex items-center gap-2 text-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                  <i className="fas fa-reply text-blue-500" />
                  <span className={`flex-1 truncate ${muted}`}>Replying to {replyTo.sender?.name}: {(replyTo.content || '').slice(0, 60)}</span>
                  <button type="button" onClick={() => setReplyTo(null)}><i className="fas fa-times" /></button>
                </div>
              )}

              {attachments.length > 0 && (
                <div className={`px-4 py-2 border-t flex flex-wrap gap-2 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                  {attachments.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-blue-600/20 text-blue-400">
                      {a.name}
                      <button type="button" onClick={() => setAttachments((s) => s.filter((_, j) => j !== i))}><i className="fas fa-times" /></button>
                    </span>
                  ))}
                </div>
              )}

              <footer className={`p-3 sm:p-4 border-t shrink-0 ${isDark ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-white'}`}>
                {isRecording && (
                  <div className={`flex items-center justify-between mb-2 px-3 py-2 rounded-xl ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
                    <span className="text-sm font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Recording {recordingSeconds}s
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={cancelVoiceRecording} className="text-xs px-3 py-1 rounded-lg opacity-80 hover:opacity-100">Cancel</button>
                      <button type="button" onClick={finishVoiceRecording} disabled={uploading}
                        className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-40">Done</button>
                    </div>
                  </div>
                )}
                <div className="flex items-end gap-2 max-w-4xl mx-auto">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
                  <button type="button" disabled={uploading || isRecording} onClick={() => fileInputRef.current?.click()}
                    className={`p-3 rounded-xl shrink-0 ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                    <i className={`fas ${uploading ? 'fa-spinner fa-spin' : 'fa-paperclip'}`} />
                  </button>
                  <button type="button" disabled={uploading || sending} onClick={isRecording ? finishVoiceRecording : startVoiceRecording}
                    className={`p-3 rounded-xl shrink-0 ${isRecording ? 'text-red-500' : (isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}`}
                    title={isRecording ? 'Stop recording' : 'Voice note'}>
                    <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'}`} />
                  </button>
                  <textarea ref={composeRef} rows={1} value={compose} onChange={(e) => handleComposeChange(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Type a message…" disabled={sending || isRecording}
                    className={`flex-1 resize-none px-4 py-3 rounded-2xl border text-[15px] max-h-32 min-h-[48px] ${inputCls}`}
                    style={{ fieldSizing: 'content' }} />
                  <button type="button" onClick={sendMessage} disabled={sending || isRecording || (!compose.trim() && !attachments.length)}
                    className="p-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shrink-0 disabled:opacity-40 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-shadow">
                    <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>

      <ChatCallOverlay
        phase={callPhase}
        media={callMedia}
        peerName={callPeerName}
        muted={callMuted}
        cameraOff={callCameraOff}
        localStream={callLocalStream}
        remoteStream={callRemoteStream}
        onAccept={() => void acceptIncomingCall()}
        onReject={() => void rejectIncomingCall()}
        onHangUp={() => void hangUpCall()}
        onToggleMute={() => {
          const session = callSessionRef.current;
          if (session) setCallMuted(session.toggleMute());
        }}
        onToggleCamera={() => {
          const session = callSessionRef.current;
          if (session) setCallCameraOff(session.toggleCamera());
        }}
        isDark={isDark}
      />
      {showNotifSettings && renderNotifSettingsModal()}
      {showNewChat && renderUserPicker(false)}
      {showNewGroup && renderUserPicker(true)}
      {readReceiptMessageId && (
        <ReadReceiptsPanel messageId={readReceiptMessageId} onClose={() => setReadReceiptMessageId(null)} isDark={isDark} />
      )}
    </div>
  );
};

window.Messenger = Messenger;

export default Messenger;
