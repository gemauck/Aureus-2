import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { Team } from '../types'
import { isAdminUser, isManagementTeam, isTeamAccessible, teamAccentColor, teamIconName } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'TeamsHome'>

export function TeamsHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setError('')
      try {
        const list = await teamsApi.listTeams(accessToken)
        const filtered = list.filter((t) => {
          const name = (t.name || '').toLowerCase()
          const id = (t.id || '').toLowerCase()
          return name !== 'default team' && id !== 'default' && id !== 'default-team'
        })
        setTeams(filtered)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load teams')
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

  const visible = teams.filter((t) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      (t.name || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  })

  const openTeam = (team: Team) => {
    if (!isTeamAccessible(team.id, user)) return
    navigation.navigate('TeamDetail', { teamId: team.id, teamName: team.name })
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="Teams"
        subtitle="Knowledge hub & collaboration"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Search teams…"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={erp.textSubtle}
          />
        </View>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} />}
            ListEmptyComponent={<Text style={styles.empty}>No teams found.</Text>}
            renderItem={({ item }) => {
              const locked = isManagementTeam(item.id) && !isAdminUser(user)
              const accent = teamAccentColor(item)
              const discussions = item.counts?.discussions ?? 0
              return (
                <Pressable
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() => openTeam(item)}
                  disabled={locked}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
                    <FontAwesome5 name={teamIconName(item.icon) as 'users'} size={20} color={accent} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                      {locked ? <FontAwesome5 name="lock" size={12} color={erp.textSubtle} /> : null}
                    </View>
                    {item.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <Text style={styles.cardMeta}>
                      {discussions} discussion{discussions === 1 ? '' : 's'}
                      {item.members != null ? ` · ${item.members} members` : ''}
                    </Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={14} color={erp.textSubtle} />
                </Pressable>
              )
            }}
          />
        )}
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    searchWrap: { paddingHorizontal: erp.space.md, paddingVertical: 10 },
    search: {
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: erp.text
    },
    loader: { marginTop: 40 },
    center: { padding: erp.space.lg, alignItems: 'center', gap: 12 },
    error: { color: erp.danger, textAlign: 'center' },
    retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: erp.primary, borderRadius: erp.radius.md },
    retryText: { color: '#fff', fontWeight: '600' },
    list: { paddingHorizontal: erp.space.md, paddingBottom: 24, gap: 10 },
    empty: { textAlign: 'center', color: erp.textMuted, marginTop: 32 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border,
      ...erp.shadowSm
    },
    cardPressed: { opacity: 0.85 },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center'
    },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardTitle: { fontSize: 16, fontWeight: '600', color: erp.text, flex: 1 },
    cardDesc: { fontSize: 13, color: erp.textMuted, marginTop: 2 },
    cardMeta: { fontSize: 12, color: erp.textSubtle, marginTop: 4 }
  })
}
