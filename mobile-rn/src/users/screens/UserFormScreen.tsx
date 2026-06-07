import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { DEPARTMENTS, USER_STATUSES } from '../constants'
import { usersApi } from '../api'
import { FormField } from '../components/FormField'
import { OptionChips } from '../components/OptionChips'
import { PermissionToggles } from '../components/PermissionToggles'
import { ProjectPicker } from '../components/ProjectPicker'
import type { UsersStackParamList } from '../navigation'
import type { UserFormData } from '../types'
import { isAdminUser, normalizeStatus, roleDefinitionsForActor } from '../utils'

type Props = NativeStackScreenProps<UsersStackParamList, 'UserForm'>

const EMPTY_FORM: UserFormData = {
  name: '',
  email: '',
  phone: '',
  role: 'user',
  department: '',
  status: 'Active',
  customPermissions: [],
  accessibleProjectIds: []
}

export function UserFormScreen({ navigation, route }: Props) {
  const { userId } = route.params
  const isEdit = Boolean(userId)
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user: currentUser } = useAuth()
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)

  const roleDefs = useMemo(() => roleDefinitionsForActor(currentUser), [currentUser])
  const roleOptions = useMemo(
    () =>
      Object.entries(roleDefs).map(([value, def]) => ({
        value,
        label: def.name
      })),
    [roleDefs]
  )

  useEffect(() => {
    if (!isEdit || !accessToken || !userId) return
    let cancelled = false
    setLoading(true)
    usersApi
      .getUser(accessToken, userId)
      .then((user) => {
        if (cancelled) return
        setForm({
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          role: user.role || 'user',
          department: user.department || '',
          status: normalizeStatus(user.status),
          customPermissions: user.permissions || [],
          accessibleProjectIds: user.accessibleProjectIds || []
        })
      })
      .catch((e) => {
        if (!cancelled) {
          Alert.alert('Load failed', e instanceof Error ? e.message : 'Could not load user', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, accessToken, userId, navigation])

  const update = <K extends keyof UserFormData>(key: K, value: UserFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'role' && value !== 'guest') {
        next.accessibleProjectIds = []
      }
      return next
    })
  }

  const save = async () => {
    if (!accessToken || !isAdminUser(currentUser)) return
    if (!form.name.trim() || !form.email.trim() || !form.role) {
      Alert.alert('Validation', 'Name, email, and role are required')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email.trim())) {
      Alert.alert('Validation', 'Enter a valid email address')
      return
    }

    setSaving(true)
    try {
      if (isEdit && userId) {
        await usersApi.updateUser(accessToken, userId, form)
        Alert.alert('Saved', 'User updated successfully', [{ text: 'OK', onPress: () => navigation.goBack() }])
      } else {
        const result = await usersApi.createUser(accessToken, form)
        const tempPassword = result.tempPassword
        if (tempPassword) {
          Alert.alert(
            'User created',
            `A temporary password was generated.\n\nEmail: ${form.email}\nPassword: ${tempPassword}\n\nShare it securely. The user must change it on first login.`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          )
        } else {
          Alert.alert('Saved', result.message || 'User created successfully', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ])
        }
      }
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save user')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <ModuleHeader title={isEdit ? 'Edit user' : 'Add user'} showBack />
        <ActivityIndicator style={styles.loader} color={erp.primary} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ModuleHeader
        title={isEdit ? 'Edit user' : 'Add user'}
        subtitle={isEdit ? 'Update account and permissions' : 'Create a new account'}
        showBack
      />
      <ScreenBody padded={false}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Basic information</Text>
          <FormField label="Full name" value={form.name} onChangeText={(v) => update('name', v)} required />
          <FormField
            label="Email"
            value={form.email}
            onChangeText={(v) => update('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            required
          />
          <FormField
            label="Phone"
            value={form.phone}
            onChangeText={(v) => update('phone', v)}
            keyboardType="phone-pad"
          />
          <OptionChips
            label="Status"
            value={form.status}
            options={USER_STATUSES.map((s) => ({ value: s, label: s }))}
            onChange={(v) => update('status', v)}
          />

          <Text style={styles.section}>Role & department</Text>
          <OptionChips label="Role" value={form.role} options={roleOptions} onChange={(v) => update('role', v)} />
          <OptionChips
            label="Department"
            value={form.department}
            options={[{ value: '', label: 'None' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]}
            onChange={(v) => update('department', v)}
          />

          {form.role === 'guest' && accessToken ? (
            <ProjectPicker
              token={accessToken}
              selectedIds={form.accessibleProjectIds}
              onChange={(ids) => update('accessibleProjectIds', ids)}
            />
          ) : null}

          <Pressable style={styles.permToggle} onPress={() => setShowPermissions((v) => !v)}>
            <Text style={styles.permToggleText}>
              {showPermissions ? 'Hide custom permissions' : 'Customize module permissions'}
            </Text>
          </Pressable>
          {showPermissions ? (
            <PermissionToggles
              role={form.role}
              customPermissions={form.customPermissions}
              onChange={(perms) => update('customPermissions', perms)}
            />
          ) : null}

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => void save()}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}</Text>
          </Pressable>
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    loader: { marginTop: 40 },
    form: { padding: 16, gap: 14, paddingBottom: 40 },
    section: { fontSize: 15, fontWeight: '700', color: erp.text, marginTop: 4 },
    permToggle: { paddingVertical: 10 },
    permToggleText: { fontSize: 14, fontWeight: '600', color: erp.primary },
    saveBtn: {
      backgroundColor: erp.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 }
  })
