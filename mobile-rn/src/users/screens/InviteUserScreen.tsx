import React, { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { DEPARTMENTS } from '../constants'
import { usersApi } from '../api'
import { FormField } from '../components/FormField'
import { OptionChips } from '../components/OptionChips'
import { ProjectPicker } from '../components/ProjectPicker'
import type { UsersStackParamList } from '../navigation'
import type { InviteFormData } from '../types'
import { isAdminUser, roleDefinitionsForActor } from '../utils'

type Props = NativeStackScreenProps<UsersStackParamList, 'InviteUser'>

const EMPTY_FORM: InviteFormData = {
  name: '',
  email: '',
  role: 'user',
  department: '',
  accessibleProjectIds: []
}

export function InviteUserScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user: currentUser } = useAuth()
  const [form, setForm] = useState<InviteFormData>(EMPTY_FORM)
  const [sending, setSending] = useState(false)

  const roleDefs = useMemo(() => roleDefinitionsForActor(currentUser), [currentUser])
  const roleOptions = useMemo(
    () =>
      Object.entries(roleDefs).map(([value, def]) => ({
        value,
        label: def.name
      })),
    [roleDefs]
  )

  const update = <K extends keyof InviteFormData>(key: K, value: InviteFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'role' && value !== 'guest') {
        next.accessibleProjectIds = []
      }
      return next
    })
  }

  const send = async () => {
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

    setSending(true)
    try {
      const result = await usersApi.inviteUser(accessToken, form)
      Alert.alert(
        'Invitation sent',
        result.message ||
          `Invitation sent to ${form.email}. They will receive an email with instructions to create their account.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (e) {
      Alert.alert('Invite failed', e instanceof Error ? e.message : 'Could not send invitation')
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.root}>
      <ModuleHeader title="Invite user" subtitle="Send an email invitation" showBack />
      <ScreenBody padded={false}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <FormField label="Full name" value={form.name} onChangeText={(v) => update('name', v)} required />
          <FormField
            label="Email"
            value={form.email}
            onChangeText={(v) => update('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            required
          />
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

          <Text style={styles.note}>
            The invitee will receive an email with a link to create their account. Invitations expire after 7 days.
          </Text>

          <Pressable
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={() => void send()}
            disabled={sending}
          >
            <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send invitation'}</Text>
          </Pressable>
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    form: { padding: 16, gap: 14, paddingBottom: 40 },
    note: { fontSize: 12, color: erp.textMuted, lineHeight: 18 },
    sendBtn: {
      backgroundColor: '#16a34a',
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8
    },
    sendBtnDisabled: { opacity: 0.6 },
    sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 }
  })
