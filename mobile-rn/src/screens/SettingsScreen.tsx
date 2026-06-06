import React, { useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { APP_VERSION, APP_VERSION_CODE } from '../jobcards/theme'
import { OTA_RUNTIME_VERSION } from '../constants/ota'
import { AppHeader } from '../components/shell/AppHeader'
import { ScreenBody } from '../components/shell/ScreenBody'
import { API_BASE_URL } from '../config'
import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck'
import { useOTAUpdates } from '../hooks/useOTAUpdates'
import { useAuth } from '../state/AuthContext'
import type { RootStackParamList } from '../navigation/types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>

export function SettingsScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp, mode, setMode } = useTheme()
  const { user, signOut } = useAuth()
  const { checkForOTAUpdate, otaEnabled, runtimeVersion, updateId, isEmbeddedLaunch } =
    useOTAUpdates(false)
  const { checkForUpdate: checkApkUpdate } = useAppUpdateCheck(false)
  const [checking, setChecking] = useState<'ota' | 'apk' | null>(null)

  async function onCheckOta() {
    setChecking('ota')
    try {
      const result = await checkForOTAUpdate(true)
      if (result.status === 'dev') {
        Alert.alert(
          'Development build',
          'OTA updates do not apply in debug/dev builds. Install the release APK from abcoafrica.co.za.'
        )
      } else if (result.status === 'disabled') {
        Alert.alert(
          'OTA disabled',
          'This build has JS updates turned off. Install the release APK from abcoafrica.co.za.'
        )
      } else if (result.status === 'current') {
        const rv = runtimeVersion || OTA_RUNTIME_VERSION
        const hint = isEmbeddedLaunch
          ? '\n\nStill on the factory bundle — fully close the app (swipe away), reopen, wait a few seconds, then open Settings again.'
          : ''
        Alert.alert('Up to date', `Server has no newer JS bundle for runtime ${rv}.${hint}`)
      } else if (result.status === 'downloaded' && !result.willReload) {
        Alert.alert(
          'Update downloaded',
          'Fully close the app and reopen it to apply the update.',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart now',
              onPress: () => {
                void import('expo-updates').then(({ reloadAsync }) => reloadAsync())
              }
            }
          ]
        )
      } else if (result.status === 'unsupported') {
        Alert.alert('Not supported', 'OTA updates are Android-only in this build.')
      } else if (result.status === 'error') {
        Alert.alert('Update check failed', result.message)
      }
    } finally {
      setChecking(null)
    }
  }

  async function onCheckApk() {
    setChecking('apk')
    try {
      if (Platform.OS !== 'android') return
      const res = await fetch(`${API_BASE_URL}/api/public/mobile-app-version`, {
        headers: { Accept: 'application/json' }
      })
      const payload = res.ok ? await res.json() : null
      const remote = (payload?.data || payload)?.android
      if (remote?.forceApkInstall && remote.versionCode > APP_VERSION_CODE) {
        await checkApkUpdate()
        return
      }
      Alert.alert(
        'APK up to date',
        'Your installed app shell is current. UI changes (like the theme toggle) come via JS update — use “Check for JS update (OTA)” above, then fully restart the app.'
      )
    } finally {
      setChecking(null)
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Settings" />
      <ScreenBody>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.value}>{user?.name || user?.email}</Text>
            {user?.role ? <Text style={styles.meta}>{user.role}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Theme</Text>
            <View style={styles.segmentRow}>
              <AppearanceOption
                label="Light"
                icon="sun"
                selected={mode === 'light'}
                onPress={() => setMode('light')}
              />
              <AppearanceOption
                label="Dark"
                icon="moon"
                selected={mode === 'dark'}
                onPress={() => setMode('dark')}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <Pressable
            style={styles.linkBtn}
            onPress={() => navigation.navigate('DashboardCustomize')}
          >
            <FontAwesome5 name="sliders-h" size={16} color={erp.primary} />
            <Text style={styles.linkBtnText}>Customize dashboard widgets</Text>
            <FontAwesome5 name="chevron-right" size={12} color={erp.textSubtle} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.card}>
            <Row icon="server" label="Server" value={API_BASE_URL} />
            <Row icon="mobile-alt" label="App version" value={`${APP_VERSION} (${APP_VERSION_CODE})`} />
            <Row icon="code-branch" label="JS updates (OTA)" value={otaEnabled ? 'Self-hosted' : 'Off'} />
            {otaEnabled ? (
              <>
                <Row icon="layer-group" label="Runtime" value={runtimeVersion || OTA_RUNTIME_VERSION} />
                {updateId ? (
                  <Row icon="fingerprint" label="Bundle ID" value={updateId.slice(0, 12) + '…'} />
                ) : null}
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Updates</Text>
          <Pressable
            style={[styles.updateBtn, checking === 'ota' && styles.updateBtnBusy]}
            disabled={checking !== null}
            onPress={() => void onCheckOta()}
          >
            {checking === 'ota' ? (
              <ActivityIndicator color={erp.primary} />
            ) : (
              <>
                <FontAwesome5 name="sync" size={16} color={erp.primary} />
                <Text style={styles.updateBtnText}>Check for JS update (OTA)</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.updateBtn, checking === 'apk' && styles.updateBtnBusy]}
            disabled={checking !== null}
            onPress={() => void onCheckApk()}
          >
            {checking === 'apk' ? (
              <ActivityIndicator color={erp.primary} />
            ) : (
              <>
                <FontAwesome5 name="download" size={16} color={erp.primary} />
                <Text style={styles.updateBtnText}>Check for new APK</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.updateHint}>
            Updates install automatically when you open the app — no action needed. Use the buttons
            above only if you want to check manually. A new APK is required only when native modules
            change (rare).
          </Text>
        </View>

        <Pressable style={styles.signOutBtn} onPress={() => void signOut()}>
          <FontAwesome5 name="sign-out-alt" size={16} color={erp.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Dashboard')}>
          <Text style={styles.backText}>Back to dashboard</Text>
        </Pressable>
      </ScreenBody>
    </View>
  )
}

function AppearanceOption({
  label,
  icon,
  selected,
  onPress
}: {
  label: string
  icon: string
  selected: boolean
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  return (
    <Pressable
      style={[styles.segmentOption, selected && styles.segmentOptionSelected]}
      onPress={onPress}
    >
      <FontAwesome5 name={icon as never} size={14} color={selected ? erp.primary : erp.textMuted} />
      <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{label}</Text>
    </Pressable>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  return (
    <View style={styles.row}>
      <FontAwesome5 name={icon as never} size={14} color={erp.textMuted} style={{ width: 20 }} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    section: { marginTop: 8, marginBottom: 16 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: erp.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8
    },
    card: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      borderWidth: 1,
      borderColor: erp.border,
      padding: 16,
      ...erp.shadowSm
    },
    label: { fontSize: 12, color: erp.textMuted },
    value: { fontSize: 17, fontWeight: '800', color: erp.text, marginTop: 4 },
    meta: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
    segmentRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    segmentOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: erp.radius.md,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surfaceMuted
    },
    segmentOptionSelected: {
      borderColor: erp.primary,
      backgroundColor: erp.primarySoft
    },
    segmentLabel: { fontSize: 14, fontWeight: '600', color: erp.textMuted },
    segmentLabelSelected: { color: erp.primary, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    rowLabel: { flex: 1, color: erp.text, fontWeight: '600' },
    rowValue: { color: erp.textMuted, fontSize: 13, maxWidth: '50%', textAlign: 'right' },
    updateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 14,
      marginBottom: 10,
      ...erp.shadowSm
    },
    updateBtnBusy: { opacity: 0.7 },
    updateBtnText: { color: erp.text, fontWeight: '700', fontSize: 15 },
    updateHint: { fontSize: 12, color: erp.textMuted, lineHeight: 18, marginTop: 4 },
    linkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.lg,
      padding: 16,
      ...erp.shadowSm
    },
    linkBtnText: { flex: 1, color: erp.text, fontWeight: '700', fontSize: 15 },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: erp.dangerSoft,
      padding: 14,
      borderRadius: erp.radius.md,
      marginTop: 8
    },
    signOutText: { color: erp.danger, fontWeight: '700', fontSize: 16 },
    backBtn: { padding: 16, alignItems: 'center' },
    backText: { color: erp.primary, fontWeight: '600' }
  })
}
