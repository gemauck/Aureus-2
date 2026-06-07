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
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { TeamMembership } from '../types'

type Props = NativeStackScreenProps<TeamsStackParamList, 'TeamMembers'>
type ErpUser = { id: string; name?: string; email?: string }

export function TeamMembersScreen({ navigation, route }: Props) {
  const { teamId, teamName } = route.params
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [members, setMembers] = useState<TeamMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [users, setUsers] = useState<ErpUser[]>([])
  const [searching, setSearching] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        setMembers(await teamsApi.listMembers(accessToken, teamId))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, teamId]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showAdd || !accessToken) return
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const all = await teamsApi.listUsers(accessToken)
        const q = userQuery.trim().toLowerCase()
        setUsers(
          q
            ? all.filter(
                (u) =>
                  (u.name || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q)
              )
            : all.slice(0, 30)
        )
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [showAdd, accessToken, userQuery])

  const addMember = async (userId: string) => {
    if (!accessToken) return
    try {
      await teamsApi.addMember(accessToken, teamId, userId)
      setShowAdd(false)
      setUserQuery('')
      void load(true)
    } catch (e) {
      Alert.alert('Add member', e instanceof Error ? e.message : 'Failed')
    }
  }

  const removeMember = (userId: string, name?: string) => {
    Alert.alert('Remove member', `Remove ${name || 'this user'} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return
          try {
            await teamsApi.removeMember(accessToken, teamId, userId)
            void load(true)
          } catch (e) {
            Alert.alert('Remove', e instanceof Error ? e.message : 'Failed')
          }
        }
      }
    ])
  }

  const memberIds = new Set(members.map((m) => m.userId))

  return (
    <View style={styles.root}>
      <ModuleHeader
        title="Members"
        subtitle={teamName || 'Team members'}
        showBack
        onBack={() => navigation.goBack()}
      />
      <ScreenBody padded={false}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} />
            }
            ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.rowBody}>
                  <Text style={styles.name}>{item.user?.name || item.user?.email || item.userId}</Text>
                  {item.user?.email ? <Text style={styles.email}>{item.user.email}</Text> : null}
                  {item.role ? <Text style={styles.role}>{item.role}</Text> : null}
                </View>
                <Pressable onPress={() => removeMember(item.userId, item.user?.name)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            )}
          />
        )}
        <Pressable style={styles.fab} onPress={() => setShowAdd(true)}>
          <Text style={styles.fabText}>+ Add member</Text>
        </Pressable>
      </ScreenBody>

      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Add team member</Text>
          <TextInput
            style={styles.search}
            placeholder="Search users…"
            value={userQuery}
            onChangeText={setUserQuery}
            placeholderTextColor={erp.textSubtle}
          />
          {searching ? <ActivityIndicator color={erp.primary} /> : null}
          <FlatList
            data={users.filter((u) => !memberIds.has(u.id))}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => (
              <Pressable style={styles.userRow} onPress={() => void addMember(item.id)}>
                <Text style={styles.userName}>{item.name || item.email}</Text>
                {item.email && item.name ? <Text style={styles.userEmail}>{item.email}</Text> : null}
              </Pressable>
            )}
          />
          <Pressable style={styles.closeBtn} onPress={() => setShowAdd(false)}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    loader: { marginTop: 32 },
    list: { padding: erp.space.md, paddingBottom: 80, gap: 8 },
    empty: { textAlign: 'center', color: erp.textMuted, marginTop: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border
    },
    rowBody: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600', color: erp.text },
    email: { fontSize: 13, color: erp.textMuted, marginTop: 2 },
    role: { fontSize: 12, color: erp.textSubtle, marginTop: 2 },
    remove: { fontSize: 13, color: erp.danger, fontWeight: '600' },
    fab: {
      position: 'absolute',
      bottom: 20,
      left: erp.space.md,
      right: erp.space.md,
      backgroundColor: erp.primary,
      paddingVertical: 14,
      borderRadius: erp.radius.md,
      alignItems: 'center'
    },
    fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    modal: { flex: 1, backgroundColor: erp.bg, padding: erp.space.lg, paddingTop: 48 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: erp.text, marginBottom: 12 },
    search: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 12,
      fontSize: 15,
      color: erp.text,
      backgroundColor: erp.surface,
      marginBottom: 12
    },
    userRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: erp.border
    },
    userName: { fontSize: 15, fontWeight: '600', color: erp.text },
    userEmail: { fontSize: 13, color: erp.textMuted },
    closeBtn: { marginTop: 16, alignItems: 'center', padding: 12 },
    closeText: { color: erp.primary, fontWeight: '600', fontSize: 16 }
  })
}
