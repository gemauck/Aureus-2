import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
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

type RemoteVersion = {
  versionCode?: number
  versionName?: string
  apkUrl?: string
  releaseNotes?: string
  forceApkInstall?: boolean
}

type CheckState = 'ota-check' | 'ota-download' | 'ota-apply' | 'apk-check' | 'apk-download' | null

const OTA_MANIFEST_URL = `${API_BASE_URL}/api/public/mobile-ota/manifest`
const DEFAULT_APK_URL = `${API_BASE_URL}/public/downloads/Abcotronics-ERP-Mobile.apk`

function formatWhen(iso: string | null): string {
  if (!iso) return 'Not checked yet'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function SettingsScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp, preference, setPreference } = useTheme()
  const { user, signOut } = useAuth()
  const {
    checkForOTAUpdate,
    downloadOTAUpdate,
    applyDownloadedUpdate,
    otaEnabled,
    otaChannel,
    runtimeVersion,
    updateId,
    isEmbeddedLaunch
  } = useOTAUpdates(false)
  const { checkForUpdate: checkApkUpdate } = useAppUpdateCheck(false)
  const [checking, setChecking] = useState<CheckState>(null)
  const [remoteVersion, setRemoteVersion] = useState<RemoteVersion | null>(null)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [lastOtaCheck, setLastOtaCheck] = useState<string | null>(null)
  const [lastApkCheck, setLastApkCheck] = useState<string | null>(null)
  const [otaStatus, setOtaStatus] = useState<string>(
    'JS updates download in the background after login. You are asked before the app restarts to apply them. APK install is only needed for rare native shell changes.'
  )

  const refreshRemoteVersion = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/mobile-app-version`, {
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) {
        setRemoteError(`Server returned ${res.status}`)
        return null
      }
      const payload = await res.json()
      const remote = ((payload?.data || payload)?.android || null) as RemoteVersion | null
      setRemoteVersion(remote)
      setRemoteError(null)
      return remote
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reach server'
      setRemoteError(message)
      return null
    }
  }, [])

  useEffect(() => {
    void refreshRemoteVersion()
  }, [refreshRemoteVersion])

  function noteOtaResult(result: Awaited<ReturnType<typeof checkForOTAUpdate>>) {
    setLastOtaCheck(new Date().toISOString())
    if (result.status === 'current') {
      setOtaStatus('Up to date — no newer JS bundle on the server.')
    } else if (result.status === 'downloaded') {
      setOtaStatus(
        result.willReload
          ? 'Update downloaded — restarting to apply.'
          : 'Update downloaded — tap Apply update when you are ready to restart.'
      )
    } else if (result.status === 'error') {
      setOtaStatus(`Last check failed: ${result.message}`)
    } else if (result.status === 'dev') {
      setOtaStatus('Development build — OTA updates do not apply.')
    } else if (result.status === 'disabled') {
      setOtaStatus('OTA is disabled in this build.')
    } else if (result.status === 'unsupported') {
      setOtaStatus('OTA is Android-only in this build.')
    }
  }

  async function onCheckOta() {
    setChecking('ota-check')
    try {
      const result = await checkForOTAUpdate(true)
      noteOtaResult(result)
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
        Alert.alert('Up to date', `Server has no newer JS bundle for runtime ${rv}.`)
      } else if (result.status === 'downloaded' && !result.willReload) {
        Alert.alert(
          'Update downloaded',
          'Tap Apply update below to restart and use the new version.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Apply now', onPress: () => void onApplyOta() }
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

  async function onDownloadOta() {
    setChecking('ota-download')
    try {
      const result = await downloadOTAUpdate()
      noteOtaResult(result)
      if (result.status === 'current') {
        Alert.alert('Already current', 'The server has no newer JS bundle to download.')
      } else if (result.status === 'downloaded') {
        Alert.alert(
          'Download complete',
          'The latest JS bundle is ready. Tap Apply update to restart.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Apply now', onPress: () => void onApplyOta() }
          ]
        )
      } else if (result.status === 'dev') {
        Alert.alert('Development build', 'OTA downloads do not apply in debug/dev builds.')
      } else if (result.status === 'disabled') {
        Alert.alert('OTA disabled', 'This build has JS updates turned off.')
      } else if (result.status === 'unsupported') {
        Alert.alert('Not supported', 'OTA updates are Android-only in this build.')
      } else if (result.status === 'error') {
        Alert.alert('Download failed', result.message)
      }
    } finally {
      setChecking(null)
    }
  }

  async function onApplyOta() {
    setChecking('ota-apply')
    try {
      await applyDownloadedUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not restart the app'
      Alert.alert('Apply failed', message)
    } finally {
      setChecking(null)
    }
  }

  async function onCheckApk() {
    setChecking('apk-check')
    try {
      const remote = await refreshRemoteVersion()
      setLastApkCheck(new Date().toISOString())
      if (Platform.OS !== 'android') {
        Alert.alert('Android only', 'APK updates apply to the Android app.')
        return
      }
      if (!remote?.versionCode) {
        Alert.alert('Check failed', remoteError || 'Could not read version from server.')
        return
      }
      if (remote.versionCode > APP_VERSION_CODE) {
        if (remote.forceApkInstall) {
          await checkApkUpdate()
          return
        }
        const url = remote.apkUrl || DEFAULT_APK_URL
        Alert.alert(
          'New APK available',
          remote.releaseNotes ||
            `Version ${remote.versionName || remote.versionCode} is available (you have build ${APP_VERSION_CODE}). Download and install to update the app shell.`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Download', onPress: () => void Linking.openURL(url) }
          ]
        )
        return
      }
      Alert.alert(
        'APK up to date',
        'Your installed app shell matches the server. UI changes come via JS update — use Check for JS update above.'
      )
    } finally {
      setChecking(null)
    }
  }

  async function onDownloadApk() {
    setChecking('apk-download')
    try {
      const remote = await refreshRemoteVersion()
      const url = remote?.apkUrl || DEFAULT_APK_URL
      await Linking.openURL(url)
    } catch (error) {
      const remote = await refreshRemoteVersion()
      const url = remote?.apkUrl || DEFAULT_APK_URL
      Alert.alert('Download', `Could not open the link automatically. Open this URL in your browser:\n\n${url}`)
    } finally {
      setChecking(null)
    }
  }

  const apkNeedsUpdate =
    Platform.OS === 'android' &&
    !!remoteVersion?.versionCode &&
    remoteVersion.versionCode > APP_VERSION_CODE
  const apkRequiresInstall = apkNeedsUpdate && !!remoteVersion?.forceApkInstall

  return (
    <View style={styles.root}>
      <AppHeader title="Settings" />
      <ScreenBody padded={false}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
                  label="System"
                  icon="mobile-alt"
                  selected={preference === 'system'}
                  onPress={() => setPreference('system')}
                />
                <AppearanceOption
                  label="Light"
                  icon="sun"
                  selected={preference === 'light'}
                  onPress={() => setPreference('light')}
                />
                <AppearanceOption
                  label="Dark"
                  icon="moon"
                  selected={preference === 'dark'}
                  onPress={() => setPreference('dark')}
                />
              </View>
              {preference === 'system' ? (
                <Text style={styles.themeHint}>Matches your device light or dark setting.</Text>
              ) : null}
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
            <Text style={styles.sectionTitle}>App details</Text>
            <View style={styles.card}>
              <DetailRow icon="server" label="API server" value={API_BASE_URL} />
              <DetailRow icon="mobile-alt" label="App version" value={`${APP_VERSION} (build ${APP_VERSION_CODE})`} />
              <DetailRow icon="android" label="Platform" value={Platform.OS === 'android' ? 'Android' : Platform.OS} />
              <DetailRow
                icon="cloud-download-alt"
                label="Server APK version"
                value={
                  remoteVersion?.versionName
                    ? `${remoteVersion.versionName} (build ${remoteVersion.versionCode ?? '?'})`
                    : remoteError
                      ? `Unavailable — ${remoteError}`
                      : 'Loading…'
                }
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>JS bundle (OTA)</Text>
            <View style={styles.card}>
              <DetailRow
                icon="code-branch"
                label="OTA status"
                value={otaEnabled ? 'Enabled (self-hosted)' : 'Disabled in this build'}
              />
              {otaEnabled ? (
                <>
                  <DetailRow icon="layer-group" label="Runtime version" value={runtimeVersion || OTA_RUNTIME_VERSION} />
                  <DetailRow icon="broadcast-tower" label="Channel" value={otaChannel || 'production'} />
                  <DetailRow
                    icon="box-open"
                    label="Launch source"
                    value={isEmbeddedLaunch ? 'Embedded (shipped with APK)' : 'Downloaded OTA bundle'}
                  />
                  <DetailRow
                    icon="fingerprint"
                    label="Current bundle ID"
                    value={updateId || 'Embedded bundle (no OTA id yet)'}
                    mono
                  />
                  <DetailRow icon="link" label="Update manifest" value={OTA_MANIFEST_URL} mono />
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Updates</Text>
            <View style={styles.card}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusText}>{otaStatus}</Text>
              {apkRequiresInstall ? (
                <View style={styles.banner}>
                  <FontAwesome5 name="exclamation-circle" size={14} color={erp.warning} />
                  <Text style={styles.bannerText}>
                    A new APK is required before JS updates can continue (
                    {remoteVersion?.versionName || remoteVersion?.versionCode}).
                  </Text>
                </View>
              ) : null}
              {remoteVersion?.releaseNotes ? (
                <>
                  <Text style={[styles.statusLabel, styles.statusLabelSpaced]}>Release notes</Text>
                  <Text style={styles.releaseNotes}>{remoteVersion.releaseNotes}</Text>
                </>
              ) : null}
              <DetailRow icon="history" label="Last JS check" value={formatWhen(lastOtaCheck)} compact />
              <DetailRow icon="history" label="Last APK check" value={formatWhen(lastApkCheck)} compact />
            </View>

            <Text style={styles.actionGroupTitle}>JS updates</Text>
            <Text style={styles.actionGroupHint}>
              Automatic checks run on launch, when returning to the app, and every few minutes while open.
            </Text>
            <UpdateButton
              icon="sync"
              label="Check for JS update"
              busy={checking === 'ota-check'}
              disabled={checking !== null}
              onPress={() => void onCheckOta()}
            />
            <UpdateButton
              icon="download"
              label="Download latest JS bundle"
              busy={checking === 'ota-download'}
              disabled={checking !== null || !otaEnabled}
              onPress={() => void onDownloadOta()}
            />
            <UpdateButton
              icon="redo"
              label="Apply downloaded update"
              busy={checking === 'ota-apply'}
              disabled={checking !== null || !otaEnabled}
              onPress={() => void onApplyOta()}
              hint="Restarts the app to load a downloaded bundle."
            />

            <Text style={styles.actionGroupTitle}>APK (native shell)</Text>
            <Text style={styles.actionGroupHint}>
              Only needed when native modules or permissions change — usually rare.
            </Text>
            <UpdateButton
              icon="search"
              label="Check for new APK"
              busy={checking === 'apk-check'}
              disabled={checking !== null}
              onPress={() => void onCheckApk()}
            />
            <UpdateButton
              icon="file-download"
              label="Download APK"
              busy={checking === 'apk-download'}
              disabled={checking !== null}
              onPress={() => void onDownloadApk()}
              hint={remoteVersion?.apkUrl || DEFAULT_APK_URL}
            />
          </View>

          <Pressable style={styles.signOutBtn} onPress={() => void signOut()}>
            <FontAwesome5 name="sign-out-alt" size={16} color={erp.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Dashboard')}>
            <Text style={styles.backText}>Back to dashboard</Text>
          </Pressable>
        </ScrollView>
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

function DetailRow({
  icon,
  label,
  value,
  mono = false,
  compact = false
}: {
  icon: string
  label: string
  value: string
  mono?: boolean
  compact?: boolean
}) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  return (
    <View style={[styles.detailRow, compact && styles.detailRowCompact]}>
      <View style={styles.detailHeader}>
        <FontAwesome5 name={icon as never} size={13} color={erp.textMuted} style={{ width: 18 }} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={[styles.detailValue, mono && styles.detailValueMono]} selectable>
        {value}
      </Text>
    </View>
  )
}

function UpdateButton({
  icon,
  label,
  hint,
  busy,
  disabled,
  onPress
}: {
  icon: string
  label: string
  hint?: string
  busy: boolean
  disabled: boolean
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  return (
    <View style={styles.updateBtnWrap}>
      <Pressable
        style={[styles.updateBtn, (busy || disabled) && styles.updateBtnBusy]}
        disabled={disabled}
        onPress={onPress}
      >
        {busy ? (
          <ActivityIndicator color={erp.primary} />
        ) : (
          <>
            <FontAwesome5 name={icon as never} size={16} color={erp.primary} />
            <Text style={styles.updateBtnText}>{label}</Text>
          </>
        )}
      </Pressable>
      {hint ? <Text style={styles.updateBtnHint}>{hint}</Text> : null}
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    scroll: {
      paddingHorizontal: erp.space.lg,
      paddingTop: 8,
      paddingBottom: 32
    },
    section: { marginBottom: 20 },
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
    segmentLabel: { fontSize: 13, fontWeight: '600', color: erp.textMuted },
    segmentLabelSelected: { color: erp.primary, fontWeight: '700' },
    themeHint: { fontSize: 12, color: erp.textMuted, marginTop: 10, lineHeight: 18 },
    detailRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: erp.border
    },
    detailRowCompact: { paddingVertical: 8 },
    detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    detailLabel: { fontSize: 12, fontWeight: '600', color: erp.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    detailValue: { fontSize: 14, color: erp.text, lineHeight: 20 },
    detailValueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
    statusLabel: { fontSize: 12, fontWeight: '700', color: erp.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    statusLabelSpaced: { marginTop: 14 },
    statusText: { fontSize: 14, color: erp.text, lineHeight: 20, marginTop: 6 },
    releaseNotes: { fontSize: 13, color: erp.textMuted, lineHeight: 19, marginTop: 6 },
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 12,
      padding: 12,
      borderRadius: erp.radius.md,
      backgroundColor: erp.warningSoft,
      borderWidth: 1,
      borderColor: erp.warning
    },
    bannerText: { flex: 1, fontSize: 13, color: erp.text, lineHeight: 18 },
    actionGroupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: erp.text,
      marginTop: 16,
      marginBottom: 4
    },
    actionGroupHint: { fontSize: 12, color: erp.textMuted, lineHeight: 18, marginBottom: 10 },
    updateBtnWrap: { marginBottom: 10 },
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
      ...erp.shadowSm
    },
    updateBtnBusy: { opacity: 0.65 },
    updateBtnText: { color: erp.text, fontWeight: '700', fontSize: 15 },
    updateBtnHint: { fontSize: 11, color: erp.textMuted, marginTop: 4, lineHeight: 16 },
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
      marginTop: 4
    },
    signOutText: { color: erp.danger, fontWeight: '700', fontSize: 16 },
    backBtn: { padding: 16, alignItems: 'center' },
    backText: { color: erp.primary, fontWeight: '600' }
  })
}
