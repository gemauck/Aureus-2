import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { TeamDiscussion } from '../types'
import { formatRelative, stripHtml } from '../utils'

type Props = {
  teamId: string
  teamName: string
  search: string
  initialDiscussionId?: string
  navigation: NativeStackNavigationProp<TeamsStackParamList, 'TeamDetail'>
}

export function DiscussionsTab({ teamId, teamName, search, initialDiscussionId, navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [discussions, setDiscussions] = useState<TeamDiscussion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const appliedInitial = useRef(false)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        setDiscussions(await teamsApi.listDiscussions(accessToken, teamId))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, teamId]
  )

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(true), 15000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!initialDiscussionId || appliedInitial.current) return
    appliedInitial.current = true
    navigation.navigate('DiscussionDetail', {
      teamId,
      discussionId: initialDiscussionId,
      teamName
    })
  }, [initialDiscussionId, navigation, teamId, teamName])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return discussions
    return discussions.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.body || '').toLowerCase().includes(q) ||
        (d.authorName || '').toLowerCase().includes(q)
    )
  }, [discussions, search])

  if (loading) return <ActivityIndicator style={styles.loader} color={erp.primary} />

  return (
    <View style={styles.wrap}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No discussions yet.</Text>}
        renderItem={({ item }) => {
          const replyCount = item._count?.replies ?? item.replies?.length ?? 0
          const preview = stripHtml(item.body).slice(0, 120)
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                navigation.navigate('DiscussionDetail', {
                  teamId,
                  discussionId: item.id,
                  teamName
                })
              }
            >
              <View style={styles.rowTop}>
                {item.pinned ? <FontAwesome5 name="thumbtack" size={11} color={erp.primary} /> : null}
                {item.type === 'notice' ? (
                  <View style={styles.noticeBadge}>
                    <Text style={styles.noticeText}>Notice</Text>
                  </View>
                ) : null}
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              </View>
              {preview ? <Text style={styles.preview} numberOfLines={2}>{preview}</Text> : null}
              <Text style={styles.meta}>
                {item.authorName || 'Unknown'} · {formatRelative(item.updatedAt || item.createdAt)}
                {replyCount ? ` · ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}` : ''}
              </Text>
            </Pressable>
          )
        }}
      />
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('DiscussionForm', { teamId, teamName })}
      >
        <FontAwesome5 name="plus" size={18} color="#fff" />
      </Pressable>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    loader: { marginTop: 24 },
    list: { paddingHorizontal: erp.space.md, paddingBottom: 80, gap: 8 },
    empty: { textAlign: 'center', color: erp.textMuted, marginTop: 24 },
    row: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border
    },
    rowPressed: { opacity: 0.9 },
    rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' },
    title: { flex: 1, fontSize: 15, fontWeight: '600', color: erp.text },
    noticeBadge: {
      backgroundColor: `${erp.warning}33`,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4
    },
    noticeText: { fontSize: 10, fontWeight: '700', color: erp.warning },
    preview: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
    meta: { fontSize: 12, color: erp.textSubtle, marginTop: 6 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: erp.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...erp.shadow
    }
  })
}
