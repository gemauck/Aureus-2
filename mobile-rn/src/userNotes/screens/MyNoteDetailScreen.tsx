import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { formatDateTime, stripHtml } from '../../projects/utils'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { userNotesApi } from '../api'
import { ShareNoteModal } from '../components/ShareNoteModal'
import type { MyNotesStackParamList } from '../navigation'
import type { UserNote, UserNoteActivity } from '../types'

type Props = NativeStackScreenProps<MyNotesStackParamList, 'MyNoteDetail'>

export function MyNoteDetailScreen({ route, navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const { noteId, isNew } = route.params
  const { accessToken } = useAuth()
  const [note, setNote] = useState<UserNote | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [pinned, setPinned] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clients, setClients] = useState<Array<{ id: string; name?: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name?: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name?: string; email?: string }>>([])
  const [showShare, setShowShare] = useState(false)
  const [activity, setActivity] = useState<UserNoteActivity[]>([])
  const [showActivity, setShowActivity] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isOwner = isNew || note?.isOwner !== false

  const loadMeta = useCallback(async () => {
    if (!accessToken) return
    const [c, u] = await Promise.all([
      userNotesApi.listClients(accessToken).catch(() => []),
      userNotesApi.listUsers(accessToken).catch(() => [])
    ])
    setClients(c)
    setUsers(u)
  }, [accessToken])

  const loadProjects = useCallback(
    async (cid?: string | null) => {
      if (!accessToken) return
      const list = await userNotesApi.listProjects(accessToken, cid || undefined).catch(() => [])
      setProjects(list)
    },
    [accessToken]
  )

  const load = useCallback(async () => {
    if (!accessToken || isNew) {
      setNote({ id: 'new', title: '', content: '', tags: [], pinned: false, isOwner: true })
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const n = await userNotesApi.getNote(accessToken, noteId)
      setNote(n)
      setTitle(n.title || '')
      setContent(stripHtml(n.content))
      setTagsText((n.tags || []).join(', '))
      setPinned(Boolean(n.pinned))
      setIsPublic(Boolean(n.isPublic))
      setClientId(n.clientId || null)
      setProjectId(n.projectId || null)
      if (n.projectId) {
        const logs = await userNotesApi
          .listNoteActivity(accessToken, n.projectId, noteId)
          .catch(() => [])
        setActivity(logs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load note')
    } finally {
      setLoading(false)
    }
  }, [accessToken, isNew, noteId])

  useEffect(() => {
    void loadMeta()
    void load()
  }, [load, loadMeta])

  useEffect(() => {
    void loadProjects(clientId)
  }, [clientId, loadProjects])

  const parseTags = () =>
    tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

  const persist = async (silent = false) => {
    if (!accessToken || !isOwner) return
    const trimmedTitle = title.trim() || 'Untitled Note'
    if (!silent) setSaving(true)
    setError('')
    try {
      const body = {
        title: trimmedTitle,
        content,
        tags: parseTags(),
        pinned,
        isPublic,
        clientId,
        projectId
      }
      if (isNew || noteId === 'new') {
        const created = await userNotesApi.createNote(accessToken, body)
        navigation.replace('MyNoteDetail', { noteId: created.id })
        return
      }
      const updated = await userNotesApi.updateNote(accessToken, noteId, body)
      setNote(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      if (!silent) setSaving(false)
    }
  }

  const scheduleAutosave = () => {
    if (!isOwner || isNew) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persist(true)
    }, 2000)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const confirmDelete = () => {
    Alert.alert('Delete note', 'This note will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteNote() }
    ])
  }

  const deleteNote = async () => {
    if (!accessToken || isNew || noteId === 'new') {
      navigation.goBack()
      return
    }
    setSaving(true)
    try {
      await userNotesApi.deleteNote(accessToken, noteId)
      navigation.goBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  const onShareSave = async (sharedWith: string[]) => {
    if (!accessToken || isNew || noteId === 'new') return
    setSaving(true)
    try {
      const updated = await userNotesApi.shareNote(accessToken, noteId, sharedWith)
      setNote(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update sharing')
    } finally {
      setSaving(false)
    }
  }

  const sharedIds = (note?.sharedWith || [])
    .map((s) => s.userId || s.user?.id)
    .filter(Boolean) as string[]

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={erp.primary} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>My Notes</Text>
        </Pressable>
        <Text style={styles.meta}>
          {[
            note?.isOwner === false ? `Shared by ${note.sharedBy?.name || 'someone'}` : null,
            formatDateTime(note?.updatedAt || note?.createdAt)
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {isOwner ? (
          <View style={styles.headerActions}>
            <Pressable style={styles.iconBtn} onPress={() => setShowShare(true)}>
              <FontAwesome5 name="share-alt" size={16} color={erp.primary} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={confirmDelete}>
              <FontAwesome5 name="trash-alt" size={16} color={erp.danger} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!isOwner ? (
          <Text style={styles.readOnlyBanner}>Read-only — shared with you</Text>
        ) : null}

        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={(v) => {
            setTitle(v)
            scheduleAutosave()
          }}
          editable={isOwner}
          placeholder="Note title"
          placeholderTextColor={erp.textSubtle}
        />

        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={(v) => {
            setContent(v)
            scheduleAutosave()
          }}
          editable={isOwner}
          placeholder="Write your note…"
          placeholderTextColor={erp.textSubtle}
          multiline
          textAlignVertical="top"
        />

        {isOwner ? (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>Pinned</Text>
              <Switch
                value={pinned}
                onValueChange={(v) => {
                  setPinned(v)
                  scheduleAutosave()
                }}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Public on project</Text>
              <Switch
                value={isPublic}
                onValueChange={(v) => {
                  setIsPublic(v)
                  scheduleAutosave()
                }}
              />
            </View>

            <Text style={styles.sectionTitle}>Tags</Text>
            <TextInput
              style={styles.fieldInput}
              value={tagsText}
              onChangeText={(v) => {
                setTagsText(v)
                scheduleAutosave()
              }}
              placeholder="Comma-separated tags"
              placeholderTextColor={erp.textSubtle}
            />

            <Text style={styles.sectionTitle}>Client</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable
                style={[styles.chip, !clientId && styles.chipActive]}
                onPress={() => {
                  setClientId(null)
                  setProjectId(null)
                  scheduleAutosave()
                }}
              >
                <Text style={[styles.chipText, !clientId && styles.chipTextActive]}>None</Text>
              </Pressable>
              {clients.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.chip, clientId === c.id && styles.chipActive]}
                  onPress={() => {
                    setClientId(c.id)
                    setProjectId(null)
                    scheduleAutosave()
                  }}
                >
                  <Text style={[styles.chipText, clientId === c.id && styles.chipTextActive]}>
                    {c.name || c.id}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>Project</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable
                style={[styles.chip, !projectId && styles.chipActive]}
                onPress={() => {
                  setProjectId(null)
                  scheduleAutosave()
                }}
              >
                <Text style={[styles.chipText, !projectId && styles.chipTextActive]}>None</Text>
              </Pressable>
              {projects.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.chip, projectId === p.id && styles.chipActive]}
                  onPress={() => {
                    setProjectId(p.id)
                    scheduleAutosave()
                  }}
                >
                  <Text style={[styles.chipText, projectId === p.id && styles.chipTextActive]}>
                    {p.name || p.id}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void persist()}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>{isNew ? 'Create note' : 'Save now'}</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {activity.length ? (
          <View style={styles.activitySection}>
            <Pressable style={styles.activityToggle} onPress={() => setShowActivity((v) => !v)}>
              <Text style={styles.sectionTitle}>Project activity ({activity.length})</Text>
              <FontAwesome5 name={showActivity ? 'chevron-up' : 'chevron-down'} size={12} color={erp.textMuted} />
            </Pressable>
            {showActivity
              ? activity.map((entry) => (
                  <View key={entry.id} style={styles.activityRow}>
                    <Text style={styles.activityDesc}>{entry.description || entry.type}</Text>
                    <Text style={styles.activityMeta}>
                      {[entry.userName, formatDateTime(entry.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <ShareNoteModal
        visible={showShare}
        users={users}
        selectedIds={sharedIds as string[]}
        onSave={(ids) => void onShareSave(ids)}
        onClose={() => setShowShare(false)}
      />
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      paddingTop: 12,
      paddingHorizontal: erp.space.lg,
      paddingBottom: 12,
      backgroundColor: erp.surface,
      borderBottomWidth: 1,
      borderBottomColor: erp.border
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    backText: { color: erp.primary, fontWeight: '700', fontSize: 15 },
    meta: { fontSize: 12, color: erp.textSubtle },
    headerActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
    iconBtn: { padding: 4 },
    body: { padding: erp.space.lg, gap: 12, paddingBottom: 40 },
    readOnlyBanner: {
      backgroundColor: '#fef3c7',
      color: '#92400e',
      padding: 10,
      borderRadius: erp.radius.md,
      fontWeight: '700',
      fontSize: 13
    },
    titleInput: { fontSize: 22, fontWeight: '800', color: erp.text, paddingVertical: 8 },
    contentInput: {
      minHeight: 240,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.lg,
      padding: 14,
      backgroundColor: erp.surface,
      color: erp.text,
      fontSize: 16,
      lineHeight: 24
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: 15, fontWeight: '700', color: erp.text },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: erp.textMuted, textTransform: 'uppercase' },
    fieldInput: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 12,
      backgroundColor: erp.surface,
      color: erp.text
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      marginRight: 8,
      marginBottom: 8
    },
    chipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: erp.textMuted },
    chipTextActive: { color: '#fff' },
    saveBtn: {
      backgroundColor: erp.primary,
      borderRadius: erp.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    disabled: { opacity: 0.6 },
    error: { color: erp.danger, fontWeight: '600' },
    activitySection: { marginTop: 8, gap: 8 },
    activityToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    activityRow: {
      borderLeftWidth: 3,
      borderLeftColor: erp.primary,
      paddingLeft: 10,
      paddingVertical: 6
    },
    activityDesc: { fontSize: 14, color: erp.text, fontWeight: '600' },
    activityMeta: { fontSize: 12, color: erp.textSubtle, marginTop: 2 }
  })
}
