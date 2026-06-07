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
      online: users.filter((u) => isUserOnline(u)).length,
      admins: users.filter((u) => (u.role || '').toLowerCase() === 'admin').length
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

  const openUserActions = (item: ErpUserRecord) => {
    const canDelete = item.id !== currentUser?.id
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Edit', onPress: () => navigation.navigate('UserForm', { userId: item.id }) },
      {
        text: item.status === 'Active' ? 'Deactivate' : 'Activate',
        onPress: () => void toggleStatus(item)
      }
    ]
    if (canDelete) {
      buttons.push({ text: 'Delete', style: 'destructive', onPress: () => deleteUser(item) })
    }
    buttons.push({ text: 'Cancel', style: 'cancel' })
    Alert.alert(item.name || item.email, item.email, buttons)
  }

  const renderUser = ({ item }: { item: ErpUserRecord }) => {
    const online = isUserOnline(item)
    const color = roleColor(item.role)
    const metaParts = [roleLabel(item.role), item.department || null].filter(Boolean)
    const lastSeen = online ? null : formatLastSeen(item)

    return (
      <Pressable
        style={({ pressed }) => [styles.userRow, pressed && styles.cardPressed]}
        onPress={() => navigation.navigate('UserForm', { userId: item.id })}
        onLongPress={() => openUserActions(item)}
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: `${color}22` }]}>
            <Text style={[styles.avatarText, { color }]}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={[styles.presenceDot, online ? styles.presenceDotOnline : styles.presenceDotOffline]} />
        </View>
        <View style={styles.userBody}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.presencePill, online ? styles.presenceOnline : styles.presenceOffline]}>
              <Text
                style={[styles.presenceText, online ? styles.presenceTextOnline : styles.presenceTextOffline]}
              >
                {online ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          <Text style={styles.userSubline} numberOfLines={1}>
            {item.email}
          </Text>
          <Text style={styles.userMeta} numberOfLines={1}>
            {[...metaParts, lastSeen].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable
          style={[styles.statusPill, item.status === 'Active' ? styles.statusActive : styles.statusInactive]}
          onPress={(e) => {
            e.stopPropagation?.()
            void toggleStatus(item)
          }}
        >
          <Text style={styles.statusText}>{item.status === 'Active' ? 'On' : 'Off'}</Text>
        </Pressable>
        <FontAwesome5 name="chevron-right" size={10} color={erp.textSubtle} style={styles.chevron} />
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
        <StatCard label="Online" value={stats.online} icon="circle" color="#16a34a" styles={styles} erp={erp} />
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
    list: { padding: 16, paddingBottom: 32, gap: 6 },
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
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10
    },
    cardPressed: { opacity: 0.92 },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarText: { fontSize: 13, fontWeight: '700' },
    presenceDot: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: erp.surface
    },
    presenceDotOnline: { backgroundColor: '#22c55e' },
    presenceDotOffline: { backgroundColor: '#9ca3af' },
    userBody: { flex: 1, minWidth: 0, gap: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
    userName: { fontSize: 14, fontWeight: '600', color: erp.text, flexShrink: 1 },
    presencePill: {
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 5,
      flexShrink: 0
    },
    presenceOnline: { backgroundColor: '#dcfce7' },
    presenceOffline: { backgroundColor: erp.border },
    presenceText: { fontSize: 9, fontWeight: '700' },
    presenceTextOnline: { color: '#16a34a' },
    presenceTextOffline: { color: erp.textSubtle },
    userSubline: { fontSize: 11, color: erp.textMuted },
    userMeta: { fontSize: 10, color: erp.textSubtle },
    statusPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, minWidth: 28, alignItems: 'center' },
    statusActive: { backgroundColor: '#dcfce7' },
    statusInactive: { backgroundColor: erp.border },
    statusText: { fontSize: 9, fontWeight: '700', color: erp.text },
    chevron: { marginLeft: 2 },
    emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 12 },
    empty: { color: erp.textMuted, fontSize: 14 },
    denied: { alignItems: 'center', paddingVertical: 48, gap: 12 },
    deniedTitle: { fontSize: 20, fontWeight: '700', color: erp.text },
    deniedText: { fontSize: 14, color: erp.textMuted, textAlign: 'center', lineHeight: 20 },
    deniedBtn: { marginTop: 8, backgroundColor: erp.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
    deniedBtnText: { color: '#fff', fontWeight: '600' }
  })
