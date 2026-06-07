import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { DEPARTMENTS } from '../constants'
import { usersApi } from '../api'
import type { UsersStackParamList } from '../navigation'
import type { ErpUserRecord, UserInvitation } from '../types'
import {
  formatLastSeen,
  isAdminUser,
  isUserOnline,
  roleColor,
  roleLabel,
  sortUsers
} from '../utils'

type Props = NativeStackScreenProps<UsersStackParamList, 'UsersHome'>

const ROLE_FILTERS = ['all', 'superadmin', 'admin', 'manager', 'user', 'guest'] as const
const STATUS_FILTERS = ['all', 'Active', 'Inactive'] as const

export function UsersHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user: currentUser } = useAuth()
  const [users, setUsers] = useState<ErpUserRecord[]>([])
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState<(typeof ROLE_FILTERS)[number]>('all')
  const [filterStatus, setFilterStatus] = useState<(typeof STATUS_FILTERS)[number]>('all')

  const isAdmin = isAdminUser(currentUser)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken || !isAdmin) return
      if (!silent) setLoading(true)
      setError('')
      try {
        const data = await usersApi.listUsersAndInvitations(accessToken)
        setUsers(data.users)
        setInvitations(data.invitations)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load users')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, isAdmin]
  )

  React.useEffect(() => {
    void load()
  }, [load])

  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => (inv.status || 'pending') === 'pending'),
    [invitations]
  )

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    const filtered = users.filter((u) => {
      const matchesSearch =
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      const matchesRole = filterRole === 'all' || (u.role || '').toLowerCase() === filterRole
      const matchesStatus = filterStatus === 'all' || u.status === filterStatus
      return matchesSearch && matchesRole && matchesStatus
    })
    return sortUsers(filtered, 'name', 'asc')
  }, [users, searchTerm, filterRole, filterStatus])

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === 'Active').length,
      admins: users.filter((u) => (u.role || '').toLowerCase() === 'admin').length,
      departments: DEPARTMENTS.length
    }),
    [users]
  )

  const deleteUser = (target: ErpUserRecord) => {
    Alert.alert('Delete user', `Delete ${target.name || target.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return
          try {
            await usersApi.deleteUser(accessToken, target.id)
            void load(true)
            Alert.alert('Deleted', 'User deleted successfully')
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : 'Could not delete user')
          }
        }
      }
    ])
  }

  const toggleStatus = async (target: ErpUserRecord) => {
    if (!accessToken) return
    try {
      await usersApi.toggleUserStatus(accessToken, target)
      void load(true)
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Could not update status')
    }
  }

  const resendInvitation = async (invitation: UserInvitation) => {
    if (!accessToken) return
    try {
      const result = await usersApi.resendInvitation(accessToken, invitation.id)
      Alert.alert('Invitation', result.message || 'Invitation resent')
      void load(true)
    } catch (e) {
      Alert.alert('Resend failed', e instanceof Error ? e.message : 'Could not resend invitation')
    }
  }

  const cancelInvitation = (invitation: UserInvitation) => {
    Alert.alert('Delete invitation', `Delete invitation for ${invitation.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return
          try {
            await usersApi.deleteInvitation(accessToken, invitation.id)
            void load(true)
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : 'Could not delete invitation')
          }
        }
      }
    ])
  }

  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <AppHeader title="Users" subtitle="User management" />
        <ScreenBody>
          <View style={styles.denied}>
            <FontAwesome5 name="lock" size={36} color={erp.textMuted} />
            <Text style={styles.deniedTitle}>Access denied</Text>
            <Text style={styles.deniedText}>
              You need administrator privileges to access user management.
            </Text>
            <Pressable style={styles.deniedBtn} onPress={() => navigation.getParent()?.navigate('Dashboard')}>
              <Text style={styles.deniedBtnText}>Go to Dashboard</Text>
            </Pressable>
          </View>
        </ScreenBody>
      </View>
    )
  }

  const renderUser = ({ item }: { item: ErpUserRecord }) => {
    const online = isUserOnline(item)
    const color = roleColor(item.role)
    return (
      <Pressable
        style={({ pressed }) => [styles.userCard, pressed && styles.cardPressed]}
        onPress={() => navigation.navigate('UserForm', { userId: item.id })}
      >
        <View style={styles.userTop}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.avatarText, { color }]}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            {online ? <View style={styles.onlineDot} /> : null}
          </View>
          <View style={styles.userBody}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {item.name}
              </Text>
              {online ? <Text style={styles.onlineLabel}>Online</Text> : null}
            </View>
            <Text style={styles.userEmail} numberOfLines={1}>
              {item.email}
            </Text>
            <Text style={styles.lastSeen}>{formatLastSeen(item)}</Text>
          </View>
          <Pressable
            style={[styles.statusPill, item.status === 'Active' ? styles.statusActive : styles.statusInactive]}
            onPress={() => void toggleStatus(item)}
          >
            <Text style={styles.statusText}>{item.status}</Text>
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.rolePill, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.roleText, { color }]}>{roleLabel(item.role)}</Text>
          </View>
          {item.department ? <Text style={styles.dept}>{item.department}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('UserForm', { userId: item.id })}>
            <FontAwesome5 name="edit" size={12} color={erp.primary} />
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          {item.id !== currentUser?.id ? (
            <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={() => deleteUser(item)}>
              <FontAwesome5 name="trash" size={12} color="#ef4444" />
              <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    )
  }

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.actionsRow}>
        <Pressable style={[styles.headerBtn, styles.inviteBtn]} onPress={() => navigation.navigate('InviteUser')}>
          <FontAwesome5 name="envelope" size={13} color="#fff" />
          <Text style={styles.headerBtnText}>Invite</Text>
        </Pressable>
        <Pressable style={[styles.headerBtn, styles.addBtn]} onPress={() => navigation.navigate('UserForm', {})}>
          <FontAwesome5 name="user-plus" size={13} color="#fff" />
          <Text style={styles.headerBtnText}>Add user</Text>
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Total" value={stats.total} icon="users" color={erp.primary} styles={styles} erp={erp} />
        <StatCard label="Active" value={stats.active} icon="user-check" color="#22c55e" styles={styles} erp={erp} />
        <StatCard label="Admins" value={stats.admins} icon="user-shield" color="#ef4444" styles={styles} erp={erp} />
        <StatCard label="Depts" value={stats.departments} icon="building" color="#8b5cf6" styles={styles} erp={erp} />
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search by name or email…"
        placeholderTextColor={erp.textSubtle}
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {ROLE_FILTERS.map((role) => (
          <Pressable
            key={role}
            style={[styles.chip, filterRole === role && styles.chipActive]}
            onPress={() => setFilterRole(role)}
          >
            <Text style={[styles.chipText, filterRole === role && styles.chipTextActive]}>
              {role === 'all' ? 'All roles' : roleLabel(role)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {STATUS_FILTERS.map((status) => (
          <Pressable
            key={status}
            style={[styles.chip, filterStatus === status && styles.chipActive]}
            onPress={() => setFilterStatus(status)}
          >
            <Text style={[styles.chipText, filterStatus === status && styles.chipTextActive]}>
              {status === 'all' ? 'All status' : status}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {pendingInvitations.length > 0 ? (
        <View style={styles.inviteSection}>
          <View style={styles.inviteHeader}>
            <Text style={styles.inviteTitle}>Pending invitations</Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingInvitations.length}</Text>
            </View>
          </View>
          {pendingInvitations.map((inv) => (
            <View key={inv.id} style={styles.inviteCard}>
              <View style={styles.inviteBody}>
                <Text style={styles.inviteEmail}>{inv.email}</Text>
                <Text style={styles.inviteMeta}>
                  {roleLabel(inv.role)}
                  {inv.department ? ` · ${inv.department}` : ''}
                  {inv.expiresAt ? ` · Expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ''}
                </Text>
              </View>
              <View style={styles.inviteActions}>
                <Pressable style={styles.inviteAction} onPress={() => void resendInvitation(inv)}>
                  <Text style={styles.inviteActionText}>Resend</Text>
                </Pressable>
                <Pressable style={[styles.inviteAction, styles.inviteDelete]} onPress={() => cancelInvitation(inv)}>
                  <Text style={[styles.inviteActionText, styles.inviteDeleteText]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Users ({filteredUsers.length})</Text>
    </View>
  )

  return (
    <View style={styles.root}>
      <AppHeader
        title="User Management"
        subtitle="Manage users, roles, and permissions"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
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
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void load(true)
                }}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <FontAwesome5 name="users" size={32} color={erp.textMuted} />
                <Text style={styles.empty}>No users found</Text>
                <Pressable style={styles.addBtn} onPress={() => navigation.navigate('UserForm', {})}>
                  <Text style={styles.headerBtnText}>Add first user</Text>
                </Pressable>
              </View>
            }
          />
        )}
      </ScreenBody>
    </View>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  styles,
  erp
}: {
  label: string
  value: number
  icon: string
  color: string
  styles: ReturnType<typeof createStyles>
  erp: ErpTheme
}) {
  return (
    <View style={styles.statCard}>
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <FontAwesome5 name={icon} size={16} color={color} />
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    loader: { marginTop: 40 },
    center: { alignItems: 'center', padding: 24, gap: 12 },
    error: { color: '#ef4444', textAlign: 'center' },
    retryBtn: { backgroundColor: erp.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#fff', fontWeight: '600' },
    list: { padding: 16, paddingBottom: 32, gap: 12 },
    headerBlock: { gap: 12, marginBottom: 8 },
    actionsRow: { flexDirection: 'row', gap: 10 },
    headerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10
    },
    inviteBtn: { backgroundColor: '#16a34a' },
    addBtn: { backgroundColor: erp.primary },
    headerBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    statLabel: { fontSize: 11, color: erp.textMuted },
    statValue: { fontSize: 22, fontWeight: '700', color: erp.text, marginTop: 2 },
    search: {
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 15,
      color: erp.text
    },
    filterScroll: { flexGrow: 0 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      marginRight: 8
    },
    chipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    chipText: { fontSize: 12, color: erp.textMuted, fontWeight: '500' },
    chipTextActive: { color: '#fff' },
    inviteSection: {
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 12,
      padding: 12,
      gap: 8
    },
    inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inviteTitle: { fontSize: 14, fontWeight: '600', color: erp.text },
    pendingBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
    inviteCard: {
      backgroundColor: erp.bg,
      borderRadius: 10,
      padding: 10,
      gap: 8
    },
    inviteBody: { gap: 2 },
    inviteEmail: { fontSize: 14, fontWeight: '600', color: erp.text },
    inviteMeta: { fontSize: 11, color: erp.textMuted },
    inviteActions: { flexDirection: 'row', gap: 8 },
    inviteAction: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: '#dbeafe'
    },
    inviteDelete: { backgroundColor: '#fee2e2' },
    inviteActionText: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
    inviteDeleteText: { color: '#b91c1c' },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: erp.text, marginTop: 4 },
    userCard: {
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 12,
      padding: 12,
      gap: 10
    },
    cardPressed: { opacity: 0.92 },
    userTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarText: { fontSize: 16, fontWeight: '700' },
    onlineDot: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#22c55e',
      borderWidth: 2,
      borderColor: erp.surface
    },
    userBody: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    userName: { fontSize: 15, fontWeight: '600', color: erp.text, flexShrink: 1 },
    onlineLabel: { fontSize: 10, color: '#16a34a', fontWeight: '600' },
    userEmail: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
    lastSeen: { fontSize: 11, color: erp.textSubtle, marginTop: 2 },
    statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusActive: { backgroundColor: '#dcfce7' },
    statusInactive: { backgroundColor: erp.border },
    statusText: { fontSize: 10, fontWeight: '700', color: erp.text },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    rolePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    roleText: { fontSize: 11, fontWeight: '600' },
    dept: { fontSize: 12, color: erp.textMuted },
    actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: erp.border, paddingTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
    actionText: { fontSize: 12, fontWeight: '600', color: erp.primary },
    deleteBtn: {},
    deleteText: { color: '#ef4444' },
    emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 12 },
    empty: { color: erp.textMuted, fontSize: 14 },
    denied: { alignItems: 'center', paddingVertical: 48, gap: 12 },
    deniedTitle: { fontSize: 20, fontWeight: '700', color: erp.text },
    deniedText: { fontSize: 14, color: erp.textMuted, textAlign: 'center', lineHeight: 20 },
    deniedBtn: { marginTop: 8, backgroundColor: erp.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
    deniedBtnText: { color: '#fff', fontWeight: '600' }
  })
