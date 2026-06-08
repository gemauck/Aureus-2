import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useNetwork } from '../hooks/useNetwork'
import { erpApi } from '../services/erpApi'
import { getChatPushEnabled } from '../services/chatPushPrefs'
import { hasPushNotificationPermission, showLocalChatNotification } from '../services/pushNotifications'
import { useAuth } from '../state/AuthContext'
import { ChatEventStream } from './chatEventStream'
import { getActiveChatConversation } from './chatFocusState'
import type { ChatEventListener, ChatEventPayload, ChatEventType } from './chatEventTypes'

export const CHAT_POLL_FALLBACK_MS = 60_000

type ChatEventsContextValue = {
  connected: boolean
  chatUnread: number
  refreshChatUnread: () => Promise<void>
  subscribe: (listener: ChatEventListener) => () => void
}

const ChatEventsContext = createContext<ChatEventsContextValue | undefined>(undefined)

export function ChatEventsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth()
  const currentUserId = user?.id || ''
  const { isOnline } = useNetwork()
  const [connected, setConnected] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)
  const streamRef = useRef<ChatEventStream | null>(null)
  const listenersRef = useRef(new Set<ChatEventListener>())
  const accessTokenRef = useRef(accessToken)
  accessTokenRef.current = accessToken

  const emit = useCallback((event: ChatEventType, data: ChatEventPayload) => {
    for (const listener of listenersRef.current) {
      try {
        listener(event, data)
      } catch {
        /* subscriber error */
      }
    }
  }, [])

  const refreshChatUnread = useCallback(async () => {
    const token = accessTokenRef.current
    if (!token) {
      setChatUnread(0)
      return
    }
    try {
      const count = await erpApi.getChatUnreadCount(token)
      setChatUnread(count)
    } catch {
      /* keep last count */
    }
  }, [])

  const subscribe = useCallback((listener: ChatEventListener) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  const maybeNotifyIncomingMessage = useCallback(async (data: ChatEventPayload) => {
    if (!data.conversationId) return
    if (data.senderId && data.senderId === currentUserId) return
    if (data.conversationId === getActiveChatConversation()) return

    const enabled = await getChatPushEnabled()
    if (!enabled) return

    // When OS push permission is granted, server Expo push handles sound/vibration (avoid duplicate alerts).
    const pushGranted = await hasPushNotificationPermission()
    if (pushGranted) return

    const title = data.senderName || 'New message'
    const body = data.preview || 'Sent you a message'
    void showLocalChatNotification({
      title,
      body,
      conversationId: data.conversationId,
      messageId: data.messageId
    })
  }, [currentUserId])

  const handleEvent = useCallback(
    (event: ChatEventType, data: ChatEventPayload) => {
      emit(event, data)
      if (
        event === 'message' ||
        event === 'conversation' ||
        event === 'message_updated' ||
        event === 'message_deleted'
      ) {
        void refreshChatUnread()
      }
      if (event === 'message') {
        void maybeNotifyIncomingMessage(data)
      }
    },
    [emit, maybeNotifyIncomingMessage, refreshChatUnread]
  )

  useEffect(() => {
    void refreshChatUnread()
    if (!accessToken) return

    const pollId = setInterval(() => void refreshChatUnread(), CHAT_POLL_FALLBACK_MS)
    return () => clearInterval(pollId)
  }, [accessToken, refreshChatUnread])

  useEffect(() => {
    if (!accessToken || !isOnline) {
      streamRef.current?.close()
      streamRef.current = null
      setConnected(false)
      return
    }

    let active = true
    const stream = new ChatEventStream()
    streamRef.current = stream

    const connect = () => {
      if (!active || !accessTokenRef.current) return
      stream.connect({
        accessToken: accessTokenRef.current,
        onEvent: handleEvent,
        onConnectionChange: (next) => {
          if (active) setConnected(next)
        }
      })
    }

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        connect()
        void refreshChatUnread()
      } else {
        stream.close()
        setConnected(false)
      }
    }

    connect()
    const sub = AppState.addEventListener('change', onAppState)

    return () => {
      active = false
      sub.remove()
      stream.close()
      streamRef.current = null
      setConnected(false)
    }
  }, [accessToken, isOnline, handleEvent, refreshChatUnread])

  const value = useMemo(
    () => ({ connected, chatUnread, refreshChatUnread, subscribe }),
    [connected, chatUnread, refreshChatUnread, subscribe]
  )

  return <ChatEventsContext.Provider value={value}>{children}</ChatEventsContext.Provider>
}

export function useChatEvents() {
  const ctx = useContext(ChatEventsContext)
  if (!ctx) {
    throw new Error('useChatEvents must be used within ChatEventsProvider')
  }
  return ctx
}
