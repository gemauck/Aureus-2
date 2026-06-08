import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { useChatEvents } from '../messages/ChatEventsContext'
import { useNotificationUnread } from '../notifications/NotificationUnreadContext'
import { setAppIconBadge } from '../services/pushNotifications'

/** Keep the launcher icon badge in sync with real ERP + chat unread counts. */
export function useAppIconBadge() {
  const { accessToken } = useAuth()
  const { chatUnread, refreshChatUnread } = useChatEvents()
  const { unreadCount: notificationUnread, refresh: refreshNotificationUnread } = useNotificationUnread()

  const totalUnread = chatUnread + notificationUnread

  useEffect(() => {
    if (!accessToken) {
      void setAppIconBadge(0)
      return
    }
    void setAppIconBadge(totalUnread)
  }, [accessToken, totalUnread])

  useEffect(() => {
    if (!accessToken) return

    const sync = () => {
      void refreshChatUnread()
      void refreshNotificationUnread()
    }

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') sync()
    }

    sync()
    const sub = AppState.addEventListener('change', onAppState)
    return () => sub.remove()
  }, [accessToken, refreshChatUnread, refreshNotificationUnread])
}
