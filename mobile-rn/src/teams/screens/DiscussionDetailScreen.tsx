import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { apiUrl } from '../../config'
import { uriToDataUrl } from '../../jobcards/media/mediaUri'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import { getMentionState, insertMention, MentionSuggestions, type MentionUser } from '../components/MentionSuggestions'
import type { TeamsStackParamList } from '../navigation'
import type { DiscussionAttachment, DiscussionReply, TeamDiscussion } from '../types'
import { formatRelative, stripHtml } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'DiscussionDetail'>

function resolveUrl(url?: string) {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('file:') || url.startsWith('data:')) return url
  return apiUrl(url.startsWith('/') ? url : `/${url}`)
}

export function DiscussionDetailScreen({ navigation, route }: Props) {
  const { teamId, discussionId, teamName } = route.params
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user } = useAuth()
  const [discussion, setDiscussion] = useState<TeamDiscussion | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<DiscussionAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const listRef = useRef<FlatList>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        const d = await teamsApi.getDiscussion(accessToken, discussionId)
        setDiscussion((prev) => {
          if (!silent || !prev || prev.id !== d.id) return d
          const existingIds = new Set((prev.replies || []).map((r) => r.id))
          const merged = [...(prev.replies || [])]
          for (const r of d.replies || []) {
            if (!existingIds.has(r.id)) merged.push(r)
          }
          return { ...d, replies: merged }
        })
      } catch (e) {
        if (!silent) Alert.alert('Discussion', e instanceof Error ? e.message : 'Could not load')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [accessToken, discussionId]
  )

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(true), 12000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!accessToken) return
    void teamsApi.listUsers(accessToken).then(setMentionUsers).catch(() => setMentionUsers([]))
  }, [accessToken])

  const mentionState = getMentionState(replyBody, selection.end)

  const pickAttachment = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85
    })
    if (result.canceled || !result.assets[0]?.uri || !accessToken) return
    const asset = result.assets[0]
    try {
      const dataUrl = await uriToDataUrl(asset.uri, asset.mimeType || 'image/jpeg')
      const uploaded = await teamsApi.uploadFile(
        accessToken,
        asset.fileName || `attachment-${Date.now()}.jpg`,
        dataUrl,
        'team-discussions'
      )
      setReplyAttachments((prev) => [
        ...prev,
        { name: uploaded.name, url: uploaded.url, mimeType: uploaded.mimeType, size: uploaded.size }
      ])
    } catch (e) {
      Alert.alert('Attachment', e instanceof Error ? e.message : 'Upload failed')
    }
  }

  const submitReply = async () => {
    if (!accessToken || !replyBody.trim() || submitting) return
    setSubmitting(true)
    try {
      const reply = await teamsApi.addReply(accessToken, discussionId, {
        body: replyBody.trim(),
        authorId: user?.id,
        authorName: user?.name || user?.email,
        attachments: replyAttachments
      })
      setDiscussion((prev) =>
        prev ? { ...prev, replies: [...(prev.replies || []), reply] } : prev
      )
      setReplyBody('')
      setReplyAttachments([])
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    } catch (e) {
      Alert.alert('Reply', e instanceof Error ? e.message : 'Could not post reply')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteDiscussion = () => {
    Alert.alert('Delete discussion', 'Remove this discussion permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return
          try {
            await teamsApi.deleteDiscussion(accessToken, discussionId)
            navigation.goBack()
          } catch (e) {
            Alert.alert('Delete', e instanceof Error ? e.message : 'Failed')
          }
        }
      }
    ])
  }

  const replies = discussion?.replies || []

  return (
    <View style={styles.root}>
      <ModuleHeader
        title={discussion?.title || 'Discussion'}
        showBack
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={replies}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                discussion ? (
                  <View style={styles.post}>
                    <View style={styles.postHeader}>
                      <Text style={styles.postAuthor}>{discussion.authorName || 'Unknown'}</Text>
                      <View style={styles.postActions}>
                        <Pressable
                          onPress={() =>
                            navigation.navigate('DiscussionForm', { teamId, discussionId, teamName })
                          }
                          hitSlop={8}
                        >
                          <FontAwesome5 name="edit" size={14} color={erp.textMuted} />
                        </Pressable>
                        <Text style={styles.postTime}>{formatRelative(discussion.createdAt)}</Text>
                      </View>
                    </View>
                    {discussion.type === 'notice' ? (
                      <View style={styles.noticeBadge}>
                        <Text style={styles.noticeText}>Notice</Text>
                      </View>
                    ) : null}
                    <Text style={styles.postBody}>{stripHtml(discussion.body)}</Text>
                    <Pressable onPress={deleteDiscussion} style={styles.deleteLink}>
                      <Text style={styles.deleteText}>Delete discussion</Text>
                    </Pressable>
                  </View>
                ) : null
              }
              renderItem={({ item }) => <ReplyBubble reply={item} mine={item.authorId === user?.id} />}
              ListEmptyComponent={
                <Text style={styles.noReplies}>No replies yet — start the conversation below.</Text>
              }
            />
            {replyAttachments.length ? (
              <ScrollView horizontal style={styles.attachRow} contentContainerStyle={styles.attachContent}>
                {replyAttachments.map((a, i) => (
                  <View key={`${a.url}-${i}`} style={styles.attachChip}>
                    <Text style={styles.attachName} numberOfLines={1}>{a.name || 'File'}</Text>
                    <Pressable onPress={() => setReplyAttachments((p) => p.filter((_, j) => j !== i))}>
                      <FontAwesome5 name="times" size={12} color={erp.textSubtle} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            {mentionState ? (
              <MentionSuggestions
                users={mentionUsers}
                query={mentionState.query}
                onSelect={(u) => {
                  const label = u.name || u.email || 'user'
                  const next = insertMention(replyBody, mentionState.start, selection.end, label)
                  setReplyBody(next)
                  setSelection({ start: mentionState.start + label.length + 2, end: mentionState.start + label.length + 2 })
                }}
              />
            ) : null}
            <View style={styles.composer}>
              <Pressable style={styles.attachBtn} onPress={() => void pickAttachment()}>
                <FontAwesome5 name="paperclip" size={16} color={erp.textMuted} />
              </Pressable>
              <TextInput
                style={styles.input}
                placeholder="Write a reply… (@ to mention)"
                value={replyBody}
                onChangeText={setReplyBody}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                multiline
                placeholderTextColor={erp.textSubtle}
              />
              <Pressable
                style={[styles.sendBtn, (!replyBody.trim() || submitting) && styles.sendDisabled]}
                onPress={() => void submitReply()}
                disabled={!replyBody.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome5 name="paper-plane" size={14} color="#fff" />
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

function ReplyBubble({ reply, mine }: { reply: DiscussionReply; mine: boolean }) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  return (
    <View style={[styles.reply, mine && styles.replyMine]}>
      <Text style={styles.replyAuthor}>{reply.authorName || 'Unknown'}</Text>
      <Text style={styles.replyBody}>{stripHtml(reply.body)}</Text>
      {(reply.attachments || []).map((a, i) => (
        <Pressable key={`${a.url}-${i}`} onPress={() => void Linking.openURL(resolveUrl(a.url))}>
          <Text style={styles.attachLink}>{a.name || 'Attachment'}</Text>
        </Pressable>
      ))}
      <Text style={styles.replyTime}>{formatRelative(reply.createdAt)}</Text>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    flex: { flex: 1 },
    loader: { marginTop: 40 },
    list: { padding: erp.space.md, paddingBottom: 8, gap: 10 },
    post: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 12
    },
    postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    postAuthor: { fontWeight: '600', color: erp.text, flex: 1 },
    postActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    postTime: { fontSize: 12, color: erp.textSubtle },
    noticeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: `${erp.warning}33`,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      marginBottom: 6
    },
    noticeText: { fontSize: 11, fontWeight: '700', color: erp.warning },
    postBody: { fontSize: 15, color: erp.text, lineHeight: 22 },
    deleteLink: { marginTop: 10 },
    deleteText: { fontSize: 12, color: erp.danger },
    noReplies: { textAlign: 'center', color: erp.textMuted, marginVertical: 16 },
    reply: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 12,
      borderWidth: 1,
      borderColor: erp.border
    },
    replyMine: { borderColor: `${erp.primary}55`, backgroundColor: `${erp.primary}0d` },
    replyAuthor: { fontSize: 13, fontWeight: '600', color: erp.text, marginBottom: 4 },
    replyBody: { fontSize: 14, color: erp.text, lineHeight: 20 },
    attachLink: { fontSize: 13, color: erp.primary, marginTop: 6 },
    replyTime: { fontSize: 11, color: erp.textSubtle, marginTop: 6 },
    attachRow: { maxHeight: 44, borderTopWidth: 1, borderTopColor: erp.border },
    attachContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    attachChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: erp.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: erp.border,
      maxWidth: 160
    },
    attachName: { fontSize: 12, color: erp.text, flex: 1 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: erp.border,
      backgroundColor: erp.surface
    },
    attachBtn: { padding: 10 },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 15,
      color: erp.text,
      backgroundColor: erp.bg
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: erp.primary,
      alignItems: 'center',
      justifyContent: 'center'
    },
    sendDisabled: { opacity: 0.5 }
  })
}
