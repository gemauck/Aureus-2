import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { formatRelative } from '../../projects/utils'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { userNotesApi } from '../api'
import type { MyNotesStackParamList } from '../navigation'
import type { UserNote } from '../types'
import { allNoteTags, filterNotes, notePreview, noteTags, sortNotes } from '../utils'

type Props = NativeStackScreenProps<MyNotesStackParamList, 'MyNotesHome'>

export function MyNotesHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [notes, setNotes] = useState<UserNote[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setError('')
      try {
        const list = await userNotesApi.listNotes(accessToken)
        setNotes(sortNotes(list))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load notes')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    void load()
  }, [load])

  useFocusReload(navigation, load)

  const tags = useMemo(() => allNoteTags(notes), [notes])
  const filtered = useMemo(() => filterNotes(notes, query, tagFilter), [notes, query, tagFilter])

  const onCreate = () => {
    navigation.navigate('MyNoteDetail', { noteId: 'new', isNew: true })
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="My Notes"
        subtitle="Personal notes with sharing and tags"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Search notes…"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={erp.textSubtle}
          />
        </View>
        {tags.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Pressable
              style={[styles.filterChip, !tagFilter && styles.filterChipActive]}
              onPress={() => setTagFilter('')}
            >
              <Text style={[styles.filterText, !tagFilter && styles.filterTextActive]}>All tags</Text>
            </Pressable>
            {tags.map((tag) => {
              const active = tagFilter === tag
              return (
                <Pressable
                  key={tag}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setTagFilter(active ? '' : tag)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{tag}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={erp.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void load(true)
                }}
                tintColor={erp.primary}
              />
            }
            ListEmptyComponent={<Text style={styles.empty}>No notes yet. Tap + to create one.</Text>}
            renderItem={({ item }) => (
              <NoteCard
                note={item}
                onPress={() => navigation.navigate('MyNoteDetail', { noteId: item.id })}
              />
            )}
          />
        )}
      </ScreenBody>

      <Pressable style={styles.fab} onPress={onCreate}>
        <FontAwesome5 name="plus" size={20} color="#fff" />
      </Pressable>
    </View>
  )
}

function useFocusReload(navigation: Props['navigation'], load: (silent?: boolean) => Promise<void>) {
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      void load(true)
    })
    return unsub
  }, [navigation, load])
}

function NoteCard({ note, onPress }: { note: UserNote; onPress: () => void }) {
  const styles = useThemedStyles(createStyles)
  const tags = noteTags(note)
  const shared = note.isOwner === false

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        {note.pinned ? <FontAwesome5 name="thumbtack" size={12} color="#f59e0b" /> : null}
        <Text style={styles.cardTitle} numberOfLines={1}>
          {note.title || 'Untitled note'}
        </Text>
        {shared ? (
          <View style={styles.sharedBadge}>
            <Text style={styles.sharedText}>Shared</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.preview} numberOfLines={2}>
        {notePreview(note)}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.meta}>{formatRelative(note.updatedAt || note.createdAt)}</Text>
        {tags.length ? (
          <Text style={styles.meta} numberOfLines={1}>
            {tags.slice(0, 3).join(' · ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    searchWrap: { paddingHorizontal: erp.space.lg, paddingTop: 8, paddingBottom: 4 },
    search: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: erp.surface,
      fontSize: 16,
      color: erp.text
    },
    filters: { paddingHorizontal: erp.space.lg, paddingBottom: 8, gap: 8 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    filterChipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    filterText: { fontSize: 13, fontWeight: '600', color: erp.textMuted },
    filterTextActive: { color: '#fff' },
    list: { paddingHorizontal: erp.space.lg, paddingBottom: 88 },
    card: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 10,
      ...erp.shadowSm
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: erp.text },
    sharedBadge: {
      backgroundColor: '#fef3c7',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2
    },
    sharedText: { fontSize: 10, fontWeight: '800', color: '#92400e' },
    preview: { fontSize: 14, color: erp.textMuted, lineHeight: 20 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 },
    meta: { fontSize: 12, color: erp.textSubtle, fontWeight: '600', flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    error: { color: erp.danger, fontWeight: '600', textAlign: 'center' },
    retry: { color: erp.primary, fontWeight: '700' },
    empty: { textAlign: 'center', color: erp.textMuted, padding: 32, fontSize: 15 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: erp.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...erp.shadow
    }
  })
}
