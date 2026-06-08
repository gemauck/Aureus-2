import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'

import { chatApi, type ChatConversation, type ChatUser } from '../api'
import { CHAT_POLL_FALLBACK_MS, useChatEvents } from '../ChatEventsContext'
import type { MessagesStackParamList } from '../navigation'
import { getChatPushEnabled, setChatPushEnabled } from '../../services/chatPushPrefs'
import {
  getNotificationSoundsEnabled,
  playNotificationSound,
  setNotificationSoundsEnabled
} from '../../services/notificationSounds'
import { registerPushToken } from '../../services/pushNotifications'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<MessagesStackParamList, 'MessagesHome'>

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function initials(name?: string, email?: string) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export function MessagesHomeScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const { accessToken, user } = useAuth()
  const { subscribe } = useChatEvents()
  const userId = user?.id || ''
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<ChatUser[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [emailMessages, setEmailMessages] = useState(false)
  const [emailPrefLoading, setEmailPrefLoading] = useState(true)
  const [emailPrefSaving, setEmailPrefSaving] = useState(false)
  const [pushMessages, setPushMessages] = useState(true)
  const [pushPrefLoading, setPushPrefLoading] = useState(true)
  const [pushPrefSaving, setPushPrefSaving] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundPrefLoading, setSoundPrefLoading] = useState(true)
  const [soundPrefSaving, setSoundPrefSaving] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        const list = await chatApi.listConversations(accessToken)
        setConversations(list)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    void load()
    const id = setInterval(() => load(true), CHAT_POLL_FALLBACK_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    return subscribe((event) => {
      if (event === 'typing' || event === 'reaction') return
      void load(true)
    })
  }, [load, subscribe])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const settings = await chatApi.getNotificationSettings(accessToken)
        if (!cancelled) setEmailMessages(!!settings.emailMessages)
      } catch {
        if (!cancelled) setEmailMessages(false)
      } finally {
        if (!cancelled) setEmailPrefLoading(false)
      }
      if (!cancelled) {
        setPushMessages(await getChatPushEnabled())
        setPushPrefLoading(false)
        setSoundEnabled(await getNotificationSoundsEnabled())
        setSoundPrefLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [accessToken])

  const toggleNotificationSounds = async () => {
    if (soundPrefSaving) return
    const next = !soundEnabled
    setSoundPrefSaving(true)
    try {
      await setNotificationSoundsEnabled(next)
      setSoundEnabled(next)
      if (next) void playNotificationSound('message')
    } finally {
      setSoundPrefSaving(false)
    }
  }

  const togglePushMessages = async () => {
    if (pushPrefSaving) return
    const next = !pushMessages
    setPushPrefSaving(true)
    try {
      if (next && accessToken) {
        const token = await registerPushToken(accessToken)
        if (!token) {
          Alert.alert(
            'Push notifications',
            'Allow notifications for Abcotronics ERP in your device settings, then try again.'
          )
          return
        }
      }
      await setChatPushEnabled(next)
      setPushMessages(next)
    } finally {
      setPushPrefSaving(false)
    }
  }

  const toggleEmailMessages = async () => {
    if (!accessToken || emailPrefSaving) return
    const next = !emailMessages
    setEmailPrefSaving(true)
    try {
      const settings = await chatApi.updateEmailMessages(accessToken, next)
      setEmailMessages(!!settings.emailMessages)
    } catch {
      Alert.alert('Email notifications', 'Could not update your preference.')
    } finally {
      setEmailPrefSaving(false)
    }
  }

  useEffect(() => {
    if (!showNew || !accessToken) return
    const t = setTimeout(async () => {
      setSearchingUsers(true)
      try {
        setUsers(await chatApi.searchUsers(accessToken, userSearch))
      } finally {
        setSearchingUsers(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [showNew, userSearch, accessToken])

  const filtered = conversations.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (c.name || '').toLowerCase().includes(q) || (c.lastMessagePreview || '').toLowerCase().includes(q)
  })

  const startChat = async (otherId: string) => {
    if (!accessToken) return
    try {
      const conv = await chatApi.createConversation(accessToken, {
        type: 'direct',
        participantIds: [otherId]
      })
      setShowNew(false)
      setUserSearch('')
      navigation.navigate('Chat', { conversationId: conv.id, title: conv.name })
      void load(true)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="Messages"
        subtitle="Team chat & direct messages"
        navigation={{ navigate: (name) => navigation.getParent()?.navigate(name as never) }}
        showMessages={false}
      />
      <ScreenBody>
        <View style={styles.toolbar}>
          <TextInput
            style={styles.search}
            placeholder="Search conversations…"
            placeholderTextColor={erp.textSubtle}
            value={query}
            onChangeText={setQuery}
          />
          <Pressable style={styles.newBtn} onPress={() => { setShowNew(true); setUserSearch('') }}>
            <Text style={styles.newBtnText}>+ New</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.emailPrefRow}
          onPress={() => void toggleEmailMessages()}
          disabled={emailPrefLoading || emailPrefSaving}
        >
          <Text style={styles.emailPrefLabel}>Email notifications</Text>
          <View style={[styles.emailPrefSwitch, emailMessages && styles.emailPrefSwitchOn]}>
            <View style={[styles.emailPrefKnob, emailMessages && styles.emailPrefKnobOn]} />
          </View>
        </Pressable>

        <Pressable
          style={styles.emailPrefRow}
          onPress={() => void togglePushMessages()}
          disabled={pushPrefLoading || pushPrefSaving}
        >
          <Text style={styles.emailPrefLabel}>Push notifications</Text>
          <View style={[styles.emailPrefSwitch, pushMessages && styles.emailPrefSwitchOn]}>
            <View style={[styles.emailPrefKnob, pushMessages && styles.emailPrefKnobOn]} />
          </View>
        </Pressable>

        <Pressable
          style={styles.emailPrefRow}
          onPress={() => void toggleNotificationSounds()}
          disabled={soundPrefLoading || soundPrefSaving}
        >
          <Text style={styles.emailPrefLabel}>Notification sounds</Text>
          <View style={[styles.emailPrefSwitch, soundEnabled && styles.emailPrefSwitchOn]}>
            <View style={[styles.emailPrefKnob, soundEnabled && styles.emailPrefKnobOn]} />
          </View>
        </Pressable>

        {loading && !conversations.length ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} />}
            ListEmptyComponent={
              <Text style={styles.empty}>No conversations yet. Tap + New to message a colleague.</Text>
            }
            renderItem={({ item }) => {
              const other = item.participants?.find((p) => p.userId !== userId)?.user
              return (
                <Pressable
                  style={styles.row}
                  onPress={() =>
                    navigation.navigate('Chat', { conversationId: item.id, title: item.name })
                  }
                >
                  <View style={[styles.avatar, item.type === 'group' && styles.avatarGroup]}>
                    <Text style={styles.avatarText}>
                      {item.type === 'group' ? '👥' : initials(other?.name, other?.email)}
                    </Text>
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.rowTime}>{formatTime(item.lastMessageAt)}</Text>
                    </View>
                    <View style={styles.rowBottom}>
                      <Text style={[styles.preview, (item.unreadCount || 0) > 0 && styles.previewUnread]} numberOfLines={1}>
                        {item.lastMessagePreview || 'No messages yet'}
                      </Text>
                      {(item.unreadCount || 0) > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{item.unreadCount! > 99 ? '99+' : item.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              )
            }}
          />
        )}
      </ScreenBody>

      <Modal visible={showNew} animationType="slide" transparent onRequestClose={() => setShowNew(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowNew(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>New message</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search people…"
              placeholderTextColor={erp.textSubtle}
              value={userSearch}
              onChangeText={setUserSearch}
              autoFocus
            />
            {searchingUsers ? (
              <ActivityIndicator color={erp.primary} style={{ marginVertical: 16 }} />
            ) : (
              <FlatList
                data={users}
                keyExtractor={(u) => u.id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable style={styles.userRow} onPress={() => startChat(item.id)}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(item.name, item.email)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.name || item.email}</Text>
                      <Text style={styles.userSub}>{item.jobTitle || item.email}</Text>
                    </View>
                    {item.online ? <Text style={styles.online}>Online</Text> : null}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  emailPrefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12
  },
  emailPrefLabel: { fontSize: 14, color: erp.text, fontWeight: '500' },
  emailPrefSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: erp.surfaceMuted,
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  emailPrefSwitchOn: { backgroundColor: erp.success },
  emailPrefKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2
  },
  emailPrefKnobOn: { alignSelf: 'flex-end' },
  search: {
    flex: 1,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: erp.text,
    fontSize: 15
  },
  modalSearch: {
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    color: erp.text,
    fontSize: 15,
    marginBottom: 12
  },
  newBtn: {
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingHorizontal: 14,
    justifyContent: 'center'
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', color: erp.textMuted, marginTop: 32, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: erp.border
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarGroup: { backgroundColor: erp.primarySoft },
  avatarText: { fontWeight: '700', color: erp.primary, fontSize: 16 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { fontWeight: '600', color: erp.text, fontSize: 16, flex: 1 },
  rowTime: { color: erp.textSubtle, fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  preview: { flex: 1, color: erp.textMuted, fontSize: 14 },
  previewUnread: { color: erp.text, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: erp.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: erp.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%'
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: erp.text, marginBottom: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  userSub: { color: erp.textMuted, fontSize: 13 },
  online: { color: erp.success, fontSize: 12, fontWeight: '600' }
  })
}